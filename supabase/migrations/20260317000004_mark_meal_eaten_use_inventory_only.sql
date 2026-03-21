begin;

-- Pantry unification: mark_meal_eaten uses only inventory_transactions and pantry_preferences.
-- Stops reading or writing pantry_inventory; shopping list when out of stock uses inventory_stock_levels + pantry_preferences.

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
  v_qty_needed     numeric;
  v_current_qty    numeric;
  v_qty_consumed   numeric;
  v_remaining      numeric;
  v_auto_reorder   boolean;
begin
  select meal_id, status, coalesce(servings, 1)
    into v_meal_id, v_status, v_servings
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
    continue when v_ingredient.pantry_staple = true;

    v_qty_needed := v_ingredient.quantity * v_servings;

    -- Current stock from ledger (inventory_stock_levels)
    select coalesce(isl.current_quantity, 0)
      into v_current_qty
    from public.inventory_stock_levels isl
    where isl.user_id = p_user_id
      and lower(trim(isl.ingredient_name)) = lower(trim(v_ingredient.ingredient_name))
      and isl.unit = v_ingredient.unit;

    if v_current_qty is null then
      v_current_qty := 0;
    end if;

    -- Cap consumed at available stock so we do not go negative
    v_qty_consumed := least(v_qty_needed, v_current_qty);

    if v_qty_consumed > 0 then
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

  update public.planned_meals
    set status = 'completed',
        eaten_at = now()
  where id = p_planned_meal_id;

  return jsonb_build_object('success', true);
end;
$$;

commit;
