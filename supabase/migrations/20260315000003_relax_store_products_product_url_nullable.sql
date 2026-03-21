begin;

-- Allow user-linked rows in public.store_products to omit product_url.
alter table public.store_products
  alter column product_url drop not null;

commit;

