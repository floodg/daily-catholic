begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ingredient Model Upgrade
-- Phase 2 · Meal System
-- - meal_ingredients: add quantity (numeric) and unit (text) with constraints
-- - preserve old free-text quantity as quantity_label
-- - ingredients: create catalog with optional & pantry_staple flags
-- - backfill common pantry staples
-- ─────────────────────────────────────────────────────────────────────────────

-- Rename existing free-text quantity to quantity_label to preserve user-entered labels
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meal_ingredients'
      and column_name = 'quantity'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meal_ingredients'
      and column_name = 'quantity_label'
  ) then
    execute 'alter table public.meal_ingredients rename column quantity to quantity_label';
  end if;
end
$$;

-- Add structured quantity + unit on the join table (nullable initially to avoid breaking existing rows)
alter table public.meal_ingredients
  add column if not exists quantity numeric
    constraint meal_ingredients_quantity_check check (quantity > 0),
  add column if not exists unit text
    constraint meal_ingredients_unit_check check (unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup'));

-- ─────────────────────────────────────────────────────────────────────────────
-- ingredients (global catalog with pantry behaviour flags)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ingredients (
  id             uuid        primary key default gen_random_uuid(),
  name           text        unique not null,
  optional       boolean     not null default false,
  pantry_staple  boolean     not null default false,
  created_at     timestamptz not null default now()
);

-- RLS: allow authenticated users to read and manage the catalog
alter table public.ingredients enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'ingredients_select') then
    create policy "ingredients_select"
      on public.ingredients
      for select
      to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'ingredients_insert') then
    create policy "ingredients_insert"
      on public.ingredients
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'ingredients_update') then
    create policy "ingredients_update"
      on public.ingredients
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end
$$;

-- Backfill catalog names from existing data
insert into public.ingredients (name)
select distinct name from public.meal_ingredients
on conflict (name) do nothing;

insert into public.ingredients (name)
select distinct name from public.starter_meal_ingredients
on conflict (name) do nothing;

-- Backfill common pantry staples
update public.ingredients
set pantry_staple = true
where name ilike any (array[
  '%salt%', '%pepper%', '%olive oil%', '%butter%',
  '%garlic powder%', '%cumin%', '%paprika%', '%oregano%'
]);

commit;

