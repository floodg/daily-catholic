-- Keep Google Tasks shopping-trip rows connected to the active Shopping UI and
-- to user-owned store products.
--
-- The sync function can legitimately fall back to an unenriched
-- shopping_trip_items row when a retailer search cannot verify a product.  The
-- Shopping page, however, reads public.shopping_list, not shopping_trip_items.
-- Also, dynamically discovered store products created by the sync historically
-- used user_id = NULL because the service function did not pass the sync user to
-- product persistence.
--
-- This migration makes the database boundary authoritative:
--   1. every trip item gets a usable store_product_id (raw fallback product when
--      enrichment failed),
--   2. dynamic/global products are cloned into the trip user's product catalogue,
--   3. canonical ingredient_id is attached when the master catalogue resolves it,
--   4. every trip item is mirrored into the active shopping_list table.

begin;

create or replace function public.trip_item_base_quantity(
  p_product_name text,
  p_pack_quantity numeric,
  p_pack_unit text,
  p_size_value numeric,
  p_size_unit text
)
returns table(quantity numeric, unit text)
language plpgsql
immutable
as $$
declare
  v_match text[];
  v_qty numeric;
  v_unit text;
begin
  -- Prefer structured store-product size.
  if p_size_value is not null and p_size_value > 0 and p_size_unit is not null then
    v_qty := p_size_value;
    v_unit := lower(trim(p_size_unit));
  elsif p_pack_quantity is not null and p_pack_quantity > 0 and p_pack_unit is not null then
    v_qty := p_pack_quantity;
    v_unit := lower(trim(p_pack_unit));
  else
    -- Fallback for raw task text such as "2kg beef mince".
    v_match := regexp_match(lower(coalesce(p_product_name, '')), '(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b');
    if v_match is not null then
      v_qty := v_match[1]::numeric;
      v_unit := v_match[2];
    else
      v_match := regexp_match(lower(coalesce(p_product_name, '')), '(\d+(?:\.\d+)?)\s*(pack|pk|pkt|ct|count|each|ea|units?)\b');
      if v_match is not null then
        v_qty := v_match[1]::numeric;
        v_unit := 'units';
      end if;
    end if;
  end if;

  if v_qty is null or v_qty <= 0 then
    quantity := 1;
    unit := 'units';
    return next;
    return;
  end if;

  if v_unit = 'kg' then
    quantity := v_qty * 1000;
    unit := 'g';
  elsif v_unit = 'l' then
    quantity := v_qty * 1000;
    unit := 'ml';
  elsif v_unit in ('g', 'ml', 'units') then
    quantity := v_qty;
    unit := v_unit;
  else
    quantity := v_qty;
    unit := 'units';
  end if;

  return next;
end;
$$;

create or replace function public.ensure_trip_item_user_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_store text;
  v_product record;
  v_existing_id uuid;
  v_ingredient_id uuid;
  v_size record;
