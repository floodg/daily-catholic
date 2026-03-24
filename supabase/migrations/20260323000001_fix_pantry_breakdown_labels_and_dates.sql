begin;

-- 2026-03-23: Pantry purchase breakdowns
-- - Label manual additions as "Adjustment" (not "Shopping List")
-- - Fix missing dates (fallback to inventory_transactions.occurred_at or created_at)
-- - Ensure last_purchase_date also falls back to created_at when occurred_at is null

create or replace function public.get_pantry_items_from_inventory(p_user_id uuid)
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  remaining numeric,
  total_purchased numeric,
  auto_reorder boolean,
  last_purchase_date date,
  purchase_breakdowns jsonb
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
    coalesce(b.purchase_breakdowns, '[]'::jsonb) as purchase_breakdowns
  from stock s
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
  order by s.ingredient_name asc, s.unit asc;
$$;

commit;

