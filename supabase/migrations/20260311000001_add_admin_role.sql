begin;

-- Add admin-related fields to profiles
alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists approved boolean not null default true,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id);

-- Update the handle_new_user trigger to explicitly set role and approved
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

  return new;
end;
$$;

-- Admin policies: admins can view all profiles
create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Admin policies: admins can update any profile (e.g. suspend, promote, deactivate)
create policy "profiles_admin_update_all"
on public.profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Admin policies: admins can delete any profile
create policy "profiles_admin_delete_all"
on public.profiles
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Trigger: automatically set approved_at when a profile is approved
create or replace function public.set_approved_at()
returns trigger
language plpgsql
as $$
begin
  if new.approved = true and (old.approved = false or old.approved is null) then
    new.approved_at = now();
  end if;
  return new;
end;
$$;

create trigger profiles_set_approved_at
before update on public.profiles
for each row
execute function public.set_approved_at();

-- To promote the first admin user, run the following SQL in the Supabase SQL editor
-- (replace the email with the actual admin email):
--
--   update public.profiles
--   set role = 'admin', approved = true
--   where email = 'admin@example.com';
--
-- Only users with role = 'admin' can access the /admin dashboard.

commit;