begin
  select st.user_id, st.store
    into v_user_id, v_store
  from public.shopping_trips st
  where st.id = new.shopping_trip_id;

  if v_user_id is null then
    return new;
  end if;

  -- Resolve the canonical food concept first. Unmatched products remain valid
  -- store products with ingredient_id NULL.
  v_ingredient_id := public.resolve_canonical_ingredient_id(
    coalesce(nullif(trim(new.ingredient_name), ''), nullif(trim(new.product_name), ''))
  );
  if v_ingredient_id is null then
    v_ingredient_id := public.resolve_canonical_ingredient_id(new.product_name);
  end if;

  if new.store_product_id is not null then
    select sp.* into v_product
    from public.store_products sp
    where sp.id = new.store_product_id;

    if found then
      -- Seed products (fixed 11111111 ids) intentionally remain shared. Dynamic
      -- products should live in the user's catalogue, so clone a shared dynamic
      -- row before linking the trip item.
      if v_product.user_id is null and v_product.id::text not like '11111111-%' then
        select sp.id into v_existing_id
        from public.store_products sp
        where sp.user_id = v_user_id
          and lower(trim(sp.store)) = lower(trim(v_store))
          and public.normalize_ingredient_lookup_text(sp.name) = public.normalize_ingredient_lookup_text(v_product.name)
        order by sp.created_at asc
        limit 1;

        if v_existing_id is null then
          insert into public.store_products (
            name, brand, size_label, store, product_url, image_url, user_id,
            ingredient_id, pack_size_g, pack_size_ml, pack_size_units,
            barcode, size_value, size_unit_code, pack_unit_code
          ) values (
            v_product.name,
            v_product.brand,
            v_product.size_label,
            v_store,
            v_product.product_url,
            v_product.image_url,
            v_user_id,
            coalesce(v_product.ingredient_id, v_ingredient_id),
            v_product.pack_size_g,
            v_product.pack_size_ml,
            v_product.pack_size_units,
            v_product.barcode,
            v_product.size_value,
            v_product.size_unit_code,
            v_product.pack_unit_code
          )
          returning id into v_existing_id;
        end if;

        new.store_product_id := v_existing_id;
      elsif v_product.ingredient_id is null and v_ingredient_id is not null then
        update public.store_products
        set ingredient_id = v_ingredient_id
        where id = v_product.id;
      end if;
    end if;
  end if;

  -- No verified/enriched store product: persist the raw Google Task item as a
  -- user-owned product instead of dropping it from store_products entirely.
  if new.store_product_id is null then
    select sp.id into v_existing_id
    from public.store_products sp
    where sp.user_id = v_user_id
      and lower(trim(sp.store)) = lower(trim(v_store))
      and public.normalize_ingredient_lookup_text(sp.name) = public.normalize_ingredient_lookup_text(new.product_name)
    order by sp.created_at asc
    limit 1;

    if v_existing_id is null then
      select * into v_size
      from public.trip_item_base_quantity(
        new.product_name,
        new.pack_quantity,
        new.pack_unit,
        null,
        null
      );

      insert into public.store_products (
        name,
        store,
        user_id,
        ingredient_id,
        size_label,
        size_value,
        size_unit_code,
        pack_size_g,
        pack_size_ml,
        pack_size_units
      ) values (
        new.product_name,
        v_store,
        v_user_id,
        v_ingredient_id,
        case
          when v_size.unit = 'g' and v_size.quantity >= 1000 and mod(v_size.quantity, 1000) = 0
            then trim(to_char(v_size.quantity / 1000, 'FM999999990.##')) || 'kg'
          when v_size.unit = 'ml' and v_size.quantity >= 1000 and mod(v_size.quantity, 1000) = 0
            then trim(to_char(v_size.quantity / 1000, 'FM999999990.##')) || 'L'
          else trim(to_char(v_size.quantity, 'FM999999990.##')) || case when v_size.unit = 'units' then ' units' else v_size.unit end
        end,
        v_size.quantity,
        v_size.unit,
        case when v_size.unit = 'g' then v_size.quantity else null end,
        case when v_size.unit = 'ml' then v_size.quantity else null end,
        case when v_size.unit = 'units' then v_size.quantity else null end
      )
      returning id into v_existing_id;
    end if;

    new.store_product_id := v_existing_id;
  end if;

  -- Store the canonical ingredient name on the trip row when one exists.
  if v_ingredient_id is not null then
    select i.name into new.ingredient_name
    from public.ingredients i
    where i.id = v_ingredient_id;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_trip_item_user_product_trg on public.shopping_trip_items;
create trigger ensure_trip_item_user_product_trg
before insert or update of store_product_id, product_name, ingredient_name, pack_quantity, pack_unit
on public.shopping_trip_items
for each row execute function public.ensure_trip_item_user_product();

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

  -- Keep one active Shopping row per trip item. If the row already exists and is
  -- still pending, refresh its canonical name/quantity; checked rows are left as
  -- immutable purchase history.
  update public.shopping_list sl
  set ingredient_name = v_display_name,
      unit = coalesce(v_base.unit, 'units'),
      requested_quantity = v_total,
      net_qty_needed = v_total,
      source = 'google_tasks'
  where sl.shopping_trip_item_id = new.id
    and sl.user_id = v_user_id
    and sl.is_checked = false;

  if not found and not exists (
    select 1
    from public.shopping_list sl
    where sl.shopping_trip_item_id = new.id
      and sl.user_id = v_user_id
  ) then
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
      v_total,
      v_total,
      false,
      'google_tasks',
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists mirror_trip_item_to_shopping_list_trg on public.shopping_trip_items;
create trigger mirror_trip_item_to_shopping_list_trg
after insert or update of store_product_id, product_name, ingredient_name, quantity_purchased, pack_quantity, pack_unit
on public.shopping_trip_items
for each row execute function public.mirror_trip_item_to_shopping_list();

-- Backfill current open trip items. This also repairs the current raw
-- "2kg beef mince" fallback row and any enriched salmon trip rows that exist.
update public.shopping_trip_items
set product_name = product_name
where shopping_trip_id in (
  select id from public.shopping_trips where completed_at is null
);

commit;
