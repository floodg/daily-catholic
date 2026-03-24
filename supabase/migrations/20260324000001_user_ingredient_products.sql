begin;

-- 2026-03-24: per-user ingredient default product + alternatives

create table if not exists public.user_ingredient_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  store_product_id uuid not null references public.store_products(id) on delete cascade,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ingredient_products_unique unique (user_id, ingredient_id, store_product_id)
);

create index if not exists idx_uip_user_ingredient
  on public.user_ingredient_products(user_id, ingredient_id);

create index if not exists idx_uip_user_ingredient_sort
  on public.user_ingredient_products(user_id, ingredient_id, sort_order);

create unique index if not exists uniq_uip_one_default_per_ingredient
  on public.user_ingredient_products(user_id, ingredient_id)
  where is_default = true;

create or replace function public.set_user_ingredient_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_uip_updated_at on public.user_ingredient_products;
create trigger trg_uip_updated_at
before update on public.user_ingredient_products
for each row execute function public.set_user_ingredient_products_updated_at();

alter table public.user_ingredient_products enable row level security;

drop policy if exists "user_ingredient_products_select_own" on public.user_ingredient_products;
create policy "user_ingredient_products_select_own"
  on public.user_ingredient_products
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_ingredient_products_insert_own" on public.user_ingredient_products;
create policy "user_ingredient_products_insert_own"
  on public.user_ingredient_products
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_ingredient_products_update_own" on public.user_ingredient_products;
create policy "user_ingredient_products_update_own"
  on public.user_ingredient_products
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_ingredient_products_delete_own" on public.user_ingredient_products;
create policy "user_ingredient_products_delete_own"
  on public.user_ingredient_products
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Backfill defaults from legacy per-user linked rows in store_products.
insert into public.user_ingredient_products (
  user_id,
  ingredient_id,
  store_product_id,
  is_default,
  sort_order
)
select
  sp.user_id,
  sp.ingredient_id,
  sp.id,
  true as is_default,
  0 as sort_order
from public.store_products sp
where sp.user_id is not null
  and sp.ingredient_id is not null
on conflict (user_id, ingredient_id, store_product_id) do nothing;

commit;
