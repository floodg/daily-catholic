## sync-google-tasks

Scheduled Edge Function that:
- Polls named Google Task lists (Coles, Woolworths, Aldi)
- Enriches each task with Gemini 2.0 Flash (grounded Google Search)
- Inserts enriched item into `shopping_list_items`
- Deletes the task from Google Tasks

### Required secrets

Set these in the Supabase project:

```
supabase secrets set GOOGLE_CLIENT_ID=...
supabase secrets set GOOGLE_CLIENT_SECRET=...
supabase secrets set GOOGLE_REFRESH_TOKEN=...
supabase secrets set GEMINI_API_KEY=...
# Note: Supabase CLI disallows names starting with SUPABASE_
# Use SERVICE_ROLE_KEY (the function also supports SUPABASE_SERVICE_ROLE_KEY if set via dashboard)
supabase secrets set SERVICE_ROLE_KEY=...
```

### Deploy

```
supabase functions deploy sync-google-tasks --project-ref <your-project-ref>
```

### Cron (every 10 minutes)

Run in SQL editor (replace placeholders):

```sql
select cron.schedule(
  'sync-google-tasks',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<your-project>.supabase.co/functions/v1/sync-google-tasks',
    headers := format('{"Authorization":"Bearer %s"}', '<your-anon-key>')::jsonb
  );
  $$
);
```

