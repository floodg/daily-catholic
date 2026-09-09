begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'sync-google-tasks-every-5-minutes';

  perform cron.schedule(
    'sync-google-tasks-every-5-minutes',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://ekerlzhppqlgyywsabfn.supabase.co/functions/v1/sync-google-tasks',
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'sb_publishable_qWzpjt1lHi0MiDAwGRf64g_ate0gmka'
        ),
        timeout_milliseconds := 60000
      );
    $cron$
  );
end
$$;

commit;
