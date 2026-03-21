begin;

-- Admin: insert store products
create policy "store_products_admin_insert"
  on public.store_products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

-- Admin: update store products
create policy "store_products_admin_update"
  on public.store_products
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

-- Admin: delete store products
create policy "store_products_admin_delete"
  on public.store_products
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

commit;
