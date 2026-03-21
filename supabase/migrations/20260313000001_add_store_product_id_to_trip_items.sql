begin;

-- Add store_product_id to shopping_trip_items so that items added from a meal
-- retain a link back to the store product (for URL and alternative lookups).

alter table public.shopping_trip_items
  add column if not exists store_product_id uuid null
    references public.store_products(id) on delete set null;

commit;
