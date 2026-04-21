begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-04-21: Add completed_at to shopping_trips so the Google Tasks sync can
-- accumulate items into the latest OPEN trip (across days), and auto-mark a
-- trip complete once every linked shopping_trip_items row has a checked
-- shopping_list entry.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.shopping_trips
  add column if not exists completed_at timestamptz null;

create index if not exists idx_shopping_trips_open
  on public.shopping_trips(user_id, store)
  where completed_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: recompute shopping_trips.completed_at whenever a shopping_list row
-- linked to a trip item is inserted/updated/deleted. A trip is "complete" when
-- every shopping_trip_items row for it has at least one checked shopping_list
-- row pointing at it (same user). Unchecking/deleting items can re-open it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.recompute_shopping_trip_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_item_id uuid;
  v_trip_id uuid;
  v_total integer;
  v_done integer;
begin
  v_trip_item_id := coalesce(new.shopping_trip_item_id, old.shopping_trip_item_id);
  if v_trip_item_id is null then
    return coalesce(new, old);
  end if;

  select ti.shopping_trip_id
    into v_trip_id
  from public.shopping_trip_items ti
  where ti.id = v_trip_item_id;

  if v_trip_id is null then
    return coalesce(new, old);
  end if;

  select count(*)
    into v_total
  from public.shopping_trip_items ti
  where ti.shopping_trip_id = v_trip_id;

  select count(distinct ti.id)
    into v_done
  from public.shopping_trip_items ti
  join public.shopping_list sl
    on sl.shopping_trip_item_id = ti.id
   and sl.is_checked = true
  where ti.shopping_trip_id = v_trip_id;

  if v_total > 0 and v_done >= v_total then
    update public.shopping_trips
       set completed_at = coalesce(completed_at, now())
     where id = v_trip_id;
  else
    update public.shopping_trips
       set completed_at = null
     where id = v_trip_id
       and completed_at is not null;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_shopping_list_recompute_trip_completion_ins on public.shopping_list;
create trigger trg_shopping_list_recompute_trip_completion_ins
  after insert on public.shopping_list
  for each row
  execute function public.recompute_shopping_trip_completion();

drop trigger if exists trg_shopping_list_recompute_trip_completion_upd on public.shopping_list;
create trigger trg_shopping_list_recompute_trip_completion_upd
  after update on public.shopping_list
  for each row
  when (
    old.is_checked is distinct from new.is_checked
    or old.shopping_trip_item_id is distinct from new.shopping_trip_item_id
  )
  execute function public.recompute_shopping_trip_completion();

drop trigger if exists trg_shopping_list_recompute_trip_completion_del on public.shopping_list;
create trigger trg_shopping_list_recompute_trip_completion_del
  after delete on public.shopping_list
  for each row
  execute function public.recompute_shopping_trip_completion();

-- Also recompute when trip items are added or removed directly so a brand-new
-- empty trip doesn't get auto-completed and a deleted last item doesn't leave
-- the trip falsely open.
create or replace function public.recompute_shopping_trip_completion_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_total integer;
  v_done integer;
begin
  v_trip_id := coalesce(new.shopping_trip_id, old.shopping_trip_id);
  if v_trip_id is null then
    return coalesce(new, old);
  end if;

  select count(*)
    into v_total
  from public.shopping_trip_items ti
  where ti.shopping_trip_id = v_trip_id;

  select count(distinct ti.id)
    into v_done
  from public.shopping_trip_items ti
  join public.shopping_list sl
    on sl.shopping_trip_item_id = ti.id
   and sl.is_checked = true
  where ti.shopping_trip_id = v_trip_id;

  if v_total > 0 and v_done >= v_total then
    update public.shopping_trips
       set completed_at = coalesce(completed_at, now())
     where id = v_trip_id;
  else
    update public.shopping_trips
       set completed_at = null
     where id = v_trip_id
       and completed_at is not null;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_shopping_trip_items_recompute_completion on public.shopping_trip_items;
create trigger trg_shopping_trip_items_recompute_completion
  after insert or delete on public.shopping_trip_items
  for each row
  execute function public.recompute_shopping_trip_completion_from_items();

commit;
