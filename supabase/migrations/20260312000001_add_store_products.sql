begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- store_products  (product catalogue – Coles etc.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.store_products (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  brand       text        null,
  size_label  text        null,
  store       text        not null default 'Coles',
  product_url text        not null,
  image_url   text        null,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Link starter_meal_ingredients to a primary store product
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.starter_meal_ingredients
  add column if not exists store_product_id uuid null
    references public.store_products(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- starter_meal_ingredient_product_options  (alternative products per ingredient)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.starter_meal_ingredient_product_options (
  id                         uuid    primary key default gen_random_uuid(),
  starter_meal_ingredient_id uuid    not null
    references public.starter_meal_ingredients(id) on delete cascade,
  store_product_id           uuid    not null
    references public.store_products(id) on delete cascade,
  sort_order                 integer not null default 0,
  constraint starter_meal_ingredient_product_options_unique
    unique (starter_meal_ingredient_id, store_product_id)
);

create index if not exists idx_smi_product_options_ingredient
  on public.starter_meal_ingredient_product_options(starter_meal_ingredient_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.store_products enable row level security;

create policy "store_products_select"
  on public.store_products
  for select to authenticated
  using (true);

alter table public.starter_meal_ingredient_product_options enable row level security;

create policy "starter_meal_ingredient_product_options_select"
  on public.starter_meal_ingredient_product_options
  for select to authenticated
  using (true);

commit;
