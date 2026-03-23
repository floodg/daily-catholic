begin;

-- 2026-03-22: Time-aware pantry/stock consumption
-- Scenario:
-- - If there is no stock at the time the meal is eaten, do not add any
--   consumption debits to the inventory ledger.
-- - When a shop happens later, only stock purchased before the meal's
--   eaten time should be considered available for that meal's deduction.
-- Implementation details:
-- - Compute an effective consumption timestamp (v_consumed_at) using:
--     1) planned_meals.eaten_at when present;
--     2) otherwise, planned_date combined with a default time inferred from
--        meal_slot ('breakfast' 08:00, 'lunch' 12:30, 'dinner' 18:30,
--        'snack' 15:30); this is clamped to NOW() so we never future-date.
-- - Aggregate available stock strictly as-of v_consumed_at by summing
--   inventory_transactions up to and including that timestamp.
-- - Cap any meal consumption at that as-of stock, so we never drive stock
--   negative and we never "back-consume" future purchases.
-- - Write meal consumption with occurred_at = v_consumed_at for correct
--   chronological ordering in the ledger. If capped to 0, no ledger row
--   is written (meal may still be marked completed).

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
begin
  -- Lock the planned meal row for update and validate ownership
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

  -- Guard: already completed
  if v_status = 'completed' then
    return jsonb_build_object('error', 'already_eaten');
  end if;

  -- Determine the effective consumption timestamp.
  if v_eaten_at is not null then
    v_consumed_at := v_eaten_at;
  else
    -- Map meal_slot to a default time (UTC). Clamp to now() to avoid future timestamps.
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

  -- Iterate deduplicated ingredients for this meal
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

    -- Stock strictly as-of the consumption time
    select coalesce(sum(it.quantity_delta), 0)
      into v_current_qty
    from public.inventory_transactions it
    where it.user_id = p_user_id
      and it.ingredient_id = v_ingredient.ingredient_id
      and it.unit_code = lower(v_ingredient.unit)
      and it.occurred_at <= v_consumed_at;

    if v_current_qty is null or v_current_qty <= 0 then
      v_qty_consumed := 0;
    else
      -- Cap consumption by available stock as-of the meal time
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
        v_ingredient.unit,
        lower(v_ingredient.unit),
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
          and pp.unit_code = v_ingredient.unit;

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
              (p_user_id, v_ingredient.ingredient_name, v_ingredient.unit, 'auto_out_of_stock');
          end if;
        end if;
      end if;
    end if;
  end loop;

  -- Mark the planned meal as completed and record timestamp (set eaten_at if null)
  update public.planned_meals
    set status  = 'completed',
        eaten_at = coalesce(v_eaten_at, v_consumed_at)
  where id = p_planned_meal_id;

  return jsonb_build_object('success', true);
end;
$$;

commit;

