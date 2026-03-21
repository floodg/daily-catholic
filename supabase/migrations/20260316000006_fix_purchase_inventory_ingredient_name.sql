begin;

-- 2026-03-16: Fix purchase → inventory ingredient name resolution
-- Root cause: purchases wrote product display names (e.g. "Coles Beef Mince 500g")
-- to inventory_transactions.ingredient_name, while meal consumption debits used
-- canonical ingredient names (e.g. "beef mince"). This prevented purchased stock
-- from being deducted by the shopping list because keys never matched.
--
-- Fix: Resolve a canonical ingredient name via the existing store_product_id link
-- to starter_meal_ingredients before writing the inventory transaction. Fall back
-- to NEW.product_name when no link exists (manually-entered items).

create or replace function public.create_inventory_transaction_for_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id         uuid;
  v_quantity_delta  numeric(10,2);
  v_ingredient_name text;
begin
  -- Resolve the owning user from the parent shopping_trips row
  select user_id
    into v_user_id
    from public.shopping_trips
   where id = NEW.shopping_trip_id;

  if v_user_id is null then
    raise exception 'shopping_trip % not found', NEW.shopping_trip_id;
  end if;

  -- Resolve canonical ingredient name via store_product_id FK chain.
  -- Prefer the starter_meal_ingredients.name so it matches what meal
  -- consumption transactions write (meal_ingredients.name).
  if NEW.store_product_id is not null then
    select smi.name
      into v_ingredient_name
      from public.starter_meal_ingredients smi
     where smi.store_product_id = NEW.store_product_id
     limit 1;
  end if;

  -- Fall back to raw product_name for manually-entered items with no product link
  if v_ingredient_name is null then
    v_ingredient_name := NEW.product_name;
  end if;

  -- Calculate total quantity added to inventory
  if NEW.pack_quantity is not null then
    v_quantity_delta := NEW.pack_quantity * NEW.quantity_purchased;
  else
    v_quantity_delta := NEW.quantity_purchased;
  end if;

  insert into public.inventory_transactions (
    user_id,
    ingredient_name,
    quantity_delta,
    unit,
    transaction_type,
    source_type,
    source_id,
    occurred_at
  ) values (
    v_user_id,
    v_ingredient_name,
    v_quantity_delta,
    NEW.pack_unit,
    'purchase',
    'shopping_trip_item',
    NEW.id,
    now()
  );

  return NEW;
end;
$$;

commit;

