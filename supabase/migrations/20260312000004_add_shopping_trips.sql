begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- shopping_trips  (one grocery shopping event per row)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.shopping_trips (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  store         text        not null default 'Coles',
  purchased_at  timestamptz not null default now(),
  notes         text        null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_shopping_trips_user_id
  on public.shopping_trips(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- shopping_trip_items  (products purchased during a shopping trip)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.shopping_trip_items (
  id                  uuid           primary key default gen_random_uuid(),
  shopping_trip_id    uuid           not null
    references public.shopping_trips(id) on delete cascade,
  product_name        text           not null,
  quantity_purchased  numeric(10,2)  not null default 1,
  pack_quantity       numeric(10,2)  null,
  pack_unit           text           null,
  created_at          timestamptz    not null default now()
);

create index if not exists idx_shopping_trip_items_trip_id
  on public.shopping_trip_items(shopping_trip_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.shopping_trips enable row level security;

create policy "shopping_trips_select_own"
  on public.shopping_trips
  for select to authenticated
  using (auth.uid() = user_id);

create policy "shopping_trips_insert_own"
  on public.shopping_trips
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "shopping_trips_update_own"
  on public.shopping_trips
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "shopping_trips_delete_own"
  on public.shopping_trips
  for delete to authenticated
  using (auth.uid() = user_id);

alter table public.shopping_trip_items enable row level security;

create policy "shopping_trip_items_select_own"
  on public.shopping_trip_items
  for select to authenticated
  using (
    exists (
      select 1 from public.shopping_trips st
      where st.id = shopping_trip_id
        and st.user_id = auth.uid()
    )
  );

create policy "shopping_trip_items_insert_own"
  on public.shopping_trip_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.shopping_trips st
      where st.id = shopping_trip_id
        and st.user_id = auth.uid()
    )
  );

create policy "shopping_trip_items_update_own"
  on public.shopping_trip_items
  for update to authenticated
  using (
    exists (
      select 1 from public.shopping_trips st
      where st.id = shopping_trip_id
        and st.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shopping_trips st
      where st.id = shopping_trip_id
        and st.user_id = auth.uid()
    )
  );

create policy "shopping_trip_items_delete_own"
  on public.shopping_trip_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.shopping_trips st
      where st.id = shopping_trip_id
        and st.user_id = auth.uid()
    )
  );

commit;
