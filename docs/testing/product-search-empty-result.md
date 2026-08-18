# Empty product result behavior

A successful HTTP 200 with `products: []` is not treated as a transport failure. The function records a warning in `edge_function_logs` and returns diagnostics containing `reason: "no_products_found"`, the store, and the search variants that were attempted.
