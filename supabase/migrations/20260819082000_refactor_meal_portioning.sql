begin;

-- Issue #71: make recipe "serving" quantities consumable from Pantry stock.
--
-- Pantry inventory stays in physical base units (g/ml/units). A recipe may now
-- express an ingredient as N servings. For serving-based ingredients we use
-- user_ingredient_nutrition.amount_per_unit as the physical size of one serving
-- in basis_unit (g or ml), then deduct that converted amount from inventory.

alter table public.meal_ingredients
  drop constraint if exists meal_ingredients_unit_check;

alter table public.meal_ingredients
  add constraint meal_ingredients_unit_check
  check (unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup', 'serving'));

-- Preserve the friendly legacy label while making existing "1 serving" rows
-- structured and therefore eligible for consumption.
update public.meal_ingredients
set quantity = (regexp_match(trim(quantity_label), '^([0-9]+(?:\.[0-9]+)?)\s+servings?$','i'))[1]::numeric,
    unit = 'serving'
where quantity is null
  and unit is null
  and trim(coalesce(quantity_label, '')) ~* '^[0-9]+(?:\.[0-9]+)?\s+servings?$';

create or replace function public.mark_meal_eaten(
  p_planned_meal_id uuid,
  p_user_id         uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meal_id        uuid;
  v_status         text;
  v_servings       integer;
  v_planned_date   date;
  v_meal_slot      text;
  v_eaten_at       timestamptz;
  v_consumed_at    timestamptz;

  v_ingredient     record;
  v_qty_needed     numeric;
  v_current_qty    numeric;
  v_qty_consumed   numeric;
  v_remaining      numeric;
  v_auto_reorder   boolean;
  v_inventory_unit text;
  v_amount_per_serving numeric;
begin
  select meal_id,
         status,
         coalesce(servings, 1),
         planned_date,
         meal_slot,
         eaten_at
    into v_meal_id,
         v_status,
         v_servings,
         v_planned_date,
         v_meal_slot,
         v_eaten_at
  from public.planned_meals
  where id = p_planned_meal_id
    and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('error', 'planned_meal not found');
  end if;

  if v_status = 'completed' then
    return jsonb_build_object('error', 'already_eaten');
  end if;

  if v_eaten_at is not null then
    v_consumed_at := v_eaten_at;
  else
    v_consumed_at := least(
      now(),
      case coalesce(v_meal_slot, '')
        when 'breakfast' then (v_planned_date::timestamptz + time '08:00')
        when 'lunch'     then (v_planned_date::timestamptz + time '12:30')
        when 'dinner'    then (v_planned_date::timestamptz + time '18:30')
        when 'snack'     then (v_planned_date::timestamptz + time '15:30')
        else (v_planned_date::timestamptz + time '12:00')
      end
    );
  end if;

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
      and mi.unit in ('g', 'ml', 'units', 'serving')
  loop
    continue when v_ingredient.pantry_staple = true;

    v_inventory_unit := lower(v_ingredient.unit);
    v_amount_per_serving := null;

    if v_ingredient.unit = 'serving' then
      select uin.basis_unit, uin.amount_per_unit
        into v_inventory_unit, v_amount_per_serving
      from public.user_ingredient_nutrition uin
      where uin.user_id = p_user_id
        and uin.ingredient_key = lower(trim(v_ingredient.ingredient_name))
        and uin.amount_per_unit is not null
      limit 1;

      -- A serving without a known physical size is deliberately not consumed:
      -- guessing would silently corrupt Pantry quantities.
      if v_amount_per_serving is null or v_inventory_unit not in ('g', 'ml') then
        continue;
      end if;

      v_qty_needed := v_ingredient.quantity * v_servings * v_amount_per_serving;
    else
      v_qty_needed := v_ingredient.quantity * v_servings;
    end if;

    select coalesce(sum(it.quantity_delta), 0)
      into v_current_qty
    from public.inventory_transactions it
    where it.user_id = p_user_id
      and it.ingredient_id = v_ingredient.ingredient_id
      and it.unit_code = v_inventory_unit
      and it.occurred_at <= v_consumed_at;

    if v_current_qty is null or v_current_qty <= 0 then
      v_qty_consumed := 0;
    else
      v_qty_consumed := least(v_qty_needed, v_current_qty);
    end if;

    if v_qty_consumed > 0 then
      insert into public.inventory_transactions (
        user_id,
        ingredient_id,
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
        v_ingredient.ingredient_id,
        v_ingredient.ingredient_name,
        -v_qty_consumed,
        v_inventory_unit,
        v_inventory_unit,
        'meal_consumption',
        'planned_meal',
        p_planned_meal_id,
        v_consumed_at
      );

      v_remaining := v_current_qty - v_qty_consumed;

      if v_remaining <= 0 then
        select coalesce(pp.auto_reorder, true)
          into v_auto_reorder
        from public.pantry_preferences pp
        where pp.user_id = p_user_id
          and lower(trim(pp.ingredient_name)) = lower(trim(v_ingredient.ingredient_name))
          and pp.unit_code = v_inventory_unit;

        if v_auto_reorder then
          if not exists (
            select 1 from public.shopping_list
             where user_id = p_user_id
               and lower(ingredient_name) = lower(v_ingredient.ingredient_name)
               and is_checked = false
          ) then
            insert into public.shopping_list
              (user_id, ingredient_name, unit, source)
            values
              (p_user_id, v_ingredient.ingredient_name, v_inventory_unit, 'auto_out_of_stock');
          end if;
        end if;
      end if;
    end if;
  end loop;

  update public.planned_meals
    set status  = 'completed',
        eaten_at = coalesce(v_eaten_at, v_consumed_at)
  where id = p_planned_meal_id;

  return jsonb_build_object('success', true);
end;
$$;

comment on column public.user_ingredient_nutrition.amount_per_unit is
  'Physical g/ml represented by one recipe unit or serving. Used for macro calculation and serving-to-Pantry conversion.';

commit;
