-- Canonical ingredient catalogue
--
-- Ingredients are the stable food concepts used by recipes and inventory.
-- Store products are purchasable variants which may point at one canonical ingredient.
-- Shopping/product text which cannot be resolved remains unlinked instead of creating
-- a new global ingredient automatically.

begin;

-- Aliases allow store/product wording to resolve to a stable ingredient.
create table if not exists public.ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (
    lower(trim(regexp_replace(alias, '[^a-zA-Z0-9]+', ' ', 'g')))
  ) stored,
  source text not null default 'seed',
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create unique index if not exists ingredient_aliases_normalized_unique
  on public.ingredient_aliases(normalized_alias);
create index if not exists ingredient_aliases_ingredient_id_idx
  on public.ingredient_aliases(ingredient_id);

alter table public.ingredient_aliases enable row level security;

drop policy if exists "ingredient aliases readable" on public.ingredient_aliases;
create policy "ingredient aliases readable"
  on public.ingredient_aliases for select
  using (true);

-- Keep recipe rows linked by id as well as by their display-name snapshot.
alter table public.meal_ingredients
  add column if not exists ingredient_id uuid references public.ingredients(id) on delete set null;
create index if not exists meal_ingredients_ingredient_id_idx
  on public.meal_ingredients(ingredient_id);

-- Normalise incoming shopping/product wording without losing meaningful food words.
create or replace function public.normalize_ingredient_lookup_text(p_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(p_text, '')),
          '\m\d+(?:\.\d+)?\s*(kg|g|mg|l|ml|pack|pk|pkt|ct|count|each|ea|units?)\M',
          ' ', 'gi'
        ),
        '\m(coles|woolworths|woolies|aldi|iga|costco)\M',
        ' ', 'gi'
      ),
      '\m(fresh|organic|australian|australia|brand|premium|family|value)\M',
      ' ', 'gi'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

