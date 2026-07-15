-- History:
-- 2026-07-15: Add ingredients.kind (food | household) so non-food stock shares pantry/shopping without entering meal aggregation

begin;

alter table public.ingredients
  add column if not exists kind text not null default 'food';

alter table public.ingredients
  drop constraint if exists ingredients_kind_check;

alter table public.ingredients
  add constraint ingredients_kind_check
  check (kind in ('food', 'household'));

comment on column public.ingredients.kind is
  'Catalog item kind: food (meal ingredients) or household (cleaning, hardware, etc.).';

-- Week meal shopping: food only (household never comes from planned meals).
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
    and i.kind = 'food'
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

-- Pantry stock list: include kind for Food / Household sections.
drop function if exists public.get_pantry_items_from_inventory(p_user_id uuid);

create function public.get_pantry_items_from_inventory(p_user_id uuid)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  remaining numeric,
  total_purchased numeric,
  auto_reorder boolean,
  last_purchase_date date,
  purchase_breakdowns jsonb,
  kind text
)
language sql
security invoker
stable
as $$
  with stock as (
    select
      isl.ingredient_id,
      isl.ingredient_name,
      isl.unit,
      isl.current_quantity as remaining
    from public.inventory_stock_levels isl
    where isl.user_id = p_user_id
      and isl.current_quantity > 0
  ),
  totals as (
    select
      it.ingredient_id,
      coalesce(i.name, it.ingredient_name) as ingredient_name,
      it.unit_code,
      sum(case
            when it.transaction_type = 'purchase' and it.quantity_delta > 0
              then it.quantity_delta
            else 0
          end) as total_purchased,
      max(case
            when it.transaction_type = 'purchase'
              then coalesce(it.occurred_at, it.created_at)
          end)::date as last_purchase_date
    from public.inventory_transactions it
    left join public.ingredients i
      on i.id = it.ingredient_id
    where it.user_id = p_user_id
    group by it.ingredient_id, coalesce(i.name, it.ingredient_name), it.unit_code
  ),
  breakdowns as (
    select
      it.ingredient_id,
      coalesce(i.name, it.ingredient_name) as ingredient_name,
      it.unit_code,
      jsonb_agg(
        jsonb_build_object(
          'quantity', it.quantity_delta,
          'product_name', coalesce(
            sti_trip.product_name,
            sti_list.product_name,
            it.ingredient_name
          ),
          'trip_date', coalesce(
            st_trip.purchased_at::date,
            st_list.purchased_at::date,
            sl.created_at::date,
            it.occurred_at::date,
            it.created_at::date
          ),
          'store', coalesce(
            st_trip.store,
            st_list.store,
            case when it.source_type = 'shopping_list_item' then 'Shopping List' else 'Adjustment' end
          )
        )
        order by coalesce(
          st_trip.purchased_at,
          st_list.purchased_at,
          sl.created_at,
          it.occurred_at,
          it.created_at
        ) desc
      ) as purchase_breakdowns
    from public.inventory_transactions it
    left join public.shopping_trip_items sti_trip
      on it.source_type = 'shopping_trip_item' and it.source_id = sti_trip.id
    left join public.shopping_trips st_trip
      on sti_trip.shopping_trip_id = st_trip.id
    left join public.shopping_list sl
      on it.source_type = 'shopping_list_item' and it.source_id = sl.id
    left join public.shopping_trip_items sti_list
      on sl.shopping_trip_item_id is not null and sl.shopping_trip_item_id = sti_list.id
    left join public.shopping_trips st_list
      on sti_list.shopping_trip_id = st_list.id
    left join public.ingredients i
      on i.id = it.ingredient_id
    where it.user_id = p_user_id
      and it.transaction_type = 'purchase'
      and it.quantity_delta > 0
    group by it.ingredient_id, coalesce(i.name, it.ingredient_name), it.unit_code
  )
  select
    s.ingredient_id,
    s.ingredient_name,
    s.unit,
    s.remaining,
    coalesce(t.total_purchased, 0)::numeric as total_purchased,
    coalesce(pp.auto_reorder, true) as auto_reorder,
    t.last_purchase_date,
    coalesce(b.purchase_breakdowns, '[]'::jsonb) as purchase_breakdowns,
    coalesce(i.kind, 'food') as kind
  from stock s
  left join public.ingredients i
    on i.id = s.ingredient_id
  left join totals t
    on t.ingredient_id = s.ingredient_id
   and t.unit_code = s.unit
  left join breakdowns b
    on b.ingredient_id = s.ingredient_id
   and b.unit_code = s.unit
  left join public.pantry_preferences pp
    on pp.user_id = p_user_id
   and lower(trim(pp.ingredient_name)) = lower(trim(s.ingredient_name))
   and pp.unit_code = s.unit
  order by coalesce(i.kind, 'food') asc, s.ingredient_name asc, s.unit asc;
$$;

commit;
