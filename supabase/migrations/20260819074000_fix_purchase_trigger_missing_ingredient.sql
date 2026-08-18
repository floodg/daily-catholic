-- Fix shopping-list purchases for trip items whose ingredient does not yet exist.
-- The previous trigger used ON CONFLICT (name), but ingredients.name is not unique,
-- causing PostgreSQL to reject purchases such as newly synced Google Task items.

begin;

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
    v_trip_ingredient_name := coalesce(
      nullif(trim(v_trip_ingredient_name), ''),
      nullif(trim(new.ingredient_name), '')
    );

    if v_trip_ingredient_name is null then
      return new;
    end if;

    select i.id, i.name
      into v_ingredient_id, v_ingredient_name
    from public.ingredients i
    where lower(trim(i.name)) = lower(trim(v_trip_ingredient_name))
    order by
      case when i.created_by_user_id = new.user_id then 0 else 1 end,
      case when i.name = v_trip_ingredient_name then 0 else 1 end,
      i.created_at asc
    limit 1;

    if v_ingredient_id is null then
      insert into public.ingredients (name, created_by_user_id)
      values (trim(v_trip_ingredient_name), new.user_id)
      returning id, name into v_ingredient_id, v_ingredient_name;
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

commit;
