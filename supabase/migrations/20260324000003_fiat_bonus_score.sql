begin;

-- Add bonus_score column to track optional-mass bonus points separately
alter table public.fiat_daily_entries
  add column if not exists bonus_score integer not null default 0;

commit;
