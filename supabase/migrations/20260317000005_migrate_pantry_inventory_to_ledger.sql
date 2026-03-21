begin;

-- Pantry unification: migrate existing pantry_inventory data into inventory_transactions and pantry_preferences.
-- Run before dropping pantry_inventory. History comment only in SQL (per project rules).

insert into public.inventory_transactions (
  user_id,
  ingredient_name,
  quantity_delta,
  unit,
  unit_code,
  transaction_type,
  source_type,
  source_id,
  occurred_at
)
select
  pi.user_id,
  i.name,
  pi.remaining_qty,
  pi.unit,
  pi.unit_code,
  'manual_adjustment',
  null,
  null,
  now()
from public.pantry_inventory pi
join public.ingredients i on i.id = pi.ingredient_id
where pi.remaining_qty > 0;

insert into public.pantry_preferences (user_id, ingredient_name, unit_code, auto_reorder)
select
  pi.user_id,
  i.name,
  pi.unit_code,
  pi.auto_reorder
from public.pantry_inventory pi
join public.ingredients i on i.id = pi.ingredient_id
on conflict (user_id, ingredient_name, unit_code) do update set
  auto_reorder = excluded.auto_reorder,
  updated_at = now();

commit;
