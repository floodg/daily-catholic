begin;

-- ─── programs table ───────────────────────────────────────────────────────────

create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  category    text,
  content     jsonb,
  created_at  timestamptz default now()
);

alter table public.programs enable row level security;

-- All authenticated users can read programs
create policy "programs_select_authenticated"
on public.programs
for select
to authenticated
using (true);

-- Only admins can insert/update/delete programs
create policy "programs_admin_insert"
on public.programs
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

create policy "programs_admin_update"
on public.programs
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

create policy "programs_admin_delete"
on public.programs
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

-- ─── user_programs table ─────────────────────────────────────────────────────

create table if not exists public.user_programs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.user_programs enable row level security;

-- Users can read their own assignments
create policy "user_programs_select_own"
on public.user_programs
for select
to authenticated
using (user_id = auth.uid());

-- Users can insert their own assignments (needed by the trigger / signup logic)
create policy "user_programs_insert_own"
on public.user_programs
for insert
to authenticated
with check (user_id = auth.uid());

-- Admins can read all assignments
create policy "user_programs_admin_select_all"
on public.user_programs
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

-- ─── Seed the default program ─────────────────────────────────────────────────

insert into public.programs (title, category, description, content)
values (
  '110kg Fat Loss Plan',
  'training',
  'Structured program for steady fat loss using walking, fasting and dumbbell training.',
  '{
    "daily_structure": {
      "morning": "Black coffee or protein shake",
      "lunch": "High protein meal",
      "dinner": "Protein + vegetables",
      "protein_target": "160-180g"
    },
    "weekly_structure": {
      "fast_days": 2,
      "standard_days": 5,
      "description": "2 extended fast days per week, normal meals on other days"
    },
    "walking": {
      "frequency": "daily",
      "duration": "40 minutes"
    },
    "strength_training": {
      "days": 3,
      "schedule": ["Monday", "Wednesday", "Friday"],
      "exercises": [
        "Goblet Squat",
        "Romanian Deadlift",
        "Dumbbell Floor Press",
        "Single Arm Row",
        "Overhead Press",
        "Plank"
      ]
    }
  }'::jsonb
)
on conflict do nothing;

-- ─── Auto-assign default program to new users ─────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
begin
  -- Create profile
  insert into public.profiles (
    id,
    email,
    display_name,
    role,
    approved
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'user',
    true
  )
  on conflict (id) do nothing;

  -- Assign the default program
  select id into v_program_id
  from public.programs
  where title = '110kg Fat Loss Plan'
  limit 1;

  if v_program_id is not null then
    insert into public.user_programs (user_id, program_id)
    values (new.id, v_program_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

commit;
