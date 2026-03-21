begin;

-- Pantry unification: pantry and stock now use inventory_transactions and inventory_stock_levels.
-- Remove legacy pantry_inventory table and pantry_add_stock RPC.

drop function if exists public.pantry_add_stock(uuid, uuid, uuid, numeric, text);

drop table if exists public.pantry_inventory;

commit;
