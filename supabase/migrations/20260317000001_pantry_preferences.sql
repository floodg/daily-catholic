begin;

-- Pantry unification: preferences per (user, ingredient, unit) for auto_reorder.
-- Stock remains in inventory_transactions; this table stores only flags the ledger does not.

create table if not exists public.pantry_preferences (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  ingredient_name  text not null,
  unit_code        text not null references public.measurement_units(code) on delete restrict,
  auto_reorder     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, ingredient_name, unit_code)
);

create index if not exists idx_pantry_preferences_user_id
  on public.pantry_preferences(user_id);

alter table public.pantry_preferences enable row level security;

create policy "pantry_preferences_select_own"
  on public.pantry_preferences for select to authenticated
  using (user_id = auth.uid());

create policy "pantry_preferences_insert_own"
  on public.pantry_preferences for insert to authenticated
  with check (user_id = auth.uid());

create policy "pantry_preferences_update_own"
  on public.pantry_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "pantry_preferences_delete_own"
  on public.pantry_preferences for delete to authenticated
  using (user_id = auth.uid());

commit;
