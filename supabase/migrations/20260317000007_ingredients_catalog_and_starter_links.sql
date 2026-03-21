begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ingredients catalog & starter_meal_ingredients link
--
-- 1. ingredients: add default_store_product_id so pantry ingredients can be
--    linked to a preferred store product (managed on the ingredients page).
-- 2. starter_meal_ingredients: add ingredient_id FK to ingredients so rows
--    reference the catalog; keep name for display/backfill compatibility.
-- 3. Backfill starter_meal_ingredients.ingredient_id from ingredients by name.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ingredients: optional default store product (global catalog link)
alter table public.ingredients
  add column if not exists default_store_product_id uuid null
    references public.store_products(id) on delete set null;

-- Allow delete for management page (authenticated; admin UI restricts access)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'ingredients_delete') then
    create policy "ingredients_delete"
      on public.ingredients
      for delete
      to authenticated
      using (true);
  end if;
end
$$;

-- starter_meal_ingredients: link to ingredients catalog
alter table public.starter_meal_ingredients
  add column if not exists ingredient_id uuid null
    references public.ingredients(id) on delete set null;

-- Backfill: set ingredient_id from matching ingredient name (case-insensitive)
update public.starter_meal_ingredients smi
set ingredient_id = i.id
from public.ingredients i
where lower(trim(smi.name)) = lower(trim(i.name))
  and smi.ingredient_id is null;

commit;
