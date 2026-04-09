begin;

-- 2026-04-09: Add allow-list RPC for kitchen scan
create or replace function public.meal_plan_required_ingredients_for_week(
  p_user_id uuid
) returns table (
  ingredient_id uuid,
  display_name text
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
      mi.meal_id,
      mi.name,
      coalesce(
        mi.quantity,
        public.extract_qty_from_label(mi.quantity_label)
      ) as eff_qty,
      coalesce(
        mi.unit,
        public.extract_unit_from_label(mi.quantity_label)
      ) as eff_unit
    from public.meal_ingredients mi
  )
  select distinct
    i.id as ingredient_id,
    i.name as display_name
  from public.planned_meals pm
  join week_bounds wb
    on pm.planned_date >= wb.week_start
   and pm.planned_date <  wb.week_end
  join eff
    on eff.meal_id = pm.meal_id
  join public.ingredients i
    on lower(i.name) = lower(eff.name)
  where pm.user_id = p_user_id
    and pm.status != 'skipped'
    and i.pantry_staple = false
    and eff.eff_qty is not null
    and eff.eff_unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup')
  order by i.name asc;
$$;

grant execute on function public.meal_plan_required_ingredients_for_week(uuid) to authenticated;

commit;
