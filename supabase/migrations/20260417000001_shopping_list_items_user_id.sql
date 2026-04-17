-- Migration: add user_id to shopping_list_items and enable RLS
-- History:
-- 2026-04-17: Add user_id so items are scoped to the syncing user

alter table public.shopping_list_items
  add column if not exists user_id uuid null
    references public.profiles(id) on delete cascade;

create index if not exists idx_shopping_list_items_user_id
  on public.shopping_list_items(user_id);

alter table public.shopping_list_items enable row level security;

drop policy if exists "shopping_list_items_select_own" on public.shopping_list_items;
create policy "shopping_list_items_select_own"
  on public.shopping_list_items
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "shopping_list_items_insert_own" on public.shopping_list_items;
create policy "shopping_list_items_insert_own"
  on public.shopping_list_items
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "shopping_list_items_delete_own" on public.shopping_list_items;
create policy "shopping_list_items_delete_own"
  on public.shopping_list_items
  for delete
  to authenticated
  using (user_id = auth.uid());
