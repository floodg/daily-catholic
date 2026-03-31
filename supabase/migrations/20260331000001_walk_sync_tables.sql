begin;

-- Shared walk sync tables for oval-walker uploads and daily-catholic reads.
create table if not exists public.walk_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_session_key text not null unique,
  source_app text not null default 'oval-walker',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  elapsed_ms bigint not null,
  active_ms bigint not null,
  paused_ms bigint not null,
  total_steps integer not null,
  total_laps integer not null,
  lap_distance_meters double precision not null,
  total_distance_meters double precision not null,
  avg_pace_sec_per_km double precision not null,
  avg_speed_kmh double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint walk_sessions_elapsed_nonnegative check (elapsed_ms >= 0),
  constraint walk_sessions_active_nonnegative check (active_ms >= 0),
  constraint walk_sessions_paused_nonnegative check (paused_ms >= 0),
  constraint walk_sessions_steps_nonnegative check (total_steps >= 0),
  constraint walk_sessions_laps_nonnegative check (total_laps >= 0),
  constraint walk_sessions_ended_after_start check (ended_at >= started_at)
);

create index if not exists walk_sessions_user_started_idx
on public.walk_sessions(user_id, started_at desc);

alter table public.walk_sessions enable row level security;

create policy "walk_sessions_select_own"
on public.walk_sessions
for select
to authenticated
using (auth.uid() = user_id);

create policy "walk_sessions_insert_own"
on public.walk_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "walk_sessions_update_own"
on public.walk_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "walk_sessions_delete_own"
on public.walk_sessions
for delete
to authenticated
using (auth.uid() = user_id);

create trigger set_walk_sessions_updated_at
before update on public.walk_sessions
for each row
execute function public.set_updated_at();

-- Each uploaded lap belongs to one synced walk session.
create table if not exists public.walk_laps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.walk_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_lap_key text not null unique,
  lap_number integer not null,
  lap_started_at timestamptz not null,
  lap_ended_at timestamptz not null,
  lap_time_ms bigint not null,
  cumulative_time_ms bigint not null,
  lap_steps integer not null,
  cumulative_steps integer not null,
  lap_distance_meters double precision not null,
  lap_pace_sec_per_km double precision not null,
  lap_speed_kmh double precision not null,
  trigger_latitude double precision not null,
  trigger_longitude double precision not null,
  created_at timestamptz not null default now(),
  constraint walk_laps_number_positive check (lap_number > 0),
  constraint walk_laps_time_nonnegative check (lap_time_ms >= 0),
  constraint walk_laps_cumulative_time_nonnegative check (cumulative_time_ms >= 0),
  constraint walk_laps_steps_nonnegative check (lap_steps >= 0),
  constraint walk_laps_cumulative_steps_nonnegative check (cumulative_steps >= 0),
  constraint walk_laps_ended_after_start check (lap_ended_at >= lap_started_at)
);

create index if not exists walk_laps_session_number_idx
on public.walk_laps(session_id, lap_number asc);

create index if not exists walk_laps_user_created_idx
on public.walk_laps(user_id, created_at desc);

alter table public.walk_laps enable row level security;

create policy "walk_laps_select_own"
on public.walk_laps
for select
to authenticated
using (auth.uid() = user_id);

create policy "walk_laps_insert_own"
on public.walk_laps
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.walk_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
);

create policy "walk_laps_update_own"
on public.walk_laps
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.walk_sessions ws
    where ws.id = session_id
      and ws.user_id = auth.uid()
  )
);

create policy "walk_laps_delete_own"
on public.walk_laps
for delete
to authenticated
using (auth.uid() = user_id);

commit;
