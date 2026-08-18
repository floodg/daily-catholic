-- Ensure the canonical ingredient catalogue exists as migration data as well as seed data.
-- Supabase applies migrations before seed.sql on a fresh reset, so these rows must exist
-- before the global-master insert guard becomes authoritative.

begin;

drop trigger if exists guard_master_ingredient_insert_trg on public.ingredients;

insert into public.ingredients (id, name, optional, pantry_staple, created_by_user_id)
values
  ('33333333-0001-0001-0001-000000000001', 'Mozzarella cheese',       false, false, null),
  ('33333333-0001-0001-0001-000000000002', 'Cream cheese',            false, false, null),
  ('33333333-0001-0001-0001-000000000003', 'Almond meal',             false, false, null),
  ('33333333-0001-0001-0001-000000000004', 'Egg',                     false, false, null),
  ('33333333-0001-0001-0001-000000000005', 'Baking powder',           false, false, null),
  ('33333333-0001-0001-0001-000000000006', 'Garlic powder',           false, true,  null),
  ('33333333-0001-0001-0001-000000000007', 'Salt',                    false, true,  null),
  ('33333333-0001-0001-0001-000000000008', 'Tomato paste',            false, false, null),
  ('33333333-0001-0001-0001-000000000009', 'Extra mozzarella (top)',  false, false, null),
  ('33333333-0001-0001-0001-000000000010', 'Beef mince',              false, false, null),
  ('33333333-0001-0001-0001-000000000011', 'Lettuce',                 false, false, null),
  ('33333333-0001-0001-0001-000000000012', 'Cheese',                  false, false, null),
  ('33333333-0001-0001-0001-000000000013', 'Sour cream',              false, false, null),
  ('33333333-0001-0001-0001-000000000014', 'Avocado',                 false, false, null),
  ('33333333-0001-0001-0001-000000000015', 'Salsa',                   false, false, null),
  ('33333333-0001-0001-0001-000000000016', 'Salmon fillet',           false, false, null),
  ('33333333-0001-0001-0001-000000000017', 'Cucumber',                false, false, null),
  ('33333333-0001-0001-0001-000000000018', 'Cherry tomatoes',         false, false, null),
  ('33333333-0001-0001-0001-000000000019', 'Red onion',               false, false, null),
  ('33333333-0001-0001-0001-000000000020', 'Olive oil dressing',      false, false, null),
  ('33333333-0001-0001-0001-000000000021', 'Beef steak',              false, false, null),
  ('33333333-0001-0001-0001-000000000022', 'Mixed greens',            false, false, null),
  ('33333333-0001-0001-0001-000000000023', 'Olive oil',               false, true,  null),
  ('33333333-0001-0001-0001-000000000024', 'Butter',                  false, true,  null),
  ('33333333-0001-0001-0001-000000000025', 'Salt & pepper',           false, true,  null),
  ('33333333-0001-0001-0001-000000000026', 'Chicken breast',          false, false, null),
  ('33333333-0001-0001-0001-000000000027', 'Lemon juice',             false, false, null),
  ('33333333-0001-0001-0001-000000000028', 'Garlic',                  false, false, null)
on conflict (id) do nothing;

-- If a production database already contains the canonical name under a different id,
-- keep the existing row and avoid creating a duplicate by name.
delete from public.ingredients duplicate
using public.ingredients canonical
where duplicate.created_by_user_id is null
  and canonical.created_by_user_id is null
  and duplicate.id <> canonical.id
  and lower(trim(duplicate.name)) = lower(trim(canonical.name))
  and canonical.id::text like '33333333-0001-0001-0001-%'
  and duplicate.id::text not like '33333333-0001-0001-0001-%'
  and not exists (select 1 from public.inventory_transactions it where it.ingredient_id = duplicate.id)
  and not exists (select 1 from public.store_products sp where sp.ingredient_id = duplicate.id);

insert into public.ingredient_aliases (ingredient_id, alias, source, confidence)
select i.id, x.alias, 'seed', x.confidence
from (values
  ('Beef mince', 'minced beef', 1.000::numeric),
  ('Beef mince', 'ground beef', 1.000::numeric),
  ('Beef mince', 'lean beef mince', 0.980::numeric),
  ('Salmon fillet', 'salmon', 0.950::numeric),
  ('Salmon fillet', 'salmon portions', 1.000::numeric),
  ('Salmon fillet', 'atlantic salmon', 0.980::numeric),
  ('Chicken breast', 'chicken breasts', 1.000::numeric),
  ('Chicken breast', 'skinless chicken breast', 0.980::numeric),
  ('Mozzarella cheese', 'mozzarella', 1.000::numeric),
  ('Almond meal', 'almond flour', 0.980::numeric),
  ('Cherry tomatoes', 'cherry tomato', 1.000::numeric),
  ('Red onion', 'red onions', 1.000::numeric),
  ('Avocado', 'avocados', 1.000::numeric),
  ('Lettuce', 'iceberg lettuce', 0.980::numeric),
  ('Olive oil', 'extra virgin olive oil', 0.980::numeric),
  ('Butter', 'unsalted butter', 0.950::numeric),
  ('Butter', 'salted butter', 0.950::numeric),
  ('Egg', 'eggs', 1.000::numeric)
) as x(canonical_name, alias, confidence)
join public.ingredients i
  on i.created_by_user_id is null
 and lower(trim(i.name)) = lower(x.canonical_name)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  source = excluded.source,
  confidence = greatest(public.ingredient_aliases.confidence, excluded.confidence);

update public.meal_ingredients mi
set ingredient_id = public.resolve_canonical_ingredient_id(mi.name)
where mi.ingredient_id is null
  and public.resolve_canonical_ingredient_id(mi.name) is not null;

update public.meal_ingredients mi
set name = i.name
from public.ingredients i
where mi.ingredient_id = i.id
  and mi.name is distinct from i.name;

update public.store_products sp
set ingredient_id = public.resolve_canonical_ingredient_id(concat_ws(' ', sp.brand, sp.name, sp.size_label))
where sp.ingredient_id is null
  and public.resolve_canonical_ingredient_id(concat_ws(' ', sp.brand, sp.name, sp.size_label)) is not null;

create trigger guard_master_ingredient_insert_trg
before insert on public.ingredients
for each row execute function public.guard_master_ingredient_insert();

commit;
