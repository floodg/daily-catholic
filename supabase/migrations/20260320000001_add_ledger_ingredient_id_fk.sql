begin;

-- 2026-03-20: Ledger refactor (ingredient_id FK)
alter table public.inventory_transactions
  add column if not exists ingredient_id uuid
    references public.ingredients(id) on delete set null;

update public.inventory_transactions it
set ingredient_id = (
  select i.id
  from public.ingredients i
  where lower(trim(i.name)) = lower(trim(it.ingredient_name))
  order by case when i.name = it.ingredient_name then 0 else 1 end, i.name asc
  limit 1
)
where it.ingredient_id is null;

create index if not exists idx_inventory_transactions_user_ingredient_id
  on public.inventory_transactions(user_id, ingredient_id);

commit;

