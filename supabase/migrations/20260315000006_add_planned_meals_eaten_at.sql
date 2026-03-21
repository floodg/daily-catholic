begin;

-- Add eaten_at timestamp to planned_meals to record when a meal was consumed.
alter table public.planned_meals
  add column if not exists eaten_at timestamptz null;

commit;

