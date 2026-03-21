begin;

-- 2026-03-16: Add structured size and pack unit codes to store_products

-- Structured size for global catalogue rows.
alter table public.store_products
  add column if not exists size_value numeric,
  add column if not exists size_unit_code text;

-- Canonical pack unit code for user-linked rows (derived from pack_size_*).
alter table public.store_products
  add column if not exists pack_unit_code text;

-- Backfill size_unit_code + size_value for simple size_label patterns.
-- Note: this is best-effort; complex labels remain null and are handled by app parsing.

-- Values ending with 'g' (or ' G')
update public.store_products
set
  size_unit_code = 'g',
  size_value = nullif(regexp_replace(size_label, '[^0-9\\.]+', '', 'g'), '')::numeric
where size_label ~ '[0-9]'
  and lower(size_label) like '%g'
  and size_unit_code is null;

-- Values ending with 'kg'
update public.store_products
set
  size_unit_code = 'kg',
  size_value = nullif(regexp_replace(size_label, '[^0-9\\.]+', '', 'g'), '')::numeric
where size_label ~ '[0-9]'
  and lower(size_label) like '%kg'
  and size_unit_code is null;

-- Values ending with 'ml'
update public.store_products
set
  size_unit_code = 'ml',
  size_value = nullif(regexp_replace(size_label, '[^0-9\\.]+', '', 'g'), '')::numeric
where size_label ~ '[0-9]'
  and lower(size_label) like '%ml'
  and size_unit_code is null;

-- Values ending with 'l'
update public.store_products
set
  size_unit_code = 'l',
  size_value = nullif(regexp_replace(size_label, '[^0-9\\.]+', '', 'g'), '')::numeric
where size_label ~ '[0-9]'
  and lower(size_label) like '%l'
  and lower(size_label) not like '%ml'
  and size_unit_code is null;

-- Plain numeric labels treated as count units.
update public.store_products
set
  size_unit_code = 'units',
  size_value = nullif(regexp_replace(size_label, '[^0-9\\.]+', '', 'g'), '')::numeric
where size_label ~ '^[0-9\\. ]+$'
  and size_unit_code is null;

-- Backfill pack_unit_code from existing pack size columns on user-linked rows.
update public.store_products
set pack_unit_code = 'g'
where pack_size_g is not null
  and pack_unit_code is null;

update public.store_products
set pack_unit_code = 'ml'
where pack_size_ml is not null
  and pack_unit_code is null;

update public.store_products
set pack_unit_code = 'units'
where pack_size_units is not null
  and pack_unit_code is null;

-- Enforce referential integrity against measurement_units where codes are present.
alter table public.store_products
  add constraint store_products_size_unit_code_fk
  foreign key (size_unit_code) references public.measurement_units(code);

alter table public.store_products
  add constraint store_products_pack_unit_code_fk
  foreign key (pack_unit_code) references public.measurement_units(code);

commit;

