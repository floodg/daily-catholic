-- Macros feature: user targets and per-ingredient nutrition profiles.
-- Nutrition values are normalized per 100 g or 100 ml. `amount_per_unit`
-- allows unit-based ingredients (for example eggs) to map one unit to a
-- quantity in the selected basis.

create table if not exists public.macro_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calories_kcal numeric(8,2),
  protein_g numeric(8,2),
  fat_g numeric(8,2),
  total_carbs_g numeric(8,2),
  net_carbs_g numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint macro_targets_calories_positive check (calories_kcal is null or calories_kcal > 0),
  constraint macro_targets_protein_positive check (protein_g is null or protein_g > 0),
  constraint macro_targets_fat_positive check (fat_g is null or fat_g > 0),
  constraint macro_targets_total_carbs_positive check (total_carbs_g is null or total_carbs_g > 0),
  constraint macro_targets_net_carbs_positive check (net_carbs_g is null or net_carbs_g > 0)
);

alter table public.macro_targets enable row level security;

create policy "Users can read own macro targets"
  on public.macro_targets for select
  using (auth.uid() = user_id);

create policy "Users can insert own macro targets"
  on public.macro_targets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own macro targets"
  on public.macro_targets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own macro targets"
  on public.macro_targets for delete
  using (auth.uid() = user_id);

create table if not exists public.user_ingredient_nutrition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_key text not null,
  ingredient_name text not null,
  basis_unit text not null default 'g' check (basis_unit in ('g', 'ml')),
  amount_per_unit numeric(10,3),
  calories_kcal_per_100 numeric(10,3) not null default 0,
  protein_g_per_100 numeric(10,3) not null default 0,
  fat_g_per_100 numeric(10,3) not null default 0,
  total_carbs_g_per_100 numeric(10,3) not null default 0,
  fibre_g_per_100 numeric(10,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ingredient_nutrition_key_not_blank check (length(trim(ingredient_key)) > 0),
  constraint user_ingredient_nutrition_name_not_blank check (length(trim(ingredient_name)) > 0),
  constraint user_ingredient_nutrition_amount_per_unit_positive check (amount_per_unit is null or amount_per_unit > 0),
  constraint user_ingredient_nutrition_calories_nonnegative check (calories_kcal_per_100 >= 0),
  constraint user_ingredient_nutrition_protein_nonnegative check (protein_g_per_100 >= 0),
  constraint user_ingredient_nutrition_fat_nonnegative check (fat_g_per_100 >= 0),
  constraint user_ingredient_nutrition_carbs_nonnegative check (total_carbs_g_per_100 >= 0),
  constraint user_ingredient_nutrition_fibre_nonnegative check (fibre_g_per_100 >= 0),
  unique (user_id, ingredient_key)
);

create index if not exists idx_user_ingredient_nutrition_user
  on public.user_ingredient_nutrition(user_id);

alter table public.user_ingredient_nutrition enable row level security;

create policy "Users can read own ingredient nutrition"
  on public.user_ingredient_nutrition for select
  using (auth.uid() = user_id);

create policy "Users can insert own ingredient nutrition"
  on public.user_ingredient_nutrition for insert
  with check (auth.uid() = user_id);

create policy "Users can update own ingredient nutrition"
  on public.user_ingredient_nutrition for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own ingredient nutrition"
  on public.user_ingredient_nutrition for delete
  using (auth.uid() = user_id);
