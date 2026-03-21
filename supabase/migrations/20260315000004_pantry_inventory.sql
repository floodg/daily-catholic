begin;

-- Pantry Inventory Tracking (Phase 3 · Pantry Engine)
-- Creates pantry_inventory as the source of truth for stock levels.

create table if not exists public.pantry_inventory (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  product_id         uuid references public.store_products(id) on delete set null,
  ingredient_id      uuid not null references public.ingredients(id) on delete cascade,
  purchased_qty      numeric not null default 0 check (purchased_qty >= 0),
  consumed_qty       numeric not null default 0 check (consumed_qty >= 0),
  remaining_qty      numeric generated always as (purchased_qty - consumed_qty) stored,
  unit               text not null,
  last_purchase_date date,
  auto_reorder       boolean not null default true,
  updated_at         timestamptz default now(),
  unique (user_id, ingredient_id, unit)
);

alter table public.pantry_inventory enable row level security;
create policy "Users manage own pantry" on public.pantry_inventory
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Helper: add stock via packs × pack_size with upsert increment semantics.
-- This is exposed to the app via Supabase RPC.
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
    (user_id, ingredient_id, product_id, purchased_qty, unit, last_purchase_date, updated_at)
  values
    (p_user_id, p_ingredient_id, p_product_id, p_qty, p_unit, current_date, now())
  on conflict (user_id, ingredient_id, unit)
  do update set
    purchased_qty = public.pantry_inventory.purchased_qty + excluded.purchased_qty,
    product_id = excluded.product_id,
    last_purchase_date = excluded.last_purchase_date,
    updated_at = now()
  returning *;
$$;

commit;

