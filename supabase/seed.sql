-- ─────────────────────────────────────────────────────────────────────────────
-- Measurement units (required before store_products — FK store_products_size_unit_code_fk)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.measurement_units (code, label, dimension, base_code, base_multiplier)
values
  ('g',     'Gram',              'mass',  'g',  1),
  ('kg',    'Kilogram',          'mass',  'g',  1000),
  ('ml',    'Millilitre',        'volume', 'ml', 1),
  ('l',     'Litre',             'volume', 'ml', 1000),
  ('units', 'Unit (each)',       'count',  null, null)
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed store products (Coles)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.store_products (id, name, brand, size_label, size_value, size_unit_code, store, product_url)
values
  (
    '11111111-0001-0001-0001-000000000001',
    'Coles Mozzarella Cheese',
    'Coles',
    '500g',
    500,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-mozzarella-cheese-500g-1234501'
  ),
  (
    '11111111-0001-0001-0001-000000000002',
    'Bulla Mozzarella Cheese',
    'Bulla',
    '250g',
    250,
    'g',
    'Coles',
    'https://www.coles.com.au/product/bulla-mozzarella-cheese-250g-1234502'
  ),
  (
    '11111111-0001-0001-0001-000000000003',
    'Coles Cream Cheese',
    'Coles',
    '250g',
    250,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-cream-cheese-250g-1234503'
  ),
  (
    '11111111-0001-0001-0001-000000000004',
    'Philadelphia Cream Cheese',
    'Philadelphia',
    '250g',
    250,
    'g',
    'Coles',
    'https://www.coles.com.au/product/philadelphia-cream-cheese-250g-1234504'
  ),
  (
    '11111111-0001-0001-0001-000000000005',
    'Macro Almond Meal',
    'Macro',
    '400g',
    400,
    'g',
    'Coles',
    'https://www.coles.com.au/product/macro-almond-meal-400g-1234505'
  ),
  (
    '11111111-0001-0001-0001-000000000006',
    'Coles Almond Meal',
    'Coles',
    '300g',
    300,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-almond-meal-300g-1234506'
  ),
  (
    '11111111-0001-0001-0001-000000000007',
    'Almond Meal Natural',
    'Honest to Goodness',
    '400g',
    400,
    'g',
    'Coles',
    'https://www.coles.com.au/product/almond-meal-400g-1234507'
  ),
  (
    '11111111-0001-0001-0001-000000000008',
    'Coles Beef Mince',
    'Coles',
    '500g',
    500,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-beef-mince-500g-1234508'
  ),
  (
    '11111111-0001-0001-0001-000000000009',
    'Coles Atlantic Salmon Fillet',
    'Coles',
    '400g',
    400,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-atlantic-salmon-fillet-400g-1234509'
  ),
  (
    '11111111-0001-0001-0001-000000000010',
    'Coles Tomato Paste',
    'Coles',
    '140g',
    140,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-tomato-paste-140g-1234510'
  ),
  (
    '11111111-0001-0001-0001-000000000011',
    'Shepard Avocado',
    'Coles',
    '1',
    1,
    'units',
    'Coles',
    'https://www.coles.com.au/product/coles-shepard-avocados-1-each-5900891'
  ),
  (
    '11111111-0001-0001-0001-000000000012',
    'Cheese Shredded Tasty',
    'Coles',
    '700g',
    700,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-cheese-shredded-tasty-700g-8145335'
  ),
  (
    '11111111-0001-0001-0001-000000000013',
    'Lettuce',
    'Coles',
    '1',
    1,
    'units',
    'Coles',
    'https://www.coles.com.au/product/coles-iceberg-lettuce-1-each-4584071'
  ),
  (
    '11111111-0001-0001-0001-000000000014',
    'Coles Sour Cream',
    'Coles',
    '500g',
    500,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-sour-cream-500g-3676980'
  ),
  (
    '11111111-0001-0001-0001-000000000015',
    'Tomatoes',
    'Coles',
    '1',
    1,
    'units',
    'Coles',
    'https://www.coles.com.au/product/coles-tomatoes-gourmet-approx.-130g-4597109'
  )
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed ingredients (pantry catalog – referenced by starter_meal_ingredients)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.ingredients (id, name, optional, pantry_staple, default_store_product_id)
values
  ('33333333-0001-0001-0001-000000000001', 'Mozzarella cheese',       false, false, '11111111-0001-0001-0001-000000000001'),
  ('33333333-0001-0001-0001-000000000002', 'Cream cheese',            false, false, '11111111-0001-0001-0001-000000000003'),
  ('33333333-0001-0001-0001-000000000003', 'Almond meal',             false, false, '11111111-0001-0001-0001-000000000006'),
  ('33333333-0001-0001-0001-000000000004', 'Egg',                     false, false, null),
  ('33333333-0001-0001-0001-000000000005', 'Baking powder',           false, false, null),
  ('33333333-0001-0001-0001-000000000006', 'Garlic powder',            false, true,  null),
  ('33333333-0001-0001-0001-000000000007', 'Salt',                    false, true,  null),
  ('33333333-0001-0001-0001-000000000008', 'Tomato paste',            false, false, '11111111-0001-0001-0001-000000000010'),
  ('33333333-0001-0001-0001-000000000009', 'Extra mozzarella (top)',  false, false, '11111111-0001-0001-0001-000000000001'),
  ('33333333-0001-0001-0001-000000000010', 'Beef mince',              false, false, '11111111-0001-0001-0001-000000000008'),
  ('33333333-0001-0001-0001-000000000011', 'Lettuce',                false, false, '11111111-0001-0001-0001-000000000013'),
  ('33333333-0001-0001-0001-000000000012', 'Cheese',                 false, false, '11111111-0001-0001-0001-000000000012'),
  ('33333333-0001-0001-0001-000000000013', 'Sour cream',             false, false, '11111111-0001-0001-0001-000000000014'),
  ('33333333-0001-0001-0001-000000000014', 'Avocado',                false, false, '11111111-0001-0001-0001-000000000011'),
  ('33333333-0001-0001-0001-000000000015', 'Salsa',                  false, false, null),
  ('33333333-0001-0001-0001-000000000016', 'Salmon fillet',          false, false, '11111111-0001-0001-0001-000000000009'),
  ('33333333-0001-0001-0001-000000000017', 'Cucumber',               false, false, null),
  ('33333333-0001-0001-0001-000000000018', 'Cherry tomatoes',        false, false, null),
  ('33333333-0001-0001-0001-000000000019', 'Red onion',              false, false, null),
  ('33333333-0001-0001-0001-000000000020', 'Olive oil dressing',     false, false, null),
  ('33333333-0001-0001-0001-000000000021', 'Beef steak',             false, false, null),
  ('33333333-0001-0001-0001-000000000022', 'Mixed greens',           false, false, null),
  ('33333333-0001-0001-0001-000000000023', 'Olive oil',              false, true,  null),
  ('33333333-0001-0001-0001-000000000024', 'Butter',                 false, true,  null),
  ('33333333-0001-0001-0001-000000000025', 'Salt & pepper',          false, true,  null),
  ('33333333-0001-0001-0001-000000000026', 'Chicken breast',         false, false, null),
  ('33333333-0001-0001-0001-000000000027', 'Lemon juice',            false, false, null),
  ('33333333-0001-0001-0001-000000000028', 'Garlic',                 false, false, null)
