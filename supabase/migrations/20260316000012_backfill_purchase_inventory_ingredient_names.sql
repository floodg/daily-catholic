begin;

-- 2026-03-16: Backfill purchase inventory ingredient names
-- Purpose: For historical rows created before the trigger fix, update
-- inventory_transactions.ingredient_name for purchase entries to the
-- canonical ingredient name resolved via the shopping_trip_items linkage.
--
-- Resolution order:
--  1) If the shopping_trip_item has store_product_id, choose the name from
--     starter_meal_ingredients for that product, preferring a row whose name
--     matches shopping_trip_items.ingredient_name when present.
--  2) Else fall back to shopping_trip_items.ingredient_name.
--  3) Else fall back to shopping_trip_items.product_name.
--
-- Only updates rows where the resolved name differs (case-insensitive) from
-- the existing ingredient_name to avoid unnecessary churn.

with resolved as (
  select
    it.id as tx_id,
    coalesce(
      (
        select smi.name
        from public.starter_meal_ingredients smi
        where smi.store_product_id = sti.store_product_id
        order by
          case
            when sti.ingredient_name is not null
                 and lower(smi.name) = lower(sti.ingredient_name) then 0
            else 1
          end,
          smi.name asc
        limit 1
      ),
      sti.ingredient_name,
      sti.product_name
    ) as resolved_name
  from public.inventory_transactions it
  join public.shopping_trip_items sti
    on it.source_type = 'shopping_trip_item'
   and it.source_id = sti.id
  where it.transaction_type = 'purchase'
)
update public.inventory_transactions it
set ingredient_name = r.resolved_name
from resolved r
where it.id = r.tx_id
  and lower(coalesce(it.ingredient_name, '')) <> lower(coalesce(r.resolved_name, ''));

commit;

