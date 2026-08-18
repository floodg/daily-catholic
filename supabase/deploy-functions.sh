#!/usr/bin/env bash
set -euo pipefail

# This script is used by GitHub Actions to deploy all Supabase Edge Functions.
if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "SUPABASE_PROJECT_REF is required" >&2
  exit 1
fi

for function_dir in supabase/functions/*; do
  [[ -d "$function_dir" ]] || continue
  function_name="$(basename "$function_dir")"
  [[ "$function_name" == "_shared" ]] && continue

  echo "Deploying Supabase Edge Function: $function_name"
  supabase functions deploy "$function_name" --project-ref "$SUPABASE_PROJECT_REF"
done
