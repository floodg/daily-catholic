begin;

-- 2026-03-22: Guard meal_consumption inserts against future stock usage
-- Ensures that if a meal consumption ledger row is attempted when there is
-- no stock as-of the transaction's occurred_at, the row is skipped entirely.
-- If some stock exists but is less than the requested debit, the quantity is
-- capped to the available as-of stock. This complements mark_meal_eaten and
-- protects against any out-of-band writers.

create or replace function public.before_insert_cap_meal_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available numeric;
begin
  -- Apply only to meal_consumption debits
  if new.transaction_type <> 'meal_consumption' then
    return new;
  end if;

  -- Only process negative deltas (debits)
  if new.quantity_delta >= 0 then
    return new;
  end if;

  -- Compute available stock strictly as-of occurred_at
  select coalesce(sum(it.quantity_delta), 0)
    into v_available
  from public.inventory_transactions it
  where it.user_id = new.user_id
    and it.ingredient_id is not distinct from new.ingredient_id
    and it.ingredient_name = new.ingredient_name
    and it.unit_code = new.unit_code
    and it.occurred_at <= coalesce(new.occurred_at, now());

  if v_available <= 0 then
    -- No stock at that time: skip inserting this debit entirely
    return null;
  end if;

  -- Cap the debit so it never exceeds available stock
  -- new.quantity_delta is negative; use abs for comparison
  if abs(new.quantity_delta) > v_available then
    new.quantity_delta := -v_available;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_before_insert_cap_meal_consumption
  on public.inventory_transactions;

create trigger trg_before_insert_cap_meal_consumption
  before insert on public.inventory_transactions
  for each row
  execute function public.before_insert_cap_meal_consumption();

commit;