-- Resolve only to the shared/master catalogue (created_by_user_id is null).
-- This function deliberately returns NULL when there is no confident match.
create or replace function public.resolve_canonical_ingredient_id(p_text text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text := lower(trim(coalesce(p_text, '')));
  v_norm text := public.normalize_ingredient_lookup_text(p_text);
  v_id uuid;
begin
  if v_raw = '' then return null; end if;

  select i.id into v_id
  from public.ingredients i
  where i.created_by_user_id is null
    and lower(trim(i.name)) = v_raw
  order by i.created_at asc
  limit 1;
  if v_id is not null then return v_id; end if;

  select ia.ingredient_id into v_id
  from public.ingredient_aliases ia
  join public.ingredients i on i.id = ia.ingredient_id
  where i.created_by_user_id is null
    and ia.normalized_alias = v_norm
  order by ia.confidence desc, ia.created_at asc
  limit 1;
  if v_id is not null then return v_id; end if;

  select i.id into v_id
  from public.ingredients i
  where i.created_by_user_id is null
    and public.normalize_ingredient_lookup_text(i.name) = v_norm
  order by i.created_at asc
  limit 1;
  if v_id is not null then return v_id; end if;

  -- Safe containment fallback for store names such as
  -- "Ocean Royale Atlantic Salmon Portions 1kg".
  -- Require at least four characters to avoid broad one-word accidents.
  select i.id into v_id
  from public.ingredients i
  where i.created_by_user_id is null
    and length(public.normalize_ingredient_lookup_text(i.name)) >= 4
    and (
      v_norm like '%' || public.normalize_ingredient_lookup_text(i.name) || '%'
      or public.normalize_ingredient_lookup_text(i.name) like '%' || v_norm || '%'
    )
  order by length(public.normalize_ingredient_lookup_text(i.name)) desc, i.created_at asc
  limit 1;

  return v_id;
end;
$$;

-- Seed common aliases against the existing master rows.  The seed file remains
-- the authority for canonical ingredient names; aliases only map alternate wording.
insert into public.ingredient_aliases (ingredient_id, alias, source, confidence)
select i.id, x.alias, 'seed', x.confidence
from (values
  ('Beef mince', 'minced beef', 1.000::numeric),
  ('Beef mince', 'ground beef', 1.000::numeric),
  ('Beef mince', 'beef mince', 1.000::numeric),
  ('Beef mince', 'lean beef mince', 0.980::numeric),
  ('Salmon fillet', 'salmon', 0.950::numeric),
  ('Salmon fillet', 'salmon fillet', 1.000::numeric),
  ('Salmon fillet', 'salmon portions', 1.000::numeric),
  ('Salmon fillet', 'atlantic salmon', 0.980::numeric),
  ('Chicken breast', 'chicken breasts', 1.000::numeric),
  ('Chicken breast', 'skinless chicken breast', 0.980::numeric),
  ('Mozzarella cheese', 'mozzarella', 1.000::numeric),
  ('Cream cheese', 'cream cheese', 1.000::numeric),
  ('Almond meal', 'almond flour', 0.980::numeric),
  ('Almond meal', 'almond meal', 1.000::numeric),
  ('Tomato paste', 'tomato paste', 1.000::numeric),
  ('Cherry tomatoes', 'cherry tomato', 1.000::numeric),
  ('Red onion', 'red onions', 1.000::numeric),
  ('Avocado', 'avocados', 1.000::numeric),
  ('Lettuce', 'iceberg lettuce', 0.980::numeric),
  ('Sour cream', 'sour cream', 1.000::numeric),
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

-- Backfill recipe ingredient ids first, then canonical display names.
-- PostgreSQL does not allow the UPDATE target alias to be referenced from the
-- LATERAL subquery used by the previous version of this migration.
update public.meal_ingredients mi
set ingredient_id = public.resolve_canonical_ingredient_id(mi.name)
where public.resolve_canonical_ingredient_id(mi.name) is not null
  and mi.ingredient_id is distinct from public.resolve_canonical_ingredient_id(mi.name);

update public.meal_ingredients mi
set name = i.name
from public.ingredients i
where mi.ingredient_id = i.id
  and mi.name is distinct from i.name;

-- Keep future recipe rows canonical automatically.
create or replace function public.canonicalize_meal_ingredient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  v_id := coalesce(new.ingredient_id, public.resolve_canonical_ingredient_id(new.name));
  if v_id is not null then
    select name into v_name from public.ingredients where id = v_id;
    new.ingredient_id := v_id;
    new.name := v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists canonicalize_meal_ingredient_trg on public.meal_ingredients;
create trigger canonicalize_meal_ingredient_trg
before insert or update of name, ingredient_id on public.meal_ingredients
for each row execute function public.canonicalize_meal_ingredient();

-- Link store products to canonical ingredients whenever deterministic matching is possible.
create or replace function public.canonicalize_store_product_ingredient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ingredient_id is null then
    new.ingredient_id := public.resolve_canonical_ingredient_id(
      concat_ws(' ', new.brand, new.name, new.size_label)
    );
    if new.ingredient_id is null then
      new.ingredient_id := public.resolve_canonical_ingredient_id(new.name);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists canonicalize_store_product_ingredient_trg on public.store_products;
create trigger canonicalize_store_product_ingredient_trg
before insert or update of name, brand, size_label, ingredient_id on public.store_products
for each row execute function public.canonicalize_store_product_ingredient();

-- Existing seed/default-product relationships are authoritative.
update public.store_products sp
set ingredient_id = i.id
from public.ingredients i
where i.default_store_product_id = sp.id
  and sp.ingredient_id is distinct from i.id;

-- Best-effort backfill of remaining products; unresolved products intentionally stay NULL.
update public.store_products sp
set ingredient_id = public.resolve_canonical_ingredient_id(concat_ws(' ', sp.brand, sp.name, sp.size_label))
where sp.ingredient_id is null
  and public.resolve_canonical_ingredient_id(concat_ws(' ', sp.brand, sp.name, sp.size_label)) is not null;

-- Prevent service-side shopping hydration from silently expanding the shared master
-- catalogue. User-owned ingredients remain allowed (created_by_user_id is not null).
create or replace function public.guard_master_ingredient_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
begin
  if new.created_by_user_id is not null then
    return new;
  end if;

  v_existing := public.resolve_canonical_ingredient_id(new.name);
  if v_existing is not null then
    -- The canonical row already exists.  Suppress accidental duplicate creation.
    return null;
  end if;

  -- Global/master ingredients are maintained by seed/migrations only.
  -- Ad-hoc products that do not resolve stay as products with ingredient_id NULL.
  return null;
end;
$$;

drop trigger if exists guard_master_ingredient_insert_trg on public.ingredients;
create trigger guard_master_ingredient_insert_trg
before insert on public.ingredients
for each row execute function public.guard_master_ingredient_insert();

-- Make the purchase trigger use canonical product links first and never invent a
-- global ingredient for an unlinked non-canonical shopping item.
create or replace function public.create_inventory_transaction_for_checked_shopping_list_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_qty_delta numeric(10,2);
  v_trip_item_id uuid;
  v_store_product_id uuid;
  v_trip_ingredient_name text;
  v_ingredient_id uuid;
  v_ingredient_name text;
  v_unit text;
  v_unit_code text;
begin
  if new.is_checked is not true or new.requested_quantity is null then return new; end if;

  if exists (
    select 1 from public.inventory_transactions it
    where it.user_id = new.user_id
      and it.transaction_type = 'purchase'
      and it.source_type = 'shopping_list_item'
      and it.source_id = new.id
  ) then return new; end if;

  v_user_id := new.user_id;
  v_qty_delta := new.requested_quantity;
  v_trip_item_id := new.shopping_trip_item_id;
  v_unit := new.unit;
  v_unit_code := lower(coalesce(trim(v_unit), 'units'));

  if v_trip_item_id is not null then
    select ti.store_product_id, ti.ingredient_name
      into v_store_product_id, v_trip_ingredient_name
    from public.shopping_trip_items ti where ti.id = v_trip_item_id;

    if v_store_product_id is not null then
      select sp.ingredient_id into v_ingredient_id
      from public.store_products sp where sp.id = v_store_product_id;
    end if;
  end if;

  if v_ingredient_id is null then
    v_ingredient_id := public.resolve_canonical_ingredient_id(
      coalesce(nullif(trim(v_trip_ingredient_name), ''), nullif(trim(new.ingredient_name), ''))
    );
  end if;

  if v_ingredient_id is not null then
    select i.name into v_ingredient_name from public.ingredients i where i.id = v_ingredient_id;
  else
    -- Unmatched products are legitimate shopping items, but are not meal ingredients.
    v_ingredient_name := coalesce(
      nullif(trim(v_trip_ingredient_name), ''),
      nullif(trim(new.ingredient_name), ''),
      nullif(trim(new.name), ''),
      'Unlinked product'
    );
  end if;

  insert into public.inventory_transactions (
    user_id, ingredient_id, ingredient_name, quantity_delta, unit, unit_code,
    transaction_type, source_type, source_id, occurred_at
  ) values (
    v_user_id, v_ingredient_id, v_ingredient_name, v_qty_delta, v_unit, v_unit_code,
    'purchase', 'shopping_list_item', new.id, now()
  );

  return new;
end;
$$;

commit;
