begin;

-- Admin: update starter_meal_ingredients (to set/clear the default product)
create policy "starter_meal_ingredients_admin_update"
  on public.starter_meal_ingredients
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

-- Admin: insert product options
create policy "starter_meal_ingredient_product_options_admin_insert"
  on public.starter_meal_ingredient_product_options
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

-- Admin: update product options (sort_order)
create policy "starter_meal_ingredient_product_options_admin_update"
  on public.starter_meal_ingredient_product_options
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

-- Admin: delete product options
create policy "starter_meal_ingredient_product_options_admin_delete"
  on public.starter_meal_ingredient_product_options
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
