-- History:
-- 2026-07-16: Add meal_ingredients.store_product_id so AI/custom meals can link
--             primary store products the same way starter_meal_ingredients do.

begin;

alter table public.meal_ingredients
  add column if not exists store_product_id uuid null
    references public.store_products(id) on delete set null;

create index if not exists idx_meal_ingredients_store_product_id
  on public.meal_ingredients(store_product_id);

comment on column public.meal_ingredients.store_product_id is
  'Optional primary store product linked to this meal ingredient.';

commit;
