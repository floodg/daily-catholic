begin;

-- Issue #48: automatically complete due planned meals after their meal slot.
--
-- The existing mark_meal_eaten(...) RPC remains the single source of truth for
-- inventory consumption. This scheduler only decides when a planned meal is
-- due and delegates the actual status/inventory mutation to that RPC.
--
-- Meals explicitly marked "skipped" are never selected, so their ingredients
-- are not consumed.
--
-- A planned meal is not auto-completed until two hours after its scheduled
-- meal time. This gives the user a grace period for a late meal or to press
-- Skip before pantry ingredients are consumed.

create extension if not exists pg_cron;

alter table public.profiles
  add column if not exists timezone text not null default 'Australia/Sydney';

comment on column public.profiles.timezone is
  'IANA timezone used to determine when planned meal slots become due.';

create or replace function public.auto_mark_due_meals(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meal record;
  v_local_now timestamp;
  v_meal_time time;
  v_scheduled_at timestamptz;
  v_auto_complete_at timestamptz;
  v_result jsonb;
  v_processed integer := 0;
  v_not_due integer := 0;
  v_failed integer := 0;
begin
  for v_meal in
    select
      pm.id,
      pm.user_id,
      pm.planned_date,
      pm.meal_slot,
      pm.planned_time,
      coalesce(nullif(p.timezone, ''), 'Australia/Sydney') as timezone
    from public.planned_meals pm
    join public.profiles p on p.id = pm.user_id
    where coalesce(pm.status, 'planned') = 'planned'
  loop
    v_local_now := p_now at time zone v_meal.timezone;

    -- Only auto-complete meals scheduled for the user's current local day.
    -- This intentionally avoids retroactively consuming inventory for stale
    -- historical plan rows when the feature is first deployed.
    if v_meal.planned_date <> v_local_now::date then
      continue;
    end if;

    -- Prefer an explicitly configured planned_time when it is a valid HH:MM
    -- (or HH:MM:SS) value. Otherwise use the same slot defaults already used
    -- by mark_meal_eaten.
    if coalesce(v_meal.planned_time, '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
      v_meal_time := v_meal.planned_time::time;
    else
      v_meal_time := case v_meal.meal_slot
        when 'breakfast' then time '08:00'
        when 'lunch'     then time '12:30'
        when 'snack'     then time '15:30'
        when 'dinner'    then time '18:30'
        else time '12:00'
      end;
    end if;

    v_scheduled_at := (v_meal.planned_date + v_meal_time) at time zone v_meal.timezone;
    v_auto_complete_at := v_scheduled_at + interval '2 hours';

    if p_now < v_auto_complete_at then
      v_not_due := v_not_due + 1;
      continue;
    end if;

    begin
      -- Use the end of the grace period as the effective eaten time. This
      -- allows inventory acquired during the two-hour grace window to count
      -- as available if the meal was actually eaten later than its slot time.
      update public.planned_meals
      set eaten_at = coalesce(eaten_at, v_auto_complete_at)
      where id = v_meal.id
        and coalesce(status, 'planned') = 'planned';

      if not found then
        continue;
      end if;

      select public.mark_meal_eaten(v_meal.id, v_meal.user_id)
        into v_result;

      if coalesce((v_result ->> 'success')::boolean, false) then
        v_processed := v_processed + 1;
      elsif v_result ->> 'error' = 'already_eaten' then
        -- Another worker/manual action won the race; nothing else to do.
        null;
      else
        v_failed := v_failed + 1;
        raise warning 'auto_mark_due_meals failed for planned meal %: %',
          v_meal.id, v_result;
      end if;
    exception
      when others then
        v_failed := v_failed + 1;
        raise warning 'auto_mark_due_meals exception for planned meal %: %',
          v_meal.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'not_due', v_not_due,
    'failed', v_failed,
    'checked_at', p_now
  );
end;
$$;

revoke all on function public.auto_mark_due_meals(timestamptz) from public;
grant execute on function public.auto_mark_due_meals(timestamptz) to service_role;

-- Poll every five minutes. The function is idempotent because it only selects
-- rows whose status is still "planned" and mark_meal_eaten guards completion.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'auto-mark-due-meals';

  perform cron.schedule(
    'auto-mark-due-meals',
    '*/5 * * * *',
    'select public.auto_mark_due_meals();'
  );
end;
$$;

commit;
