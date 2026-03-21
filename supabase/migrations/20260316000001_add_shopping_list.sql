begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- shopping_list  (open shopping list items per user)
-- Replaces the earlier ingredient_id-based design (20260315000005) with a
-- text-keyed, is_checked-based design.
-- Adds a row when pantry stock hits zero after meal completion.
-- Enforces at most one open (unchecked) item per ingredient per user.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop prior version of this table (different schema, created in 20260315000005)
drop table if exists public.shopping_list cascade;

create table public.shopping_list (
  id                 uuid         primary key default gen_random_uuid(),

  user_id            uuid         not null
    references public.profiles(id) on delete cascade,

  ingredient_name    text         not null,

  -- Optional hints for future UI; not enforced by logic here
  unit               text         null,
  requested_quantity numeric(10,2) null,

  -- Whether the item has been purchased/cleared
  is_checked         boolean      not null default false,

  -- Origin of the item (e.g. 'auto_out_of_stock', 'manual')
  source             text         not null default 'auto_out_of_stock',

  created_at         timestamptz  not null default now()
);

create index if not exists idx_shopping_list_user_id
  on public.shopping_list(user_id);

-- Ensure at most one open (unchecked) item exists per (user, ingredient)
create unique index if not exists uniq_open_shopping_item_per_ingredient
  on public.shopping_list (user_id, lower(ingredient_name))
  where is_checked = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.shopping_list enable row level security;

-- Users can read their own shopping list items
create policy "shopping_list_select_own"
  on public.shopping_list
  for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert their own shopping list items
create policy "shopping_list_insert_own"
  on public.shopping_list
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can update (e.g. check off) their own items
create policy "shopping_list_update_own"
  on public.shopping_list
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete their own items
create policy "shopping_list_delete_own"
  on public.shopping_list
  for delete
  to authenticated
  using (user_id = auth.uid());

commit;

