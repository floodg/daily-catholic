begin;

create table if not exists public.fiat_daily_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  checks jsonb not null default '{}',
  score integer not null default 0,
  max_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists fiat_daily_entries_user_day_range
  on public.fiat_daily_entries (user_id, day desc);

alter table public.fiat_daily_entries enable row level security;

create policy "fiat_daily_select_own"
on public.fiat_daily_entries
for select
to authenticated
using (auth.uid() = user_id);

create policy "fiat_daily_insert_own"
on public.fiat_daily_entries
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "fiat_daily_update_own"
on public.fiat_daily_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "fiat_daily_delete_own"
on public.fiat_daily_entries
for delete
to authenticated
using (auth.uid() = user_id);

create trigger set_fiat_daily_entries_updated_at
before update on public.fiat_daily_entries
for each row
execute function public.set_updated_at();

commit;
