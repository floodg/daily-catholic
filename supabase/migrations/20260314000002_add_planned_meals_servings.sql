begin;

alter table public.planned_meals
  add column if not exists servings integer not null default 1;

commit;
