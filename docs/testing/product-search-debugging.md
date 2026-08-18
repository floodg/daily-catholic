# Product search debugging

When a store search returns no products, use the response `run_id` and query `edge_function_logs`. Check the recorded normalized search term, attempted variants, candidate count, final reason, and elapsed time before changing frontend behavior.
