begin;

-- Add onboarding flag to profiles
alter table public.profiles
  add column if not exists has_completed_onboarding boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- starter_meals  (global read-only catalog seeded once)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.starter_meals (
  id              uuid        primary key default gen_random_uuid(),
  slug            text        unique not null,
  name            text        not null,
  description     text        null,
  tags            text[]      not null default '{}',
  prep_time_mins  integer     null,
  cook_time_mins  integer     null,
  instructions    jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- starter_meal_ingredients
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.starter_meal_ingredients (
  id               uuid    primary key default gen_random_uuid(),
  starter_meal_id  uuid    not null references public.starter_meals(id) on delete cascade,
  name             text    not null,
  quantity         text    null,
  store            text    null default 'Coles',
  notes            text    null,
  sort_order       integer not null default 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- meals  (user-owned copies / custom meals)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.meals (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users(id) on delete cascade,
  source_starter_meal_id uuid       null references public.starter_meals(id) on delete set null,
  name                  text        not null,
  description           text        null,
  tags                  text[]      not null default '{}',
  prep_time_mins        integer     null,
  cook_time_mins        integer     null,
  instructions          jsonb       not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_meals_user_id on public.meals(user_id);

create trigger set_meals_updated_at
  before update on public.meals
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- meal_ingredients
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.meal_ingredients (
  id          uuid    primary key default gen_random_uuid(),
  meal_id     uuid    not null references public.meals(id) on delete cascade,
  name        text    not null,
  quantity    text    null,
  store       text    null default 'Coles',
  notes       text    null,
  sort_order  integer not null default 0
);

create index if not exists idx_meal_ingredients_meal_id on public.meal_ingredients(meal_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- planned_meals
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.planned_meals (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    not null references auth.users(id) on delete cascade,
  meal_id      uuid    not null references public.meals(id) on delete cascade,
  planned_date date    not null,
  meal_slot    text    not null,
  planned_time text    null,
  notes        text    null,
  created_at   timestamptz not null default now(),
  constraint planned_meals_meal_slot_check
    check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  constraint planned_meals_unique
    unique (user_id, planned_date, meal_slot, meal_id)
);

create index if not exists idx_planned_meals_user_id on public.planned_meals(user_id);
create index if not exists idx_planned_meals_date    on public.planned_meals(planned_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

-- starter_meals: authenticated users can read
alter table public.starter_meals enable row level security;

create policy "starter_meals_select"
  on public.starter_meals
  for select
  to authenticated
  using (true);

-- starter_meal_ingredients: authenticated users can read
alter table public.starter_meal_ingredients enable row level security;

create policy "starter_meal_ingredients_select"
  on public.starter_meal_ingredients
  for select
  to authenticated
  using (true);

-- meals: users own their rows
alter table public.meals enable row level security;

create policy "meals_select_own"
  on public.meals for select to authenticated
  using (auth.uid() = user_id);

create policy "meals_insert_own"
  on public.meals for insert to authenticated
  with check (auth.uid() = user_id);

create policy "meals_update_own"
  on public.meals for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "meals_delete_own"
  on public.meals for delete to authenticated
  using (auth.uid() = user_id);

-- meal_ingredients: access through parent meal ownership
alter table public.meal_ingredients enable row level security;

create policy "meal_ingredients_select_own"
  on public.meal_ingredients for select to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_ingredients.meal_id
        and m.user_id = auth.uid()
    )
  );

create policy "meal_ingredients_insert_own"
  on public.meal_ingredients for insert to authenticated
  with check (
    exists (
      select 1 from public.meals m
      where m.id = meal_ingredients.meal_id
        and m.user_id = auth.uid()
    )
  );

create policy "meal_ingredients_update_own"
  on public.meal_ingredients for update to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_ingredients.meal_id
        and m.user_id = auth.uid()
    )
  );

create policy "meal_ingredients_delete_own"
  on public.meal_ingredients for delete to authenticated
  using (
    exists (
      select 1 from public.meals m
      where m.id = meal_ingredients.meal_id
        and m.user_id = auth.uid()
    )
  );

-- planned_meals: users own their rows
alter table public.planned_meals enable row level security;

create policy "planned_meals_select_own"
  on public.planned_meals for select to authenticated
  using (auth.uid() = user_id);

create policy "planned_meals_insert_own"
  on public.planned_meals for insert to authenticated
  with check (auth.uid() = user_id);

create policy "planned_meals_update_own"
  on public.planned_meals for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "planned_meals_delete_own"
  on public.planned_meals for delete to authenticated
  using (auth.uid() = user_id);

commit;
