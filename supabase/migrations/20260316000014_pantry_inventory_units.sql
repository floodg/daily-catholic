begin;

-- 2026-03-16: Tie pantry_inventory units to measurement_units via unit_code

-- Add canonical unit_code column and backfill from existing unit values.
alter table public.pantry_inventory
  add column if not exists unit_code text;

update public.pantry_inventory
set unit_code = lower(trim(unit))
where unit_code is null
  and unit is not null;

-- Default any still-null unit_code to 'units' to avoid breaking uniqueness;
-- this should be rare and can be cleaned up manually if needed.
update public.pantry_inventory
set unit_code = 'units'
where unit_code is null;

-- Enforce that unit_code is always set and references measurement_units.
alter table public.pantry_inventory
  alter column unit_code set not null;

alter table public.pantry_inventory
  add constraint pantry_inventory_unit_code_fk
  foreign key (unit_code) references public.measurement_units(code);

-- Switch uniqueness and helper function to rely on unit_code.

-- Replace unique constraint on (user_id, ingredient_id, unit) with unit_code.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pantry_inventory'::regclass
      and contype = 'u'
      and conname = 'pantry_inventory_user_ingredient_unit_key'
  ) then
    alter table public.pantry_inventory
      drop constraint pantry_inventory_user_ingredient_unit_key;
  end if;
end$$;

alter table public.pantry_inventory
  add constraint pantry_inventory_user_ingredient_unit_code_key
  unique (user_id, ingredient_id, unit_code);

-- Update RPC helper to write unit_code and use it for upsert semantics.
create or replace function public.pantry_add_stock(
  p_user_id uuid,
  p_ingredient_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_unit text
) returns public.pantry_inventory
language sql
security invoker
as $$
  insert into public.pantry_inventory
    (user_id, ingredient_id, product_id, purchased_qty, unit, unit_code, last_purchase_date, updated_at)
  values
    (p_user_id, p_ingredient_id, p_product_id, p_qty, p_unit, lower(trim(p_unit)), current_date, now())
  on conflict (user_id, ingredient_id, unit_code)
  do update set
    purchased_qty = public.pantry_inventory.purchased_qty + excluded.purchased_qty,
    product_id = excluded.product_id,
    last_purchase_date = excluded.last_purchase_date,
    updated_at = now()
  returning *;
$$;

commit;

