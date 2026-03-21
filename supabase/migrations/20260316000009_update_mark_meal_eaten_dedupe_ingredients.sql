begin;

-- 2026-03-16: Deduplicate ingredient join to avoid double consumption rows
-- Some databases contain case-variant duplicates in ingredients (e.g. "Beef Mince"
-- and "Beef mince"). The previous lower(name) equality join could return
-- multiple rows for a single meal_ingredient, inserting duplicate -qty ledger
-- entries. Use a LATERAL subquery to pick a single canonical match per row,
-- preferring exact-case matches.

create or replace function public.mark_meal_eaten(
  p_planned_meal_id uuid,
  p_user_id         uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_meal_id        uuid;
  v_status         text;
  v_servings       integer;
  v_ingredient     record;
  v_pantry         record;
  v_qty_needed     numeric;
  v_qty_consumed   numeric;
begin
  -- Lock the planned meal row for update and validate ownership
  select meal_id, status, coalesce(servings, 1)
    into v_meal_id, v_status, v_servings
  from public.planned_meals
  where id = p_planned_meal_id
    and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'planned_meal not found');
  end if;

  -- Guard: already completed
  if v_status = 'completed' then
    return jsonb_build_object('error', 'already_eaten');
  end if;

  -- Iterate ingredients via a deduplicated ingredient lookup
  for v_ingredient in
    select
      ing.ingredient_id,
      ing.ingredient_name,
      mi.quantity,
      mi.unit,
      ing.pantry_staple
    from public.meal_ingredients mi
    join lateral (
      select
        i.id   as ingredient_id,
        i.name as ingredient_name,
        i.pantry_staple
      from public.ingredients i
      where lower(i.name) = lower(mi.name)
      order by case when i.name = mi.name then 0 else 1 end, i.name asc
      limit 1
    ) ing on true
    where mi.meal_id = v_meal_id
      and mi.quantity is not null
      and mi.unit in ('g', 'ml', 'units')
  loop
    -- Skip pantry staples entirely
    continue when v_ingredient.pantry_staple = true;

    v_qty_needed := v_ingredient.quantity * v_servings;
    v_qty_consumed := null; -- will compute below

    -- Resolve matching pantry row for this (user, ingredient, unit)
    select *
      into v_pantry
    from public.pantry_inventory
    where user_id = p_user_id
      and ingredient_id = v_ingredient.ingredient_id
      and unit = v_ingredient.unit
    for update;

    if found then
      -- Cap consumed at purchased to avoid negative remaining in pantry
      v_qty_consumed := least(
        v_pantry.consumed_qty + v_qty_needed,
        v_pantry.purchased_qty
      ) - v_pantry.consumed_qty;

      if v_qty_consumed > 0 then
        update public.pantry_inventory
          set consumed_qty = v_pantry.consumed_qty + v_qty_consumed,
              updated_at   = now()
        where id = v_pantry.id;

        -- If stock hits zero and auto_reorder is enabled, add to shopping_list
        if (v_pantry.purchased_qty - (v_pantry.consumed_qty + v_qty_consumed)) <= 0
           and v_pantry.auto_reorder = true then
          -- Avoid duplicates (one open item per ingredient per user)
          if not exists (
            select 1 from public.shopping_list
             where user_id = p_user_id
               and lower(ingredient_name) = lower(v_ingredient.ingredient_name)
               and is_checked = false
          ) then
            insert into public.shopping_list
              (user_id, ingredient_name, unit, source)
            values
              (p_user_id, v_ingredient.ingredient_name, v_ingredient.unit, 'auto_out_of_stock');
          end if;
        end if;
      end if;
    else
      -- No pantry row exists: log full needed quantity to ledger below.
      v_qty_consumed := v_qty_needed;
    end if;

    -- Write a matching inventory ledger debit so UI stock reflects consumption.
    if coalesce(v_qty_consumed, 0) > 0 then
      insert into public.inventory_transactions (
        user_id,
        ingredient_name,
        quantity_delta,
        unit,
        transaction_type,
        source_type,
        source_id,
        occurred_at
      ) values (
        p_user_id,
        v_ingredient.ingredient_name,
        -v_qty_consumed,
        v_ingredient.unit,
        'meal_consumption',
        'planned_meal',
        p_planned_meal_id,
        now()
      );
    end if;
  end loop;

  -- Mark the planned meal as completed and record timestamp
  update public.planned_meals
    set status = 'completed',
        eaten_at = now()
  where id = p_planned_meal_id;

  return jsonb_build_object('success', true);
end;
$$;

commit;

