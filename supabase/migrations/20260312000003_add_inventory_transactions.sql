begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- inventory_transactions  (ledger for ingredient stock changes)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inventory_transactions (
  id               uuid        primary key default gen_random_uuid(),

  user_id          uuid        not null
    references public.profiles(id) on delete cascade,

  ingredient_name  text        not null,

  quantity_delta   numeric(10,2) not null,

  unit             text        null,

  transaction_type text        not null,

  source_type      text        null,
  source_id        uuid        null,

  occurred_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists idx_inventory_transactions_user_id
  on public.inventory_transactions(user_id);

create index if not exists idx_inventory_transactions_ingredient
  on public.inventory_transactions(user_id, ingredient_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- inventory_stock_levels  (current stock per user/ingredient via aggregation)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.inventory_stock_levels as
  select
    user_id,
    ingredient_name,
    unit,
    sum(quantity_delta) as current_quantity
  from public.inventory_transactions
  group by user_id, ingredient_name, unit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.inventory_transactions enable row level security;

-- Users can read their own transactions
create policy "inventory_transactions_select"
  on public.inventory_transactions
  for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert their own transactions
create policy "inventory_transactions_insert"
  on public.inventory_transactions
  for insert
  to authenticated
  with check (user_id = auth.uid());

commit;
