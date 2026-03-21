-- Add a servings column to planned_meals so inventory deductions can be
-- scaled by how many servings of a meal are consumed.
-- Default of 1 keeps all existing rows correct.

begin;

alter table public.planned_meals
  add column if not exists servings integer not null default 1
    constraint planned_meals_servings_check check (servings >= 1);

commit;
