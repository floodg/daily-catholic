begin;

alter table public.planned_meals
  add column status text not null default 'planned'
    constraint planned_meals_status_check
      check (status in ('planned', 'completed', 'skipped'));

commit;
