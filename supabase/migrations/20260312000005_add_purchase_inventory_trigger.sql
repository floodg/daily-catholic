begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger function: create an inventory transaction when a shopping trip item
-- is inserted.
--
-- quantity_delta = pack_quantity * quantity_purchased
--   (falls back to quantity_purchased when pack_quantity is NULL)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_inventory_transaction_for_purchase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid;
  v_quantity_delta numeric(10,2);
begin
  -- Resolve the owning user from the parent shopping_trips row
  select user_id
    into v_user_id
    from public.shopping_trips
   where id = NEW.shopping_trip_id;

  if v_user_id is null then
    raise exception 'shopping_trip % not found', NEW.shopping_trip_id;
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
    NEW.product_name,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: fire after each shopping_trip_items INSERT
-- ─────────────────────────────────────────────────────────────────────────────

create trigger trg_shopping_trip_item_create_inventory_transaction
  after insert on public.shopping_trip_items
  for each row
  execute function public.create_inventory_transaction_for_purchase();

commit;
