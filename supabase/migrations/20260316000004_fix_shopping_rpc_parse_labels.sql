begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix shopping_list_aggregate_week
--
-- Root cause: meal_ingredients rows imported from starter meals have
-- quantity (numeric) = NULL and unit = NULL because the import path only
-- stored the free-text quantity_label.  The original RPC filtered those rows
-- out with "AND mi.quantity IS NOT NULL", producing an empty shopping list.
--
-- This migration:
--  1. Adds two helper functions to parse free-text labels into qty + unit.
--  2. Replaces the RPC with a version that COALESCEs structured columns with
--     parsed label values so existing and future rows both work.
--  3. Expands the shopping_list.unit constraint to include tsp / tbsp / cup.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: extract leading numeric value from a free-text quantity label ──
-- "250g" → 250, "1.5 cups" → 1.5, "4–6" → 4, "0.5" → 0.5
create or replace function public.extract_qty_from_label(label text)
returns numeric language sql immutable as $$
  select (regexp_match(coalesce(label, ''), '^([0-9]+(\.[0-9]+)?)'))[1]::numeric;
$$;

-- ── Helper: derive a canonical unit from a free-text quantity label ─────────
-- Returns one of: 'g', 'ml', 'units', 'cup', 'tbsp', 'tsp', or NULL.
-- kg is mapped to 'g' here; the RPC applies ×1000 in that case.
create or replace function public.extract_unit_from_label(label text)
returns text language sql immutable as $$
  select case
    -- Weight (kg must precede g to avoid a short-circuit miss on "1kg")
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*kg\s*$'   then 'g'
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*g\s*$'    then 'g'
    -- Volume
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*ml\s*$'   then 'ml'
    -- Cooking measures (space optional: "2 cups", "2cups", "1.5 tbsp")
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*cups?\s*$' then 'cup'
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*tbsp\s*$'  then 'tbsp'
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*tsp\s*$'   then 'tsp'
    -- Bare number or bare range with no unit → countable items
    when lower(coalesce(label,'')) ~ '^[0-9]+(\.[0-9]+)?(\s*[-–]\s*[0-9]+(\.[0-9]+)?)?\s*$'         then 'units'
    else null
  end;
$$;

-- ── Updated RPC ──────────────────────────────────────────────────────────────
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
  -- Resolve effective quantity + unit for every meal_ingredients row.
  -- Structured columns (quantity, unit) take precedence; free-text
  -- quantity_label is parsed as a fallback for legacy/imported rows.
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
      -- Apply ×1000 when the label specifies kg but the resolved unit is 'g'
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
    coalesce(pi.remaining_qty, 0)    as in_pantry,
    greatest(
      0,
      sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1))
        - coalesce(pi.remaining_qty, 0)
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
  left join public.pantry_inventory pi
    on pi.ingredient_id = i.id
   and pi.user_id = pm.user_id
   and pi.unit = eff.eff_unit
  where pm.user_id      = p_user_id
    and pm.status      != 'skipped'
    and i.pantry_staple = false
    and eff.eff_qty    is not null
    and eff.eff_unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup')
  group by i.id, sp.id, i.name, sp.name, eff.eff_unit, pi.remaining_qty
  having greatest(
    0,
    sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1))
      - coalesce(pi.remaining_qty, 0)
  ) > 0
  order by coalesce(sp.name, i.name) asc, eff.eff_unit asc;
$$;

-- ── Expand shopping_list.unit constraint to cover cooking measures ───────────
alter table public.shopping_list
  drop constraint if exists shopping_list_unit_check;

alter table public.shopping_list
  add constraint shopping_list_unit_check
  check (unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup'));

commit;
