begin;

-- 2026-03-20: Ledger refactor (inventory_stock_levels + pantry RPC)
drop view if exists public.inventory_stock_levels;

create view public.inventory_stock_levels as
  select
    it.user_id,
    it.ingredient_id,
    coalesce(i.name, it.ingredient_name) as ingredient_name,
    it.unit_code as unit,
    sum(it.quantity_delta) as current_quantity
  from public.inventory_transactions it
  left join public.ingredients i
    on i.id = it.ingredient_id
  group by
    it.user_id,
    it.ingredient_id,
    coalesce(i.name, it.ingredient_name),
    it.unit_code;

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
      sum(case when it.transaction_type = 'purchase' and it.quantity_delta > 0
        then it.quantity_delta else 0 end) as total_purchased,
      max(case when it.transaction_type = 'purchase' then it.occurred_at end)::date as last_purchase_date
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
          'product_name', coalesce(sti.product_name, it.ingredient_name),
          'trip_date', st.purchased_at::date,
          'store', st.store
        )
        order by st.purchased_at desc
      ) as purchase_breakdowns
    from public.inventory_transactions it
    left join public.shopping_trip_items sti
      on it.source_type = 'shopping_trip_item' and it.source_id = sti.id
    left join public.shopping_trips st
      on sti.shopping_trip_id = st.id
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

