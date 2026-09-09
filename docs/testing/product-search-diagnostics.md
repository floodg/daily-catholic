# Product search diagnostics test plan

Use this checklist after deploying `find-store-products`.

1. Open Ingredients and link **Beef mince**.
2. Select **Aldi** and run **Search with AI**.
3. Confirm the response contains either products or a `diagnostics.reason` value.
4. Query `public.edge_function_logs` for `function_name = 'find-store-products'` and the returned `run_id`.
5. Confirm logs include the original ingredient, normalized search term, search variants, candidate counts, elapsed time, and final reason.
6. Repeat with a quantity-prefixed query such as **2kg beef mince** and confirm the normalized search term is **beef mince**.
7. Confirm a no-result search is logged as a warning rather than silently returning an unexplained empty array.
