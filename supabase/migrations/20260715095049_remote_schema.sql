create extension if not exists "pg_cron" with schema "pg_catalog";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.meal_plan_required_ingredients_for_week(p_user_id uuid)
 RETURNS TABLE(ingredient_id uuid, display_name text)
 LANGUAGE sql
AS $function$
  with week_bounds as (
    select
      date_trunc('week', current_date)::date                       as week_start,
      (date_trunc('week', current_date) + interval '7 days')::date as week_end
  ),
  eff as (
    select
      mi.meal_id,
      mi.name,
      coalesce(
        mi.quantity,
        public.extract_qty_from_label(mi.quantity_label)
      ) as eff_qty,
      coalesce(
        mi.unit,
        public.extract_unit_from_label(mi.quantity_label)
      ) as eff_unit
    from public.meal_ingredients mi
  )
  select distinct
    i.id as ingredient_id,
    i.name as display_name
  from public.planned_meals pm
  join week_bounds wb
    on pm.planned_date >= wb.week_start
   and pm.planned_date <  wb.week_end
  join eff
    on eff.meal_id = pm.meal_id
  join public.ingredients i
    on lower(i.name) = lower(eff.name)
  where pm.user_id = p_user_id
    and pm.status != 'skipped'
    and i.pantry_staple = false
    and eff.eff_qty is not null
    and eff.eff_unit in ('g', 'ml', 'units', 'tsp', 'tbsp', 'cup')
  order by i.name asc;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (
    id,
    email,
    display_name
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;


