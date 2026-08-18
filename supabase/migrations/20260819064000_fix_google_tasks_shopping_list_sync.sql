begin;

-- Google Tasks sync currently persists enriched items to shopping_list_items,
-- while the Shopping page reads pending items from shopping_list. Mirror Google
-- Tasks rows into the active shopping_list table so synced food items appear in
-- the UI. Keep the existing shopping_list_items row for enrichment/audit data.

create or replace function public.sync_google_task_item_to_shopping_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.source is distinct from 'google_tasks' or new.user_id is null then
    return new;
  end if;

  v_name := coalesce(nullif(btrim(new.name), ''), nullif(btrim(new.raw_name), ''));
  if v_name is null then
    return new;
  end if;

  insert into public.shopping_list (
    user_id,
    ingredient_name,
    is_checked,
    source
  )
  select
    new.user_id,
    v_name,
    false,
    'google_tasks'
  where not exists (
    select 1
    from public.shopping_list sl
    where sl.user_id = new.user_id
      and lower(sl.ingredient_name) = lower(v_name)
      and sl.is_checked = false
  );

  return new;
end;
$$;

drop trigger if exists trg_sync_google_task_item_to_shopping_list
  on public.shopping_list_items;

create trigger trg_sync_google_task_item_to_shopping_list
after insert on public.shopping_list_items
for each row
execute function public.sync_google_task_item_to_shopping_list();

-- Repair previously synced Google Task items that were enriched successfully
-- but never surfaced in the current Shopping page.
insert into public.shopping_list (
  user_id,
  ingredient_name,
  is_checked,
  source
)
select
  sli.user_id,
  coalesce(nullif(btrim(sli.name), ''), nullif(btrim(sli.raw_name), '')),
  false,
  'google_tasks'
from public.shopping_list_items sli
where sli.source = 'google_tasks'
  and sli.user_id is not null
  and coalesce(nullif(btrim(sli.name), ''), nullif(btrim(sli.raw_name), '')) is not null
  and not exists (
    select 1
    from public.shopping_list sl
    where sl.user_id = sli.user_id
      and lower(sl.ingredient_name) = lower(
        coalesce(nullif(btrim(sli.name), ''), nullif(btrim(sli.raw_name), ''))
      )
      and sl.is_checked = false
  );

commit;
