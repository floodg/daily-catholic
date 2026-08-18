# Product search observability

For `find-store-products`, inspect both Supabase Edge Function logs and `public.edge_function_logs`. Persistent rows include a `run_id`, level, message, and structured context so successful-but-empty searches can be distinguished from request failures.
