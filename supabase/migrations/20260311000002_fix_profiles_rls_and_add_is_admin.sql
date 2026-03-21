begin;

-- Drop the recursive profiles admin policies that query public.profiles
-- from within a public.profiles policy (causing infinite recursion: 42P17)
drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "profiles_admin_delete_all" on public.profiles;

-- Create a security-definer helper function that safely determines whether
-- the current authenticated user has role = 'admin'.
--
-- Using SECURITY DEFINER means the function runs with the permissions of its
-- owner (postgres) and bypasses RLS on public.profiles, which avoids the
-- infinite recursion that would occur if a profiles policy called a function
-- that itself queried profiles under RLS.
create or replace function public.is_admin()
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Restrict function execution to authenticated users only
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Recreate safe profiles admin policies using the is_admin() helper
create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "profiles_admin_update_all"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_admin_delete_all"
on public.profiles
for delete
to authenticated
using (public.is_admin());

commit;
