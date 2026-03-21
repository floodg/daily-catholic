begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Shopping List Aggregation (Phase 3 · Pantry Engine)
-- Adds columns needed for aggregated list display and creates an RPC that
-- computes the current week's net quantity requirements per ingredient/unit,
-- subtracting pantry stock and excluding pantry staples and skipped meals.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add extended columns to shopping_list for richer UI semantics
alter table public.shopping_list
  add column if not exists net_qty_needed numeric,
  add column if not exists unit text
    constraint shopping_list_unit_check check (unit in ('g', 'ml', 'units'));

-- RPC: Aggregate this ISO week (Mon–Sun) for the given user
create or replace function public.shopping_list_aggregate_week(
  p_user_id uuid
) returns table (
  ingredient_id uuid,
  product_id uuid,
  display_name text,
  unit text,
  total_needed numeric,
  in_pantry numeric,
  net_qty_needed numeric
)
language sql
security invoker
as $$
  with week_bounds as (
    select
      date_trunc('week', current_date)::date as week_start,
      (date_trunc('week', current_date) + interval '7 days')::date as week_end
  )
  select
    i.id as ingredient_id,
    sp.id as product_id,
    coalesce(sp.name, i.name) as display_name,
    mi.unit as unit,
    sum(mi.quantity * coalesce(pm.servings, 1)) as total_needed,
    coalesce(pi.remaining_qty, 0) as in_pantry,
    greatest(
      0,
      sum(mi.quantity * coalesce(pm.servings, 1)) - coalesce(pi.remaining_qty, 0)
    ) as net_qty_needed
  from public.planned_meals pm
  join week_bounds wb
    on pm.planned_date >= wb.week_start
   and pm.planned_date <  wb.week_end
  join public.meal_ingredients mi
    on mi.meal_id = pm.meal_id
  -- Our current schema links ingredients by name rather than id
  join public.ingredients i
    on lower(i.name) = lower(mi.name)
  left join public.store_products sp
    on sp.ingredient_id = i.id
   and sp.user_id = pm.user_id
  left join public.pantry_inventory pi
    on pi.ingredient_id = i.id
   and pi.user_id = pm.user_id
   and pi.unit = mi.unit
  where pm.user_id = p_user_id
    and pm.status != 'skipped'
    and i.pantry_staple = false
    and mi.quantity is not null
    and mi.unit in ('g', 'ml', 'units')
  group by i.id, sp.id, i.name, sp.name, mi.unit, pi.remaining_qty
  having greatest(
    0,
    sum(mi.quantity * coalesce(pm.servings, 1)) - coalesce(pi.remaining_qty, 0)
  ) > 0
  order by display_name asc, unit asc;
$$;

commit;

