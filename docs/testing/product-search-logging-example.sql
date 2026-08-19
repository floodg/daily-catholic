select
  created_at,
  run_id,
  level,
  message,
  context
from public.edge_function_logs
where function_name = 'find-store-products'
order by created_at desc
limit 100;
