begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Store Product Linking (Phase 3 · Pantry Engine)
-- Extend existing public.store_products to support per-user ingredient links.
--
-- Notes:
-- - We already have a global product catalogue in public.store_products used by
--   starter content. To avoid breaking that, user-linked rows will set user_id
--   and ingredient_id; global catalogue rows keep these as NULL.
-- - RLS is updated so authenticated users can read global rows and their own
--   linked rows, and can only insert/update/delete their own linked rows.
-- - Enforce that user-linked rows have at least one pack size populated.
-- ─────────────────────────────────────────────────────────────────────────────

-- Columns for per-user ingredient linking
alter table public.store_products
  add column if not exists user_id uuid null
    references auth.users(id) on delete cascade,
  add column if not exists ingredient_id uuid null
    references public.ingredients(id) on delete cascade,
  add column if not exists pack_size_g numeric check (pack_size_g > 0),
  add column if not exists pack_size_ml numeric check (pack_size_ml > 0),
  add column if not exists pack_size_units numeric check (pack_size_units > 0),
  add column if not exists barcode text;

-- Ensure at least one pack size is provided for user-linked rows
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_products_pack_size_required'
  ) then
    alter table public.store_products
      add constraint store_products_pack_size_required
      check (
        user_id is null
        or pack_size_g is not null
        or pack_size_ml is not null
        or pack_size_units is not null
      );
  end if;
end$$;

-- One linked product per (user, ingredient)
-- Switch to a table-level UNIQUE constraint so ON CONFLICT works via PostgREST.
-- Drop prior partial unique index if present (older iterations).
do $$
begin
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'store_products'
      and indexname = 'uniq_store_products_user_ingredient'
  ) then
    drop index if exists public.uniq_store_products_user_ingredient;
  end if;
end$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_products'::regclass
      and conname = 'store_products_user_ingredient_unique'
  ) then
    alter table public.store_products
      add constraint store_products_user_ingredient_unique
      unique (user_id, ingredient_id);
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- Read:  any authenticated user can see global catalogue rows (user_id is null)
--        plus their own linked rows (user_id = auth.uid()).
-- Write: only the owner (auth.uid()) can insert/update/delete linked rows.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.store_products enable row level security;

-- Replace any broad select policy with scoped policies
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_select'
  ) then
    drop policy "store_products_select" on public.store_products;
  end if;
end$$;

-- Read global catalogue and own links
drop policy if exists "store_products_select_global_or_own" on public.store_products;
create policy "store_products_select_global_or_own"
  on public.store_products
  for select
  to authenticated
  using (user_id is null or auth.uid() = user_id);

-- Insert own links
drop policy if exists "store_products_insert_own" on public.store_products;
create policy "store_products_insert_own"
  on public.store_products
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Update own links
drop policy if exists "store_products_update_own" on public.store_products;
create policy "store_products_update_own"
  on public.store_products
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete own links
drop policy if exists "store_products_delete_own" on public.store_products;
create policy "store_products_delete_own"
  on public.store_products
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;

