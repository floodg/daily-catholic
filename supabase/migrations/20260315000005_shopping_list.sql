begin;

-- Shopping List (Phase 3 · Pantry Engine)
-- Tracks items that should be purchased soon. Rows are scoped per user and
-- keyed by (user_id, ingredient_id) for "unpurchased" entries so upserts are
-- idempotent.

create table if not exists public.shopping_list (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  ingredient_id uuid        not null references public.ingredients(id) on delete cascade,
  product_id    uuid        null references public.store_products(id) on delete set null,
  source        text        not null, -- e.g. 'auto_pantry', 'manual'
  added_at      timestamptz not null default now(),
  purchased_at  timestamptz null
);

-- Enforce one active (unpurchased) row per (user, ingredient)
create unique index if not exists ux_shopping_list_unpurchased
  on public.shopping_list (user_id, ingredient_id)
  where purchased_at is null;

-- RLS: users can see and manage only their list items
alter table public.shopping_list enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_list' and policyname = 'shopping_list_select_own'
  ) then
    create policy "shopping_list_select_own"
      on public.shopping_list
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_list' and policyname = 'shopping_list_insert_own'
  ) then
    create policy "shopping_list_insert_own"
      on public.shopping_list
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_list' and policyname = 'shopping_list_update_own'
  ) then
    create policy "shopping_list_update_own"
      on public.shopping_list
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_list' and policyname = 'shopping_list_delete_own'
  ) then
    create policy "shopping_list_delete_own"
      on public.shopping_list
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end$$;

commit;

