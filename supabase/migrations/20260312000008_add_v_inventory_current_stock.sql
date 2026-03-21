-- ─────────────────────────────────────────────────────────────────────────────
-- v_inventory_current_stock
-- Calculates current inventory levels from all transactions, aggregated
-- per user and ingredient (across all units).
-- ─────────────────────────────────────────────────────────────────────────────
create view public.v_inventory_current_stock as
select
  user_id,
  ingredient_name,
  sum(quantity_delta) as quantity_remaining
from public.inventory_transactions
group by user_id, ingredient_name;
