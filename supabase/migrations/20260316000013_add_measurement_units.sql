begin;

-- 2026-03-16: Add shared measurement_units lookup for canonical units

create table if not exists public.measurement_units (
  code           text primary key,
  label          text        not null,
  dimension      text        not null,
  base_code      text        null,
  base_multiplier numeric    null,
  created_at     timestamptz not null default now()
);

-- Seed canonical units used across products, ingredients, pantry, and inventory
insert into public.measurement_units (code, label, dimension, base_code, base_multiplier)
values
  -- Mass
  ('g',  'grams',        'mass',   null, null),
  ('kg', 'kilograms',    'mass',   'g',  1000),
  -- Volume
  ('ml', 'millilitres',  'volume', null, null),
  ('l',  'litres',       'volume', 'ml', 1000),
  -- Count
  ('units', 'units',     'count',  null, null),
  -- Kitchen measures (used for recipes only – still canonicalised)
  ('tsp',  'teaspoons',  'volume', null, null),
  ('tbsp', 'tablespoons','volume', null, null),
  ('cup',  'cups',       'volume', null, null)
on conflict (code) do nothing;

commit;

