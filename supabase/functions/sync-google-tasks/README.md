## sync-google-tasks

Scheduled Edge Function that:
- Polls every Google Tasks list (list name becomes the `store`, e.g. `Coles`, `Woolworths`, `Aldi`, `Bunnings`)
- For each task, checks `store_products` first for an existing match per store; only calls Claude for stores where no match is found
- Persists any newly enriched products into `store_products` (global catalogue rows)
- Resolves or creates an `ingredients` row from the task title
- Sets `ingredients.default_store_product_id` using Coles-brand-first, then cheapest-available rule
- Replaces `ingredient_store_product_options` with the non-default alternatives
- Inserts the default product details into `shopping_list_items` (enrichment archive)
- Finds or creates the latest **open** `shopping_trips` row for the list's store (scoped to `SYNC_USER_ID`, `completed_at IS NULL`) and inserts each task as a `shopping_trip_items` row linked to that trip, with `product_name`, `ingredient_name` (the raw task title), `store_product_id`, and parsed `pack_quantity` / `pack_unit`
- Deletes the task from Google Tasks

### Open-trip accumulation and auto-completion

Shopping often happens days after items are added to Google Tasks, so this function does **not** cut a new trip per day — instead it appends to the latest trip whose `completed_at` is still null for that store. A DB trigger (`recompute_shopping_trip_completion`, migration `20260421000001_shopping_trips_completed_at.sql`) sets `shopping_trips.completed_at = now()` as soon as every linked `shopping_trip_items` row has at least one checked `shopping_list` row. The next sync after that will create a fresh trip for the store.

### Pantry credits

This function no longer writes pending rows to `shopping_list`. Items appear in the "Trip" section of the Shopping page (driven by the latest open trip). When the user taps **Mark Purchased** there, a `shopping_list` row is inserted with `requested_quantity`, `unit`, `shopping_trip_item_id`, and `is_checked = true`, which fires `trg_shopping_list_checked_insert` and writes the `inventory_transactions` row that credits the Pantry. The final tick also closes the trip automatically.

### Required secrets

Set these in the Supabase project:

```
supabase secrets set GOOGLE_CLIENT_ID=...
supabase secrets set GOOGLE_CLIENT_SECRET=...
supabase secrets set GOOGLE_REFRESH_TOKEN=...
supabase secrets set ANTHROPIC_API_KEY=...
supabase secrets set SYNC_USER_ID=<uuid of the user to own the trips / items>
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