on conflict (name) do update set
  optional = excluded.optional,
  pantry_staple = excluded.pantry_staple,
  default_store_product_id = coalesce(public.ingredients.default_store_product_id, excluded.default_store_product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed starter meals (idempotent – uses ON CONFLICT DO NOTHING on slug)

insert into public.starter_meals (slug, name, description, tags, prep_time_mins, cook_time_mins, instructions)
values
  (
    'black-coffee-water',
    'Black Coffee / Water',
    'Start the morning with black coffee or water. No calories – ideal for skipped meals or intermittent fasting.',
    array['keto', 'morning', 'fasting'],
    0,
    0,
    '["Brew black coffee (no milk, sugar, or cream) or prepare cold water.",
      "No calories if not hungry – keep it clean.",
      "Aim for 3–4L of water throughout the day."]'::jsonb
  ),
  (
    'joes-keto-pizza',
    'Joe''s Keto Pizza (Fathead / Almond Flour)',
    'Classic fathead dough keto pizza – crispy, cheesy, and low carb.',
    array['keto', 'pizza', 'fathead'],
    15,
    22,
    '["Melt mozzarella and cream cheese together (microwave in 30-second bursts, stirring each time).",
      "Mix in almond meal, baking powder, garlic powder, and salt until combined.",
      "Add the egg and work into a dough.",
      "Roll dough out between two sheets of baking paper into a pizza shape.",
      "Pre-bake at 200°C for 10–12 minutes until golden.",
      "Add tomato paste and extra mozzarella plus desired toppings.",
      "Bake for a further 8–10 minutes until cheese is melted and bubbly."]'::jsonb
  ),
  (
    '250g-mince-taco-bowl',
    '250g Mince Taco Bowl',
    'Hearty keto taco bowl with seasoned beef mince over fresh lettuce.',
    array['keto', 'mince', 'taco'],
    5,
    10,
    '["Cook beef mince in a pan over medium-high heat until browned.",
      "Season with taco spices (cumin, paprika, garlic powder, chilli) to taste.",
      "Assemble over a bed of shredded lettuce.",
      "Top with shredded cheese, sour cream, sliced avocado, and salsa."]'::jsonb
  ),
  (
    'salmon-salad',
    'Salmon Salad',
    'Light, refreshing keto salmon salad with crisp vegetables and olive oil dressing.',
    array['keto', 'salad', 'salmon'],
    10,
    10,
    '["Season salmon fillet with salt and pepper.",
      "Pan-fry or grill salmon for 4–5 minutes each side until cooked through.",
      "Chop lettuce, cucumber, cherry tomatoes, and red onion.",
      "Slice avocado.",
      "Assemble salad and place salmon on top.",
      "Drizzle with olive oil dressing and serve immediately."]'::jsonb
  ),
  (
    'steak-greens',
    'Steak + Greens',
    'Tender beef steak served over fresh mixed greens – clean, protein-packed keto dinner.',
    array['keto', 'steak', 'protein-focused'],
    5,
    12,
    '["Season steak generously with salt and pepper.",
      "Heat a pan or grill to high heat with a little oil or butter.",
      "Cook steak 3–4 minutes each side for medium, adjusting to preference.",
      "Rest steak 2 minutes before slicing.",
      "Serve over a bed of mixed greens dressed with olive oil."]'::jsonb
  ),
  (
    'chicken-avocado-salad',
    'Chicken + Avocado Salad',
    'Juicy grilled chicken with creamy avocado over mixed greens – high protein, zero carbs.',
    array['keto', 'chicken', 'salad', 'protein-focused'],
    10,
    15,
    '["Season chicken breast with salt, pepper, and a drizzle of olive oil.",
      "Pan-fry or grill chicken 6–7 minutes each side until cooked through.",
      "Rest chicken 2 minutes then slice.",
      "Halve, pit, and slice avocado.",
      "Assemble mixed greens, sliced chicken, and avocado.",
      "Drizzle with olive oil and a squeeze of lemon juice."]'::jsonb
  ),
  (
    'mince-bowl',
    'Mince Bowl',
    'Simple seasoned beef mince served over greens – quick, filling keto dinner.',
    array['keto', 'mince', 'protein-focused'],
    5,
    10,
    '["Brown beef mince in a pan over medium-high heat.",
      "Add minced garlic, season with salt and pepper.",
      "Cook until liquid evaporates and mince is well-browned.",
      "Serve over fresh mixed greens or sautéed zucchini.",
      "Drizzle with olive oil to finish."]'::jsonb
  ),
  (
    'salmon-avocado-salad',
    'Salmon + Avocado Salad',
    'Pan-fried salmon fillet over a fresh avocado and greens salad – keto, no meat.',
    array['keto', 'salmon', 'salad', 'no-meat'],
    10,
    10,
    '["Season salmon fillet with salt and pepper.",
      "Pan-fry or grill salmon 4–5 minutes each side until cooked through.",
      "Slice avocado and cucumber.",
      "Assemble mixed greens, avocado, and cucumber.",
      "Top with flaked salmon and drizzle with olive oil dressing."]'::jsonb
  ),
  (
    'daily-targets',
    'Daily Targets',
    'Daily macro and lifestyle targets for Joe''s Keto plan.',
    array['keto', 'targets'],
    0,
    0,
    '["Protein: 160–190g", "Carbs: under 50g", "Calories: 2300–2600", "Steps: 7–10k", "No liquid calories", "No random grazing", "No late snacking"]'::jsonb
  )
