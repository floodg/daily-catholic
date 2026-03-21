begin;

-- 2026-03-16: Allow admins to manage global store_products
-- Idempotent: only create policies if they do not already exist.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_admin_insert'
  ) then
    create policy "store_products_admin_insert"
      on public.store_products
      for insert
      to authenticated
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_admin_update'
  ) then
    create policy "store_products_admin_update"
      on public.store_products
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_admin_delete'
  ) then
    create policy "store_products_admin_delete"
      on public.store_products
      for delete
      to authenticated
      using (public.is_admin());
  end if;
end
$$;

commit;

