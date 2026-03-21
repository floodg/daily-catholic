begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-register ingredient names into the catalog
--
-- Root cause: the ingredients catalog was backfilled once in
-- 20260315000001, but that ran before seed.sql on a fresh db reset, so
-- the catalog remained empty. New ingredient names added via meal import
-- (importStarterMealsForUser) were also never registered, breaking the
-- shopping_list_aggregate_week RPC join on ingredients.name.
--
-- This migration:
--  1. Adds a trigger on meal_ingredients to auto-upsert into ingredients.
--  2. Adds the same trigger on starter_meal_ingredients (so seed.sql
--     inserts populate the catalog on every db reset).
--  3. Backfills any existing names that were missed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auto_register_ingredient_name()
returns trigger language plpgsql security definer as $$
begin
  insert into public.ingredients (name)
  values (new.name)
  on conflict (name) do nothing;
  return new;
end;
$$;

-- Trigger on meal_ingredients (user meals created via onboarding or manually)
drop trigger if exists meal_ingredients_auto_register on public.meal_ingredients;
create trigger meal_ingredients_auto_register
  after insert on public.meal_ingredients
  for each row execute function public.auto_register_ingredient_name();

-- Trigger on starter_meal_ingredients (seed.sql inserts)
drop trigger if exists starter_meal_ingredients_auto_register on public.starter_meal_ingredients;
create trigger starter_meal_ingredients_auto_register
  after insert on public.starter_meal_ingredients
  for each row execute function public.auto_register_ingredient_name();

-- Backfill any names already in the tables that are not yet in the catalog
insert into public.ingredients (name)
select distinct name from public.starter_meal_ingredients
on conflict (name) do nothing;

insert into public.ingredients (name)
select distinct name from public.meal_ingredients
on conflict (name) do nothing;

commit;
