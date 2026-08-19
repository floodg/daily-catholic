-- A user can legitimately have more than one store product for the same
-- canonical ingredient (for example Coles beef mince and Aldi beef mince).
-- The old UNIQUE(user_id, ingredient_id) constraint prevents that and causes
-- Google Tasks backfill/enrichment to fail when a second retailer product is
-- linked to the same ingredient.

begin;

alter table public.store_products
  drop constraint if exists store_products_user_ingredient_unique;

-- Keep the lookup fast without enforcing uniqueness across retailer products.
create index if not exists store_products_user_ingredient_idx
  on public.store_products (user_id, ingredient_id);

commit;
