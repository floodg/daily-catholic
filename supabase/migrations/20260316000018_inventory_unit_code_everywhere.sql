begin;

-- 2026-03-16: Ensure all inventory_transactions writers set unit_code explicitly
-- so inventory_stock_levels can display correct measurement units.

-- 1) Update purchase trigger to write unit_code alongside unit.

create or replace function public.create_inventory_transaction_for_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id         uuid;
  v_quantity_delta  numeric(10,2);
  v_ingredient_name text;
begin
  -- Resolve the owning user from the parent shopping_trips row
  select user_id
    into v_user_id
    from public.shopping_trips
   where id = NEW.shopping_trip_id;

  if v_user_id is null then
    raise exception 'shopping_trip % not found', NEW.shopping_trip_id;
  end if;

  -- Resolve canonical ingredient name via store_product_id FK chain,
  -- preferring a name that matches NEW.ingredient_name when present.
  if NEW.store_product_id is not null then
    select smi.name
      into v_ingredient_name
      from public.starter_meal_ingredients smi
     where smi.store_product_id = NEW.store_product_id
     order by
       case
         when NEW.ingredient_name is not null
              and lower(smi.name) = lower(NEW.ingredient_name) then 0
         else 1
       end,
       smi.name asc
     limit 1;
  end if;

  -- Fall back to the carried ingredient_name (from Add from Meal) when set
  if v_ingredient_name is null and NEW.ingredient_name is not null then
    v_ingredient_name := NEW.ingredient_name;
  end if;

  -- Final fallback to raw product_name for manually-entered items
  if v_ingredient_name is null then
    v_ingredient_name := NEW.product_name;
  end if;

  -- Calculate total quantity added to inventory
  if NEW.pack_quantity is not null then
    v_quantity_delta := NEW.pack_quantity * NEW.quantity_purchased;
  else
    v_quantity_delta := NEW.quantity_purchased;
  end if;

  insert into public.inventory_transactions (
    user_id,
    ingredient_name,
    quantity_delta,
    unit,
    unit_code,
    transaction_type,
    source_type,
    source_id,
    occurred_at
  ) values (
    v_user_id,
    v_ingredient_name,
    v_quantity_delta,
    NEW.pack_unit,
    lower(coalesce(NEW.pack_unit, 'units')),
    'purchase',
    'shopping_trip_item',
    NEW.id,
    now()
  );

  return NEW;
end;
$$;

-- 2) Update mark_meal_eaten to write unit_code matching the structured unit.

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
        unit_code,
        transaction_type,
        source_type,
        source_id,
        occurred_at
      ) values (
        p_user_id,
        v_ingredient.ingredient_name,
        -v_qty_consumed,
        v_ingredient.unit,
        lower(v_ingredient.unit),
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

