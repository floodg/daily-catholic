# Product search fix

- Quantity-prefixed ingredient searches are normalized before store lookup (for example, `2kg beef mince` searches for `beef mince`).
- Common mince wording gets a second search variant (`beef mince` / `minced beef`).
- `find-store-products` now writes structured persistent logs to `public.edge_function_logs` with a per-run ID.
- Empty searches are recorded as warnings with machine-readable reasons and elapsed time.
- The Edge Function response now includes `run_id`, `searchTerm`, and no-result diagnostics for debugging.
