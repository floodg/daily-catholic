begin;

-- The Ingredient Products page is available to authenticated users, but the
-- starter-meal product-option table was still restricted to admins. That caused
-- POSTs for alternative products to fail with 403 while reads continued to work.
-- Match the existing ingredient_store_product_options behaviour so authenticated
-- users can maintain starter-meal defaults and alternatives from the UI.

drop policy if exists starter_meal_ingredient_product_options_admin_insert
  on public.starter_meal_ingredient_product_options;
drop policy if exists starter_meal_ingredient_product_options_admin_update
  on public.starter_meal_ingredient_product_options;
drop policy if exists starter_meal_ingredient_product_options_admin_delete
  on public.starter_meal_ingredient_product_options;

create policy starter_meal_ingredient_product_options_insert
on public.starter_meal_ingredient_product_options
for insert
to authenticated
with check (true);

create policy starter_meal_ingredient_product_options_update
on public.starter_meal_ingredient_product_options
for update
to authenticated
using (true)
with check (true);

create policy starter_meal_ingredient_product_options_delete
on public.starter_meal_ingredient_product_options
for delete
to authenticated
using (true);

-- Default-product changes use starter_meal_ingredients.store_product_id. The old
-- admin-only UPDATE policy made non-admin changes silently affect zero rows.
drop policy if exists starter_meal_ingredients_admin_update
  on public.starter_meal_ingredients;

create policy starter_meal_ingredients_update
on public.starter_meal_ingredients
for update
to authenticated
using (true)
with check (true);

commit;
