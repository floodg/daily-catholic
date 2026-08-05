-- History:
-- 2026-07-16: Scope AI-generated meal ingredients/products to the creating user
--             so they do not appear in the shared catalog for everyone.

begin;

-- ── meals: mark AI-created meals ─────────────────────────────────────────────
alter table public.meals
  add column if not exists created_via_ai boolean not null default false;

comment on column public.meals.created_via_ai is
  'True when the meal was created via the Create with AI flow.';

-- ── ingredients: optional owner for AI-private catalog rows ──────────────────
alter table public.ingredients
  add column if not exists created_by_user_id uuid null
    references auth.users(id) on delete cascade;

comment on column public.ingredients.created_by_user_id is
  'Null = shared catalog. Set when an ingredient is created from a user AI meal.';

-- Replace global unique(name) with scoped uniqueness.
-- Keep (name) as the conflict target so seed.sql / upserts can use
-- ON CONFLICT (name) WHERE created_by_user_id IS NULL.
alter table public.ingredients drop constraint if exists ingredients_name_key;

drop index if exists public.ingredients_global_name_uidx;
create unique index ingredients_global_name_uidx
  on public.ingredients (name)
  where created_by_user_id is null;

drop index if exists public.ingredients_user_name_uidx;
create unique index ingredients_user_name_uidx
  on public.ingredients (created_by_user_id, name)
  where created_by_user_id is not null;

create index if not exists idx_ingredients_created_by_user_id
  on public.ingredients(created_by_user_id);

-- RLS: shared rows + own AI-private rows
drop policy if exists "ingredients_select" on public.ingredients;
create policy "ingredients_select"
  on public.ingredients
  for select
  to authenticated
  using (created_by_user_id is null or created_by_user_id = auth.uid());

drop policy if exists "ingredients_insert" on public.ingredients;
create policy "ingredients_insert"
  on public.ingredients
  for insert
  to authenticated
  with check (created_by_user_id is null or created_by_user_id = auth.uid());

drop policy if exists "ingredients_update" on public.ingredients;
create policy "ingredients_update"
  on public.ingredients
  for update
  to authenticated
  using (created_by_user_id is null or created_by_user_id = auth.uid())
  with check (created_by_user_id is null or created_by_user_id = auth.uid());

drop policy if exists "ingredients_delete" on public.ingredients;
create policy "ingredients_delete"
  on public.ingredients
  for delete
  to authenticated
  using (created_by_user_id is null or created_by_user_id = auth.uid());

-- Auto-register: AI meals create user-owned ingredient rows (when name is new).
create or replace function public.auto_register_ingredient_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_created_via_ai boolean;
begin
  if tg_table_name = 'meal_ingredients' then
    select m.user_id, m.created_via_ai
      into v_user_id, v_created_via_ai
    from public.meals m
    where m.id = new.meal_id;

    if coalesce(v_created_via_ai, false) and v_user_id is not null then
      -- Prefer an existing shared catalog name; otherwise create a private row.
      if not exists (
        select 1
        from public.ingredients i
        where lower(i.name) = lower(new.name)
          and i.created_by_user_id is null
      ) then
        insert into public.ingredients (name, created_by_user_id)
        select new.name, v_user_id
        where not exists (
          select 1
          from public.ingredients i
          where lower(i.name) = lower(new.name)
            and i.created_by_user_id = v_user_id
        );
      end if;
      return new;
    end if;
  end if;

  -- Starter meals + manual user meals → shared catalog
  insert into public.ingredients (name)
  select new.name
  where not exists (
    select 1
    from public.ingredients i
    where lower(i.name) = lower(new.name)
      and i.created_by_user_id is null
  );

  return new;
end;
$$;

-- Shopping aggregation: resolve shared or the planning user's private ingredient.
create or replace function public.shopping_list_aggregate_week(
  p_user_id uuid
) returns table (
  ingredient_id uuid,
  product_id    uuid,
  display_name  text,
  unit          text,
  total_needed  numeric,
  in_pantry     numeric,
  net_qty_needed numeric
)
language sql
security invoker
as $$
  with week_bounds as (
    select
      date_trunc('week', current_date)::date                       as week_start,
      (date_trunc('week', current_date) + interval '7 days')::date as week_end
  ),
  eff as (
    select
      mi.id,
      mi.meal_id,
      mi.name,
      coalesce(
        mi.quantity,
        public.extract_qty_from_label(mi.quantity_label)
      ) as eff_qty,
      coalesce(
        mi.unit,
        public.extract_unit_from_label(mi.quantity_label)
      ) as eff_unit,
      case
        when mi.unit is null
          and public.extract_unit_from_label(mi.quantity_label) = 'g'
          and lower(coalesce(mi.quantity_label,'')) ~ '^[0-9]+(\.[0-9]+)?\s*kg\s*$'
        then 1000.0
        else 1.0
      end as scale
    from public.meal_ingredients mi
  )
  select
    i.id                             as ingredient_id,
    sp.id                            as product_id,
    coalesce(sp.name, i.name)        as display_name,
    eff.eff_unit                     as unit,
    sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1)) as total_needed,
    coalesce(isl.current_quantity, 0) as in_pantry,
    greatest(
      0,
      sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1))
        - coalesce(isl.current_quantity, 0)
    )                                as net_qty_needed
  from public.planned_meals pm
  join week_bounds wb
    on pm.planned_date >= wb.week_start
   and pm.planned_date <  wb.week_end
  join eff on eff.meal_id = pm.meal_id
  join lateral (
    select ing.*
    from public.ingredients ing
    where lower(ing.name) = lower(eff.name)
      and (ing.created_by_user_id is null or ing.created_by_user_id = pm.user_id)
    order by case when ing.created_by_user_id = pm.user_id then 0 else 1 end
    limit 1
  ) i on true
  left join public.store_products sp
    on sp.ingredient_id = i.id
   and sp.user_id = pm.user_id
  left join public.inventory_stock_levels isl
    on isl.user_id = pm.user_id
   and isl.ingredient_id = i.id
   and isl.unit = eff.eff_unit
  where pm.user_id      = p_user_id
    and pm.status      != 'skipped'
    and i.pantry_staple = false
    and i.kind = 'food'
    and eff.eff_qty    is not null
    and eff.eff_unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup')
  group by i.id, sp.id, i.name, sp.name, eff.eff_unit, isl.current_quantity
  having greatest(
    0,
    sum(eff.eff_qty * eff.scale * coalesce(pm.servings, 1))
      - coalesce(isl.current_quantity, 0)
  ) > 0
  order by coalesce(sp.name, i.name) asc, eff.eff_unit asc;
$$;

commit;
