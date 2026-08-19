-- Allow a user-owned store product to be deleted even when historical shopping
-- trip items reference it.
--
-- shopping_trip_items.store_product_id uses ON DELETE SET NULL. That FK update
-- fires ensure_trip_item_user_product_trg. Previously the trigger interpreted the
-- newly-null store_product_id as a missing product and immediately recreated the
-- deleted product, then relinked the trip item to the new row.
--
-- An UPDATE transition from a real product id to NULL is an explicit unlink
-- (including FK ON DELETE SET NULL), so preserve the historical product text and
-- leave the foreign key NULL instead of recreating the product.

begin;

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
  v_canonical_name text;
begin
  -- Deleting a store_products row sets this FK to NULL. Do not undo that delete
  -- by manufacturing a replacement product from the historical trip item.
  if tg_op = 'UPDATE'
     and old.store_product_id is not null
     and new.store_product_id is null then
    return new;
  end if;

  select st.user_id, st.store
    into v_user_id, v_store
  from public.shopping_trips st
  where st.id = new.shopping_trip_id;

  if v_user_id is null then
    return new;
  end if;

  v_ingredient_id := public.resolve_trip_item_ingredient_id(
    coalesce(nullif(trim(new.ingredient_name), ''), nullif(trim(new.product_name), ''))
  );
  if v_ingredient_id is null then
    v_ingredient_id := public.resolve_trip_item_ingredient_id(new.product_name);
  end if;

  if new.store_product_id is not null then
    select sp.* into v_product
    from public.store_products sp
    where sp.id = new.store_product_id;

    if found then
      if v_ingredient_id is null then
        v_ingredient_id := coalesce(
          v_product.ingredient_id,
          public.resolve_trip_item_ingredient_id(concat_ws(' ', v_product.brand, v_product.name, v_product.size_label))
        );
      end if;

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

  if v_ingredient_id is not null then
    select i.name into v_canonical_name
    from public.ingredients i
    where i.id = v_ingredient_id;
    new.ingredient_name := coalesce(v_canonical_name, new.ingredient_name);
  end if;

  return new;
end;
$$;

commit;
