begin;

-- 2026-03-24: canonical ingredient -> alternative store products (global)

create table if not exists public.ingredient_store_product_options (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  store_product_id uuid not null references public.store_products(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ingredient_store_product_options_unique
    unique (ingredient_id, store_product_id)
);

create index if not exists idx_ispo_ingredient_sort
  on public.ingredient_store_product_options(ingredient_id, sort_order);

alter table public.ingredient_store_product_options enable row level security;

drop policy if exists "ingredient_store_product_options_select" on public.ingredient_store_product_options;
create policy "ingredient_store_product_options_select"
  on public.ingredient_store_product_options
  for select
  to authenticated
  using (true);

drop policy if exists "ingredient_store_product_options_insert" on public.ingredient_store_product_options;
create policy "ingredient_store_product_options_insert"
  on public.ingredient_store_product_options
  for insert
  to authenticated
  with check (true);

drop policy if exists "ingredient_store_product_options_update" on public.ingredient_store_product_options;
create policy "ingredient_store_product_options_update"
  on public.ingredient_store_product_options
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "ingredient_store_product_options_delete" on public.ingredient_store_product_options;
create policy "ingredient_store_product_options_delete"
  on public.ingredient_store_product_options
  for delete
  to authenticated
  using (true);

-- Backfill from starter meal ingredient options into canonical ingredient options.
insert into public.ingredient_store_product_options (
  ingredient_id,
  store_product_id,
  sort_order
)
select
  smi.ingredient_id,
  smipo.store_product_id,
  min(smipo.sort_order) as sort_order
from public.starter_meal_ingredient_product_options smipo
join public.starter_meal_ingredients smi
  on smi.id = smipo.starter_meal_ingredient_id
where smi.ingredient_id is not null
group by smi.ingredient_id, smipo.store_product_id
on conflict (ingredient_id, store_product_id) do nothing;

commit;
