-- History:
-- 2026-06-26: Add done_cleared_at so the Shopping page Done section can be cleared without deleting purchase ledger rows

alter table public.shopping_list
  add column if not exists done_cleared_at timestamptz null;

create index if not exists idx_shopping_list_done_visible
  on public.shopping_list(user_id)
  where is_checked = true and done_cleared_at is null;
