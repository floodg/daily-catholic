begin;

-- 2026-03-20: Ledger refactor (shopping list uses ingredient_id)
-- Update shopping_list_aggregate_week so the "in_pantry" calculation joins
-- inventory_stock_levels by ingredient_id (canonical) instead of matching
-- ingredient_name strings.

create or replace function public.shopping_list_aggregate_week(
  p_user_id uuid
) returns table (
  ingredient_id uuid,
  product_id    uuid,
  display_name  text,
  unit          text,
  total_needed  numeric,
  in_pantry     numeric,
  net_qty_needed numeric
)
language sql
security invoker
as $$
  with week_bounds as (
    select
      date_trunc('week', current_date)::date                       as week_start,
      (date_trunc('week', current_date) + interval '7 days')::date as week_end
  ),
  eff as (
    select
      mi.id,
      mi.meal_id,
      mi.name,
      coalesce(
        mi.quantity,
        public.extract_qty_from_label(mi.quantity_label)
      ) as eff_qty,
      coalesce(
        mi.unit,
        public.extract_unit_from_label(mi.quantity_label)
      ) as eff_unit,
      case
        when mi.unit is null
          and public.extract_unit_from_label(mi.quantity_label) = 'g'
          and lower(coalesce(mi.quantity_label,'')) ~ '^[0-9]+(\.[0-9]+)?\s*kg\s*$'
        then 1000.0
        else 1.0
      end as scale
    from public.meal_ingredients mi
  )
  select
    i.id                             as ingredient_id,
    sp.id                            as product_id,
    coalesce(sp.name, i.name)        as display_name,
    eff.eff_unit                     as unit,
    sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1)) as total_needed,
    coalesce(isl.current_quantity, 0) as in_pantry,
    greatest(
      0,
      sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1))
        - coalesce(isl.current_quantity, 0)
    )                                as net_qty_needed
  from public.planned_meals pm
  join week_bounds wb
    on pm.planned_date >= wb.week_start
   and pm.planned_date <  wb.week_end
  join eff on eff.meal_id = pm.meal_id
  join public.ingredients i
    on lower(i.name) = lower(eff.name)
  left join public.store_products sp
    on sp.ingredient_id = i.id
   and sp.user_id = pm.user_id
  left join public.inventory_stock_levels isl
    on isl.user_id = pm.user_id
   and isl.ingredient_id = i.id
   and isl.unit = eff.eff_unit
  where pm.user_id      = p_user_id
    and pm.status      != 'skipped'
    and i.pantry_staple = false
    and eff.eff_qty    is not null
    and eff.eff_unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup')
  group by i.id, sp.id, i.name, sp.name, eff.eff_unit, isl.current_quantity
  having greatest(
    0,
    sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1))
      - coalesce(isl.current_quantity, 0)
  ) > 0
  order by coalesce(sp.name, i.name) asc, eff.eff_unit asc;
$$;

commit;