on conflict (slug) do nothing;

-- Seed starter meal ingredients

-- Black Coffee / Water (no ingredients needed – intentionally empty)

-- Joe's Keto Pizza
with pizza as (
  select id from public.starter_meals where slug = 'joes-keto-pizza'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  pizza.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from pizza,
(values
  ('aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'Mozzarella cheese',       '1.5 cups',   0),
  ('aaaaaaaa-0001-0001-0001-000000000002'::uuid, 'Cream cheese',            '2 tbsp',     1),
  ('aaaaaaaa-0001-0001-0001-000000000003'::uuid, 'Almond meal',             '0.75 cup',   2),
  ('aaaaaaaa-0001-0001-0001-000000000004'::uuid, 'Egg',                     '1',          3),
  ('aaaaaaaa-0001-0001-0001-000000000005'::uuid, 'Baking powder',           '0.5 tsp',    4),
  ('aaaaaaaa-0001-0001-0001-000000000006'::uuid, 'Garlic powder',           '0.5 tsp',    5),
  ('aaaaaaaa-0001-0001-0001-000000000007'::uuid, 'Salt',                    'pinch',      6),
  ('aaaaaaaa-0001-0001-0001-000000000008'::uuid, 'Tomato paste',            '1–2 tbsp',   7),
  ('aaaaaaaa-0001-0001-0001-000000000009'::uuid, 'Extra mozzarella (top)',  'to taste',   8)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Link primary products to pizza ingredients
update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000001'
  where id = 'aaaaaaaa-0001-0001-0001-000000000001'; -- Mozzarella cheese

update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000003'
  where id = 'aaaaaaaa-0001-0001-0001-000000000002'; -- Cream cheese

update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000006'
  where id = 'aaaaaaaa-0001-0001-0001-000000000003'; -- Almond meal (Coles brand is default)

update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000010'
  where id = 'aaaaaaaa-0001-0001-0001-000000000008'; -- Tomato paste

update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000001'
  where id = 'aaaaaaaa-0001-0001-0001-000000000009'; -- Extra mozzarella (top)

-- Ingredient-level alternative products (canonical)
insert into public.ingredient_store_product_options
  (ingredient_id, store_product_id, sort_order)
values
  ('33333333-0001-0001-0001-000000000003', '11111111-0001-0001-0001-000000000005', 0), -- Almond meal -> Macro
  ('33333333-0001-0001-0001-000000000003', '11111111-0001-0001-0001-000000000007', 1), -- Almond meal -> Honest to Goodness
  ('33333333-0001-0001-0001-000000000001', '11111111-0001-0001-0001-000000000002', 0), -- Mozzarella cheese -> Bulla
  ('33333333-0001-0001-0001-000000000002', '11111111-0001-0001-0001-000000000004', 0), -- Cream cheese -> Philadelphia
  ('33333333-0001-0001-0001-000000000012', '11111111-0001-0001-0001-000000000002', 0)  -- Cheese -> Bulla Mozzarella
on conflict (ingredient_id, store_product_id) do nothing;

-- 250g Mince Taco Bowl
with taco as (
  select id from public.starter_meals where slug = '250g-mince-taco-bowl'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  taco.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from taco,
(values
  ('bbbbbbbb-0001-0001-0001-000000000001'::uuid, 'Beef mince',   '250g',        0),
  ('bbbbbbbb-0001-0001-0001-000000000002'::uuid, 'Lettuce',      '1 serving',   1),
  ('bbbbbbbb-0001-0001-0001-000000000003'::uuid, 'Cheese',       '30g',         2),
  ('bbbbbbbb-0001-0001-0001-000000000004'::uuid, 'Sour cream',   '2 tbsp',      3),
  ('bbbbbbbb-0001-0001-0001-000000000005'::uuid, 'Avocado',      '0.5',         4),
  ('bbbbbbbb-0001-0001-0001-000000000006'::uuid, 'Salsa',        'optional',    5)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Link primary product to taco beef mince
update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000008'
  where id = 'bbbbbbbb-0001-0001-0001-000000000001'; -- Beef mince

-- Salmon Salad
with salmon as (
  select id from public.starter_meals where slug = 'salmon-salad'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  salmon.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from salmon,
(values
  ('cccccccc-0001-0001-0001-000000000001'::uuid, 'Salmon fillet',      '1 serving',  0),
  ('cccccccc-0001-0001-0001-000000000002'::uuid, 'Lettuce',            '1 serving',  1),
  ('cccccccc-0001-0001-0001-000000000003'::uuid, 'Cucumber',           '0.5',        2),
  ('cccccccc-0001-0001-0001-000000000004'::uuid, 'Cherry tomatoes',    '4–6',        3),
  ('cccccccc-0001-0001-0001-000000000005'::uuid, 'Red onion',          'small',      4),
  ('cccccccc-0001-0001-0001-000000000006'::uuid, 'Avocado',            '0.5',        5),
  ('cccccccc-0001-0001-0001-000000000007'::uuid, 'Olive oil dressing', 'to serve',   6)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Link primary product to salmon fillet
update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000009'
  where id = 'cccccccc-0001-0001-0001-000000000001'; -- Salmon fillet

-- Steak + Greens
with steak as (
  select id from public.starter_meals where slug = 'steak-greens'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  steak.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from steak,
(values
  ('dddddddd-0001-0001-0001-000000000001'::uuid, 'Beef steak',    '200g',     0),
  ('dddddddd-0001-0001-0001-000000000002'::uuid, 'Mixed greens',  '2 cups',   1),
  ('dddddddd-0001-0001-0001-000000000003'::uuid, 'Olive oil',     '1 tbsp',   2),
  ('dddddddd-0001-0001-0001-000000000004'::uuid, 'Butter',        '1 tbsp',   3),
  ('dddddddd-0001-0001-0001-000000000005'::uuid, 'Salt & pepper', 'to taste', 4)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Chicken + Avocado Salad
with chicken as (
  select id from public.starter_meals where slug = 'chicken-avocado-salad'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  chicken.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from chicken,
(values
  ('eeeeeeee-0001-0001-0001-000000000001'::uuid, 'Chicken breast', '200g',     0),
  ('eeeeeeee-0001-0001-0001-000000000002'::uuid, 'Avocado',        '1 medium', 1),
  ('eeeeeeee-0001-0001-0001-000000000003'::uuid, 'Mixed greens',   '2 cups',   2),
  ('eeeeeeee-0001-0001-0001-000000000004'::uuid, 'Olive oil',      '1 tbsp',   3),
  ('eeeeeeee-0001-0001-0001-000000000005'::uuid, 'Lemon juice',    '1 tbsp',   4),
  ('eeeeeeee-0001-0001-0001-000000000006'::uuid, 'Salt & pepper',  'to taste', 5)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Mince Bowl
with mincebowl as (
  select id from public.starter_meals where slug = 'mince-bowl'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  mincebowl.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from mincebowl,
(values
  ('ffffffff-0001-0001-0001-000000000001'::uuid, 'Beef mince',    '250g',       0),
  ('ffffffff-0001-0001-0001-000000000002'::uuid, 'Mixed greens',  '1 serving',  1),
  ('ffffffff-0001-0001-0001-000000000003'::uuid, 'Garlic',        '1 clove',    2),
  ('ffffffff-0001-0001-0001-000000000004'::uuid, 'Olive oil',     '1 tbsp',     3),
  ('ffffffff-0001-0001-0001-000000000005'::uuid, 'Salt & pepper', 'to taste',   4)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Link primary product to mince bowl beef mince
update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000008'
  where id = 'ffffffff-0001-0001-0001-000000000001'; -- Beef mince

-- Salmon + Avocado Salad
with salmonavo as (
  select id from public.starter_meals where slug = 'salmon-avocado-salad'
)
insert into public.starter_meal_ingredients (id, starter_meal_id, ingredient_id, name, quantity, store, sort_order)
select
  ing.row_id,
  salmonavo.id,
  (select i.id from public.ingredients i where lower(trim(i.name)) = lower(trim(ing.name)) limit 1),
  ing.name,
  ing.quantity,
  'Coles',
  ing.sort_order
from salmonavo,
(values
  ('aaaaaaaa-0002-0001-0001-000000000001'::uuid, 'Salmon fillet',      '1 serving', 0),
  ('aaaaaaaa-0002-0001-0001-000000000002'::uuid, 'Avocado',            '0.5',       1),
  ('aaaaaaaa-0002-0001-0001-000000000003'::uuid, 'Mixed greens',       '2 cups',    2),
  ('aaaaaaaa-0002-0001-0001-000000000004'::uuid, 'Cucumber',           '0.5',       3),
  ('aaaaaaaa-0002-0001-0001-000000000005'::uuid, 'Olive oil dressing', 'to serve',  4)
) as ing(row_id, name, quantity, sort_order)
on conflict (id) do nothing;

-- Link primary product to salmon avocado salad fillet
update public.starter_meal_ingredients
  set store_product_id = '11111111-0001-0001-0001-000000000009'
  where id = 'aaaaaaaa-0002-0001-0001-000000000001'; -- Salmon fillet

-- Daily Targets (no ingredients – instructions carry the targets)
-- ─────────────────────────────────────────────────────────────────────────────
-- Additional seed store products (Coles) for missing starter meal ingredients
-- Added from current Coles catalogue matches
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.store_products (id, name, brand, size_label, size_value, size_unit_code, store, product_url)
values
  (
    '11111111-0001-0001-0001-000000000016',
    'Coles Free Range Eggs 12 Pack',
    'Coles',
    '700g',
    700,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-free-range-eggs-12-pack-700g-9453478'
  ),
  (
    '11111111-0001-0001-0001-000000000017',
    'Mckenzie''s Baking Powder',
    'Mckenzie''s',
    '125g',
    125,
    'g',
    'Coles',
    'https://www.coles.com.au/product/mckenzie%27s-baking-powder-125g-5110298'
  ),
  (
    '11111111-0001-0001-0001-000000000018',
    'Coles Garlic Powder',
    'Coles',
    '60g',
    60,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-garlic-powder-60g-8985074'
  ),
  (
    '11111111-0001-0001-0001-000000000019',
    'Coles Table Salt',
    'Coles',
    '500g',
    500,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-table-salt-500g-5925112'
  ),
  (
    '11111111-0001-0001-0001-000000000020',
    'Coles Salsa Mild',
    'Coles',
    '300g',
    300,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-salsa-mild-300g-5859834'
  ),
  (
    '11111111-0001-0001-0001-000000000021',
    'Coles Cucumbers Continental Loose',
    'Coles',
    '1 each',
    1,
    'units',
    'Coles',
    'https://www.coles.com.au/product/coles-cucumbers-continental-loose-1-each-4575605'
  ),
  (
    '11111111-0001-0001-0001-000000000022',
    'Coles Cherry Tomatoes',
    'Coles',
    '250g',
    250,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-cherry-tomatoes-250g-4834736'
  ),
  (
    '11111111-0001-0001-0001-000000000023',
    'Coles Onions Red Local',
    'Coles',
    'approx. 200g',
    200,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-onions-red-local-approx.-200g-4218459'
  ),
  (
    '11111111-0001-0001-0001-000000000024',
    'Coles Lemon Dressing',
    'Coles',
    '250mL',
    250,
    'ml',
    'Coles',
    'https://www.coles.com.au/product/coles-lemon-dressing-250ml-4472726'
  ),
  (
    '11111111-0001-0001-0001-000000000025',
    'Coles Beef Scotch Steak Fillet 2 Pack',
    'Coles',
    '480g',
    480,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-beef-scotch-steak-fillet-2-pack-480g-4997220'
  ),
  (
    '11111111-0001-0001-0001-000000000026',
    'Coles 4 Leaf Salad Mix',
    'Coles',
    '120g',
    120,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-4-leaf-salad-mix-120g-6885716'
  ),
  (
    '11111111-0001-0001-0001-000000000027',
    'Coles Extra Virgin Olive Oil',
    'Coles',
    '1L',
    1,
    'l',
    'Coles',
    'https://www.coles.com.au/product/coles-extra-virgin-olive-oil-1l-5607376'
  ),
  (
    '11111111-0001-0001-0001-000000000028',
    'Coles Salted Butter',
    'Coles',
    '500g',
    500,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-salted-butter-500g-210160'
  ),
  (
    '11111111-0001-0001-0001-000000000029',
    'Coles Ground Black Pepper',
    'Coles',
    '50g',
    50,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-ground-black-pepper-50g-2677830'
  ),
  (
    '11111111-0001-0001-0001-000000000030',
    'Coles RSPCA Approved Chicken Breast Fillets Small Pack',
    'Coles',
    'approx. 600g',
    600,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-rspca-approved-chicken-breast-fillets-small-pack-approx.-600g-2263168'
  ),
  (
    '11111111-0001-0001-0001-000000000031',
    'Coles Lemon Juice',
    'Coles',
    '500mL',
    500,
    'ml',
    'Coles',
    'https://www.coles.com.au/product/coles-lemon-juice-500ml-9069356'
  ),
  (
    '11111111-0001-0001-0001-000000000032',
    'Coles Minced Garlic',
    'Coles',
    '250g',
    250,
    'g',
    'Coles',
    'https://www.coles.com.au/product/coles-minced-garlic-250g-5493277'
  )
on conflict (id) do nothing;

-- Backfill default products for missing ingredients
update public.ingredients
set default_store_product_id = case lower(trim(name))
  when 'egg' then '11111111-0001-0001-0001-000000000016'
  when 'baking powder' then '11111111-0001-0001-0001-000000000017'
  when 'garlic powder' then '11111111-0001-0001-0001-000000000018'
  when 'salt' then '11111111-0001-0001-0001-000000000019'
  when 'salsa' then '11111111-0001-0001-0001-000000000020'
  when 'cucumber' then '11111111-0001-0001-0001-000000000021'
  when 'cherry tomatoes' then '11111111-0001-0001-0001-000000000022'
  when 'red onion' then '11111111-0001-0001-0001-000000000023'
  when 'olive oil dressing' then '11111111-0001-0001-0001-000000000024'
  when 'beef steak' then '11111111-0001-0001-0001-000000000025'
  when 'mixed greens' then '11111111-0001-0001-0001-000000000026'
  when 'olive oil' then '11111111-0001-0001-0001-000000000027'
  when 'butter' then '11111111-0001-0001-0001-000000000028'
  when 'salt & pepper' then '11111111-0001-0001-0001-000000000029'
  when 'chicken breast' then '11111111-0001-0001-0001-000000000030'
  when 'lemon juice' then '11111111-0001-0001-0001-000000000031'
  when 'garlic' then '11111111-0001-0001-0001-000000000032'
  else default_store_product_id
end
where default_store_product_id is null
  and lower(trim(name)) in (
    'egg', 'baking powder', 'garlic powder', 'salt', 'salsa', 'cucumber',
    'cherry tomatoes', 'red onion', 'olive oil dressing', 'beef steak',
    'mixed greens', 'olive oil', 'butter', 'salt & pepper',
    'chicken breast', 'lemon juice', 'garlic'
  );

-- Backfill starter meal ingredient product links
update public.starter_meal_ingredients
set store_product_id = case lower(trim(name))
  when 'mozzarella cheese' then '11111111-0001-0001-0001-000000000001'
  when 'cream cheese' then '11111111-0001-0001-0001-000000000003'
  when 'almond meal' then '11111111-0001-0001-0001-000000000006'
  when 'egg' then '11111111-0001-0001-0001-000000000016'
  when 'baking powder' then '11111111-0001-0001-0001-000000000017'
  when 'garlic powder' then '11111111-0001-0001-0001-000000000018'
  when 'salt' then '11111111-0001-0001-0001-000000000019'
  when 'tomato paste' then '11111111-0001-0001-0001-000000000010'
  when 'extra mozzarella (top)' then '11111111-0001-0001-0001-000000000001'
  when 'beef mince' then '11111111-0001-0001-0001-000000000008'
  when 'lettuce' then '11111111-0001-0001-0001-000000000013'
  when 'cheese' then '11111111-0001-0001-0001-000000000012'
  when 'sour cream' then '11111111-0001-0001-0001-000000000014'
  when 'avocado' then '11111111-0001-0001-0001-000000000011'
  when 'salsa' then '11111111-0001-0001-0001-000000000020'
  when 'salmon fillet' then '11111111-0001-0001-0001-000000000009'
  when 'cucumber' then '11111111-0001-0001-0001-000000000021'
  when 'cherry tomatoes' then '11111111-0001-0001-0001-000000000022'
  when 'red onion' then '11111111-0001-0001-0001-000000000023'
  when 'olive oil dressing' then '11111111-0001-0001-0001-000000000024'
  when 'beef steak' then '11111111-0001-0001-0001-000000000025'
  when 'mixed greens' then '11111111-0001-0001-0001-000000000026'
  when 'olive oil' then '11111111-0001-0001-0001-000000000027'
  when 'butter' then '11111111-0001-0001-0001-000000000028'
  when 'salt & pepper' then '11111111-0001-0001-0001-000000000029'
  when 'chicken breast' then '11111111-0001-0001-0001-000000000030'
  when 'lemon juice' then '11111111-0001-0001-0001-000000000031'
  when 'garlic' then '11111111-0001-0001-0001-000000000032'
  else store_product_id
end
where store_product_id is null
  and lower(trim(name)) in (
    'mozzarella cheese', 'cream cheese', 'almond meal', 'egg', 'baking powder',
    'garlic powder', 'salt', 'tomato paste', 'extra mozzarella (top)',
    'beef mince', 'lettuce', 'cheese', 'sour cream', 'avocado', 'salsa',
    'salmon fillet', 'cucumber', 'cherry tomatoes', 'red onion',
    'olive oil dressing', 'beef steak', 'mixed greens', 'olive oil',
    'butter', 'salt & pepper', 'chicken breast', 'lemon juice', 'garlic'
  );

-- Optional pantry alternatives for combined "Salt & pepper" ingredient
insert into public.starter_meal_ingredient_product_options
  (starter_meal_ingredient_id, store_product_id, sort_order)
values
  ('dddddddd-0001-0001-0001-000000000005', '11111111-0001-0001-0001-000000000019', 0),
  ('dddddddd-0001-0001-0001-000000000005', '11111111-0001-0001-0001-000000000029', 1),
  ('eeeeeeee-0001-0001-0001-000000000006', '11111111-0001-0001-0001-000000000019', 0),
  ('eeeeeeee-0001-0001-0001-000000000006', '11111111-0001-0001-0001-000000000029', 1),
  ('ffffffff-0001-0001-0001-000000000005', '11111111-0001-0001-0001-000000000019', 0),
  ('ffffffff-0001-0001-0001-000000000005', '11111111-0001-0001-0001-000000000029', 1)
on conflict (starter_meal_ingredient_id, store_product_id) do nothing;
