-- Merge Google Tasks trip items into the existing active shopping requirement
-- for the same canonical ingredient instead of violating
-- uniq_open_shopping_item_per_ingredient.
--
-- The active Shopping UI intentionally has one unchecked row per ingredient.
-- Multiple retailer trip items (for example Aldi and Coles beef mince) therefore
-- contribute to that single requirement. Recompute the requirement from all open
-- trip items so repeated updates remain idempotent and quantity-safe.

begin;

create or replace function public.mirror_trip_item_to_shopping_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_product record;
  v_base record;
  v_display_name text;
  v_total numeric;
  v_aggregate_total numeric;
  v_existing_id uuid;
begin
  select st.user_id into v_user_id
  from public.shopping_trips st
  where st.id = new.shopping_trip_id;

  if v_user_id is null then
    return new;
  end if;

  select sp.* into v_product
  from public.store_products sp
  where sp.id = new.store_product_id;

  select * into v_base
  from public.trip_item_base_quantity(
    new.product_name,
    new.pack_quantity,
    new.pack_unit,
    v_product.size_value,
    v_product.size_unit_code
  );

  v_total := greatest(coalesce(new.quantity_purchased, 1), 1) * coalesce(v_base.quantity, 1);

  if v_product.ingredient_id is not null then
    select i.name into v_display_name
    from public.ingredients i
    where i.id = v_product.ingredient_id;
  end if;

  v_display_name := coalesce(
    nullif(trim(v_display_name), ''),
    nullif(trim(new.ingredient_name), ''),
    nullif(trim(new.product_name), ''),
    'Shopping item'
  );

  -- Recompute the total requirement from every open trip item that resolves to
  -- this same canonical display name and base unit. This avoids double-counting
  -- when a previously merged trip item is updated later.
  select coalesce(sum(
    greatest(coalesce(ti.quantity_purchased, 1), 1) * coalesce(b.quantity, 1)
  ), v_total)
  into v_aggregate_total
  from public.shopping_trip_items ti
  join public.shopping_trips st
    on st.id = ti.shopping_trip_id
   and st.user_id = v_user_id
   and st.completed_at is null
  left join public.store_products sp on sp.id = ti.store_product_id
  left join public.ingredients i on i.id = sp.ingredient_id
  cross join lateral public.trip_item_base_quantity(
    ti.product_name,
    ti.pack_quantity,
    ti.pack_unit,
    sp.size_value,
    sp.size_unit_code
  ) b
  where lower(trim(coalesce(i.name, ti.ingredient_name, ti.product_name, ''))) = lower(trim(v_display_name))
    and coalesce(b.unit, 'units') = coalesce(v_base.unit, 'units');

  select sl.id into v_existing_id
  from public.shopping_list sl
  where sl.user_id = v_user_id
    and sl.is_checked = false
    and lower(trim(sl.ingredient_name)) = lower(trim(v_display_name))
  order by sl.created_at asc
  limit 1;

  if v_existing_id is not null then
    update public.shopping_list
    set ingredient_name = v_display_name,
        unit = coalesce(v_base.unit, 'units'),
        requested_quantity = v_aggregate_total,
        net_qty_needed = v_aggregate_total,
        source = 'google_tasks'
    where id = v_existing_id;
  else
    insert into public.shopping_list (
      user_id,
      ingredient_name,
      unit,
      requested_quantity,
      net_qty_needed,
      is_checked,
      source,
      shopping_trip_item_id
    ) values (
      v_user_id,
      v_display_name,
      coalesce(v_base.unit, 'units'),
      v_aggregate_total,
      v_aggregate_total,
      false,
      'google_tasks',
      new.id
    );
  end if;

  return new;
end;
$$;

commit;
