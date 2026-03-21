begin;

-- Ingredient Consumption Engine
-- Mark a planned meal as eaten and deduct ingredient quantities from pantry.
-- All operations execute within a single transaction via the function call.

create or replace function public.mark_meal_eaten(
  p_planned_meal_id uuid,
  p_user_id         uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_meal_id      uuid;
  v_status       text;
  v_servings     integer;
  v_ingredient   record;
  v_pantry       record;
  v_qty_needed   numeric;
  v_new_consumed numeric;
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

  -- Iterate over structured meal ingredients joined to catalog for pantry flags.
  for v_ingredient in
    select
      i.id        as ingredient_id,
      mi.quantity as quantity,
      mi.unit     as unit,
      i.pantry_staple
    from public.meal_ingredients mi
    join public.ingredients i
      on lower(i.name) = lower(mi.name)
    where mi.meal_id = v_meal_id
      and mi.quantity is not null
      and mi.unit in ('g', 'ml', 'units')
  loop
    -- Skip pantry staples entirely
    continue when v_ingredient.pantry_staple = true;

    -- Resolve matching pantry row for this (user, ingredient, unit)
    select *
      into v_pantry
    from public.pantry_inventory
    where user_id = p_user_id
      and ingredient_id = v_ingredient.ingredient_id
      and unit = v_ingredient.unit
    for update;

    -- If no pantry row exists, skip silently (meal still marked eaten)
    continue when not found;

    v_qty_needed := v_ingredient.quantity * v_servings;

    -- Cap consumed at purchased to avoid negative remaining
    v_new_consumed := least(
      v_pantry.consumed_qty + v_qty_needed,
      v_pantry.purchased_qty
    );

    update public.pantry_inventory
      set consumed_qty = v_new_consumed,
          updated_at   = now()
    where id = v_pantry.id;

    -- If stock hits zero and auto_reorder is enabled, upsert into shopping_list
    if (v_pantry.purchased_qty - v_new_consumed) <= 0
       and v_pantry.auto_reorder = true then
      insert into public.shopping_list
        (user_id, ingredient_id, product_id, source, added_at)
      values
        (p_user_id, v_ingredient.ingredient_id, v_pantry.product_id, 'auto_pantry', now())
      on conflict (user_id, ingredient_id)
      where purchased_at is null do nothing;
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

