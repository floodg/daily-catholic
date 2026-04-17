## sync-google-tasks

Scheduled Edge Function that:
- Polls named Google Task lists (Coles, Woolworths, Aldi)
- For each task, checks `store_products` first for an existing match per store; only calls Gemini for stores where no match is found
- Persists any newly enriched products into `store_products` (global catalogue rows)
- Resolves or creates an `ingredients` row from the task title
- Sets `ingredients.default_store_product_id` using Coles-brand-first, then cheapest-available rule
- Replaces `ingredient_store_product_options` with the non-default alternatives
- Inserts the default product details into `shopping_list_items`
- Deletes the task from Google Tasks

### Required secrets

Set these in the Supabase project:

```
supabase secrets set GOOGLE_CLIENT_ID=...
supabase secrets set GOOGLE_CLIENT_SECRET=...
supabase secrets set GOOGLE_REFRESH_TOKEN=...
supabase secrets set GEMINI_API_KEY=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
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

