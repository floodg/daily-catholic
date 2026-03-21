begin;

-- 2026-03-20: Ledger refactor (purchase trigger writes ingredient_id)
-- Ensure shopping trip "purchase" ledger entries debit/credit the canonical
-- `public.ingredients` row by using store_products -> ingredient_id when
-- available, and falling back to case-insensitive ingredient_name resolution
-- (creating a catalog row if needed) for manual/unlinked items.

create or replace function public.create_inventory_transaction_for_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_quantity_delta numeric(10,2);

  v_candidate_name text;
  v_ingredient_name text;
  v_ingredient_id uuid;
begin
  -- Resolve the owning user from the parent shopping_trips row
  select user_id
    into v_user_id
    from public.shopping_trips
   where id = NEW.shopping_trip_id;

  if v_user_id is null then
    raise exception 'shopping_trip % not found', NEW.shopping_trip_id;
  end if;

  -- 1) Prefer store_product_id when present (linked products)
  if NEW.store_product_id is not null then
    select sp.ingredient_id
      into v_ingredient_id
      from public.store_products sp
     where sp.id = NEW.store_product_id
     limit 1;

    if v_ingredient_id is not null then
      select i.name
        into v_ingredient_name
        from public.ingredients i
       where i.id = v_ingredient_id
       limit 1;
    end if;
  end if;

  -- 2) Fallback: resolve ingredient_id via free-text names
  if v_ingredient_id is null then
    v_candidate_name := NEW.ingredient_name;
    if v_candidate_name is null then
      v_candidate_name := NEW.product_name;
    end if;

    -- Prefer exact-case matches when ingredient variants exist, otherwise
    -- pick the alphabetically-first canonical row.
    select i.id, i.name
      into v_ingredient_id, v_ingredient_name
      from public.ingredients i
     where lower(trim(i.name)) = lower(trim(v_candidate_name))
     order by case when i.name = v_candidate_name then 0 else 1 end, i.name asc
     limit 1;

    -- If no row exists, create one and select its id again.
    if v_ingredient_id is null then
      insert into public.ingredients (name)
      values (trim(v_candidate_name))
      on conflict (name) do nothing;

      select i.id, i.name
        into v_ingredient_id, v_ingredient_name
        from public.ingredients i
       where lower(trim(i.name)) = lower(trim(v_candidate_name))
       order by case when i.name = v_candidate_name then 0 else 1 end, i.name asc
       limit 1;
    end if;
  end if;

  -- 3) Calculate total quantity added to inventory
  if NEW.pack_quantity is not null then
    v_quantity_delta := NEW.pack_quantity * NEW.quantity_purchased;
  else
    v_quantity_delta := NEW.quantity_purchased;
  end if;

  -- Defensive fallback for ingredient_name (should be non-null after resolution)
  if v_ingredient_name is null then
    v_ingredient_name := v_candidate_name;
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
    v_quantity_delta,
    NEW.pack_unit,
    lower(coalesce(NEW.pack_unit, 'units')),
    'purchase',
    'shopping_trip_item',
    NEW.id,
    now()
  );

  return NEW;
end;
$$;

commit;

