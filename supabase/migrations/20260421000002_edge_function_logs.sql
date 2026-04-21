-- Migration: create edge_function_logs for observability of Supabase edge functions.
-- History:
-- 2026-04-21: Initial creation. Adds an append-only log stream used by edge
--             functions (starting with sync-google-tasks) to persist both
--             informational and error messages for later inspection. Writes
--             happen via the service role key (which bypasses RLS); admins
--             can read through a policy backed by public.is_admin().

begin;

create table if not exists public.edge_function_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  function_name text not null,
  run_id uuid null,
  level text not null default 'info'
    check (level in ('debug', 'info', 'warn', 'error')),
  message text not null,
  context jsonb null
);

comment on table public.edge_function_logs is
  'Append-only log stream for Supabase edge functions. Written by edge functions via the service role; readable by admins.';
comment on column public.edge_function_logs.run_id is
  'UUID grouping all messages emitted by a single function invocation.';
comment on column public.edge_function_logs.level is
  'Severity: debug, info, warn, error.';
comment on column public.edge_function_logs.context is
  'Arbitrary structured context (store, task title, error payload, etc.).';

create index if not exists idx_edge_function_logs_created_at
  on public.edge_function_logs(created_at desc);

create index if not exists idx_edge_function_logs_function_created
  on public.edge_function_logs(function_name, created_at desc);

create index if not exists idx_edge_function_logs_run
  on public.edge_function_logs(run_id)
  where run_id is not null;

-- Partial index to make "show me recent warnings/errors" queries cheap.
create index if not exists idx_edge_function_logs_errors
  on public.edge_function_logs(function_name, created_at desc)
  where level in ('warn', 'error');

alter table public.edge_function_logs enable row level security;

-- Admins can read the full log stream. Edge functions write using the
-- service role key which bypasses RLS, so no insert/update/delete policies
-- are exposed to authenticated or anon callers.
drop policy if exists "edge_function_logs_admin_read" on public.edge_function_logs;
create policy "edge_function_logs_admin_read"
on public.edge_function_logs
for select
to authenticated
using (public.is_admin());

commit;
