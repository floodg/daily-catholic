begin;

-- 2026-03-20: Ledger credits only after shopping list check
alter table public.shopping_list
  add column if not exists shopping_trip_item_id uuid null
    references public.shopping_trip_items(id) on delete set null;

drop trigger if exists trg_shopping_trip_item_create_inventory_transaction
  on public.shopping_trip_items;

create or replace function public.create_inventory_transaction_for_checked_shopping_list_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_qty_delta numeric(10,2);

  v_trip_item_id uuid;
  v_store_product_id uuid;
  v_trip_ingredient_name text;

  v_ingredient_id uuid;
  v_ingredient_name text;
  v_unit text;
  v_unit_code text;
begin
  if new.is_checked is not true then
    return new;
  end if;

  if new.requested_quantity is null then
    return new;
  end if;

  if exists (
    select 1
    from public.inventory_transactions it
    where it.user_id = new.user_id
      and it.transaction_type = 'purchase'
      and it.source_type = 'shopping_list_item'
      and it.source_id = new.id
  ) then
    return new;
  end if;

  v_user_id := new.user_id;
  v_qty_delta := new.requested_quantity;
  v_trip_item_id := new.shopping_trip_item_id;
  v_unit := new.unit;
  v_unit_code := lower(coalesce(trim(v_unit), 'units'));

  if v_trip_item_id is not null then
    select ti.store_product_id,
           ti.ingredient_name
      into v_store_product_id,
           v_trip_ingredient_name
    from public.shopping_trip_items ti
    where ti.id = v_trip_item_id;

    if v_store_product_id is not null then
      select sp.ingredient_id
        into v_ingredient_id
      from public.store_products sp
      where sp.id = v_store_product_id;
    end if;
  end if;

  if v_ingredient_id is null then
    v_trip_ingredient_name := coalesce(v_trip_ingredient_name, new.ingredient_name);

    select i.id, i.name
      into v_ingredient_id, v_ingredient_name
    from public.ingredients i
    where lower(trim(i.name)) = lower(trim(v_trip_ingredient_name))
    order by
      case when i.name = v_trip_ingredient_name then 0 else 1 end,
      i.name asc
    limit 1;

    if v_ingredient_id is null then
      insert into public.ingredients (name)
      values (trim(v_trip_ingredient_name))
      on conflict (name) do nothing;

      select i.id, i.name
        into v_ingredient_id, v_ingredient_name
      from public.ingredients i
      where lower(trim(i.name)) = lower(trim(v_trip_ingredient_name))
      order by
        case when i.name = v_trip_ingredient_name then 0 else 1 end,
        i.name asc
      limit 1;
    end if;
  else
    select i.name
      into v_ingredient_name
    from public.ingredients i
    where i.id = v_ingredient_id;
  end if;

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
    v_user_id,
    v_ingredient_id,
    v_ingredient_name,
    v_qty_delta,
    v_unit,
    v_unit_code,
    'purchase',
    'shopping_list_item',
    new.id,
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_shopping_list_checked_insert on public.shopping_list;
create trigger trg_shopping_list_checked_insert
  after insert on public.shopping_list
  for each row
  when (new.is_checked = true)
  execute function public.create_inventory_transaction_for_checked_shopping_list_item();

drop trigger if exists trg_shopping_list_checked_update on public.shopping_list;
create trigger trg_shopping_list_checked_update
  after update on public.shopping_list
  for each row
  when (old.is_checked = false and new.is_checked = true)
  execute function public.create_inventory_transaction_for_checked_shopping_list_item();

create or replace function public.delete_inventory_transaction_for_shopping_list_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.inventory_transactions it
   where it.user_id = old.user_id
     and it.transaction_type = 'purchase'
     and it.source_type = 'shopping_list_item'
     and it.source_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_shopping_list_checked_delete on public.shopping_list;
create trigger trg_shopping_list_checked_delete
  after delete on public.shopping_list
  for each row
  execute function public.delete_inventory_transaction_for_shopping_list_item();

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
          'product_name', coalesce(
            sti_trip.product_name,
            sti_list.product_name,
            it.ingredient_name
          ),
          'trip_date', coalesce(
            st_trip.purchased_at::date,
            st_list.purchased_at::date,
            sl.created_at::date
          ),
          'store', coalesce(
            st_trip.store,
            st_list.store,
            'Shopping List'
          )
        )
        order by coalesce(st_trip.purchased_at, st_list.purchased_at, sl.created_at) desc
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

