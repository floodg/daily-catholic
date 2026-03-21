begin;

-- 2026-03-16: Tie inventory_transactions units to measurement_units via unit_code

-- Add canonical unit_code column and backfill from existing unit values.
alter table public.inventory_transactions
  add column if not exists unit_code text;

update public.inventory_transactions
set unit_code = lower(trim(unit))
where unit_code is null
  and unit is not null;

-- Default any remaining null unit_code to 'units' so existing rows are compatible.
update public.inventory_transactions
set unit_code = 'units'
where unit_code is null;

-- Enforce presence and referential integrity against measurement_units.
alter table public.inventory_transactions
  alter column unit_code set not null;

alter table public.inventory_transactions
  add constraint inventory_transactions_unit_code_fk
  foreign key (unit_code) references public.measurement_units(code);

-- Refresh inventory_stock_levels view to aggregate by unit_code.
create or replace view public.inventory_stock_levels as
  select
    user_id,
    ingredient_name,
    unit_code as unit,
    sum(quantity_delta) as current_quantity
  from public.inventory_transactions
  group by user_id, ingredient_name, unit_code;

-- Keep v_inventory_current_stock unchanged: it aggregates across units already.

commit;

