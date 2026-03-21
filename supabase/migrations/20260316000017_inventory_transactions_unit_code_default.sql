begin;

-- 2026-03-16: Ensure inventory_transactions.unit_code has a safe default
-- so server-side triggers that do not yet set it explicitly (e.g. purchases
-- from shopping_trip_items) do not violate the NOT NULL constraint.

alter table public.inventory_transactions
  alter column unit_code set default 'units';

commit;

