begin;

-- 2026-03-16: Purchase name resolution should prefer the matching ingredient
-- When a store_product_id is linked to multiple starter_meal_ingredients with
-- different names (e.g. "Cheese" vs "Mozzarella cheese"), prefer the row whose
-- name matches the shopping_trip_items.ingredient_name carried from "Add from Meal".

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

  -- Resolve canonical ingredient name via store_product_id FK chain,
  -- preferring a name that matches NEW.ingredient_name when present.
  if NEW.store_product_id is not null then
    select smi.name
      into v_ingredient_name
      from public.starter_meal_ingredients smi
     where smi.store_product_id = NEW.store_product_id
     order by
       case
         when NEW.ingredient_name is not null
              and lower(smi.name) = lower(NEW.ingredient_name) then 0
         else 1
       end,
       smi.name asc
     limit 1;
  end if;

  -- Fall back to the carried ingredient_name (from Add from Meal) when set
  if v_ingredient_name is null and NEW.ingredient_name is not null then
    v_ingredient_name := NEW.ingredient_name;
  end if;

  -- Final fallback to raw product_name for manually-entered items
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

