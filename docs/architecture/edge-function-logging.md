# Edge function persistent logging

Long-running or externally-integrated Edge Functions should persist structured diagnostics to `public.edge_function_logs` in addition to writing to the Supabase console.

The shared helper `supabase/functions/_shared/persistent-logger.ts` provides a per-invocation `runId`, buffered structured logging, and a single flush operation before the HTTP response is returned.

Recommended context fields include the operation, user ID where appropriate, store/provider name, normalized search term, result counts, elapsed time, and a machine-readable `reason` for warnings and failures.

Do not put secrets, tokens, API keys, or full authorization headers into log context.
