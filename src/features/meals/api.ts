import { supabase } from '../../lib/supabase';
import type { Meal, Ingredient, StarterMeal, MealIngredientProduct } from '../../domain/types';
import { formatQuantity, parseQuantity, isUnmeasuredQuantity } from '../shopping/quantityUtils';

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface DbIngredient {
  id: string;
  meal_id: string;
  name: string;
  /** Structured fields added in Phase 2 */
  quantity: number | null;
  unit: string | null;
  /** Legacy free-text label preserved during migration */
  quantity_label: string | null;
  store: string | null;
  notes: string | null;
  sort_order: number;
}

interface DbMeal {
  id: string;
  user_id: string;
  source_starter_meal_id: string | null;
  name: string;
  description: string | null;
  tags: string[];
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  instructions: string[];
  created_at: string;
  updated_at: string;
  meal_ingredients: DbIngredient[];
}

interface DbStoreProduct {
  id: string;
  name: string;
  brand: string | null;
  size_label: string | null;
  store: string;
  product_url: string | null;
  image_url: string | null;
}

interface DbProductOption {
  store_product_id: string;
  sort_order: number;
  store_products: DbStoreProduct;
}

interface DbStarterIngredient {
  id: string;
  starter_meal_id: string;
  name: string;
  quantity: string | null;
  store: string | null;
  notes: string | null;
  sort_order: number;
  store_product_id: string | null;
  store_products: DbStoreProduct | null;
  starter_meal_ingredient_product_options: DbProductOption[];
}

interface DbStarterMeal {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tags: string[];
  prep_time_mins: number | null;
  cook_time_mins: number | null;
  instructions: string[];
  starter_meal_ingredients: DbStarterIngredient[];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function dbStoreProductToDomain(row: DbStoreProduct): MealIngredientProduct {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? undefined,
    sizeLabel: row.size_label ?? undefined,
    store: row.store,
    productUrl: row.product_url,
    imageUrl: row.image_url ?? undefined,
  };
}

function dbIngredientToDomain(ing: DbIngredient): Ingredient {
  const quantityNum = ing.quantity ?? undefined;
  const unit = (ing.unit as Ingredient['unit']) ?? undefined;
  // Prefer stored label; otherwise derive a simple label from structured fields
  const label =
    ing.quantity_label ??
    (quantityNum != null && unit ? formatQuantity(quantityNum, unit) : undefined);
  return {
    id: ing.id,
    name: ing.name,
    quantity: label,
    quantityNum,
    unit,
    store: ing.store ?? undefined,
    notes: ing.notes ?? undefined,
  };
}

function dbMealToDomain(row: DbMeal): Meal {
  return {
    id: row.id,
    name: row.name,
    tags: row.tags ?? [],
    ingredients: [...(row.meal_ingredients ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbIngredientToDomain),
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
    prepTimeMins: row.prep_time_mins ?? undefined,
    cookTimeMins: row.cook_time_mins ?? undefined,
    sourceStarterMealId: row.source_starter_meal_id ?? undefined,
  };
}

function dbStarterIngredientToDomain(ing: DbStarterIngredient): Ingredient {
  const primaryProduct = ing.store_products
    ? dbStoreProductToDomain(ing.store_products)
    : undefined;

  const optionProducts = [...(ing.starter_meal_ingredient_product_options ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(opt => dbStoreProductToDomain(opt.store_products));

  // Deduplicate options: remove any that match the primary product id
  const deduplicatedOptions = primaryProduct
    ? optionProducts.filter(p => p.id !== primaryProduct.id)
    : optionProducts;

  // Parse the free-text quantity into structured numeric fields so that
  // meal_ingredients rows created from starter meals have quantity/unit
  // populated and are visible in the shopping-list RPC.
  const rawQty = ing.quantity ?? undefined;
  const parsedRaw =
    rawQty && !isUnmeasuredQuantity(rawQty) ? parseQuantity(rawQty) : null;
  // Only write structured fields when the resolved unit satisfies the DB
  // check constraint on meal_ingredients.  Unrecognised units (e.g. "clove",
  // "medium") fall back to null so the RPC reads quantity_label instead.
  const ALLOWED_UNITS = new Set(['g', 'ml', 'units', 'tsp', 'tbsp', 'cup']);
  const parsed =
    parsedRaw && ALLOWED_UNITS.has(parsedRaw.unit) ? parsedRaw : null;

  return {
    id: ing.id,
    name: ing.name,
    quantity: rawQty,
    quantityNum: parsed?.amount,
    unit: parsed?.unit as Ingredient['unit'],
    store: ing.store ?? undefined,
    notes: ing.notes ?? undefined,
    primaryProduct,
    productOptions: deduplicatedOptions,
  };
}

function dbStarterMealToDomain(row: DbStarterMeal): StarterMeal {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    tags: row.tags ?? [],
    prepTimeMins: row.prep_time_mins ?? undefined,
    cookTimeMins: row.cook_time_mins ?? undefined,
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
    ingredients: [...(row.starter_meal_ingredients ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbStarterIngredientToDomain),
  };
}

/**
 * Build a lookup map: (starterMealId, ingredientNameLower) -> Ingredient product data
 * Used to augment user meal ingredients with product links.
 */
function buildProductLookup(
  starterMeals: DbStarterMeal[]
): Map<string, Map<string, Ingredient>> {
  const lookup = new Map<string, Map<string, Ingredient>>();
  for (const sm of starterMeals) {
    const byName = new Map<string, Ingredient>();
    for (const ing of sm.starter_meal_ingredients) {
      byName.set(ing.name.toLowerCase(), dbStarterIngredientToDomain(ing));
    }
    lookup.set(sm.id, byName);
  }
  return lookup;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const STARTER_INGREDIENT_SELECT =
  '*, store_products:store_product_id(*), starter_meal_ingredient_product_options(sort_order, store_product_id, store_products:store_product_id(*))';

export async function getStarterMeals(): Promise<StarterMeal[]> {
  const { data, error } = await supabase
    .from('starter_meals')
    .select(`*, starter_meal_ingredients(${STARTER_INGREDIENT_SELECT})`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as DbStarterMeal[]).map(dbStarterMealToDomain);
}

/**
 * Return starter meal IDs that have already been imported into the user's
 * meal library.
 */
export async function getImportedStarterMealIdsForUser(
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('source_starter_meal_id')
    .eq('user_id', userId);

  if (error) throw error;

  const ids = (data as { source_starter_meal_id: string | null }[]).map(
    r => r.source_starter_meal_id
  );

  return Array.from(new Set(ids.filter((id): id is string => id != null)));
}

/**
 * Return starter meals the user hasn't imported yet.
 */
export async function getStarterMealsNotImportedForUser(
  userId: string
): Promise<StarterMeal[]> {
  const importedIds = new Set(
    await getImportedStarterMealIdsForUser(userId)
  );
  const starterMeals = await getStarterMeals();
  return starterMeals.filter(sm => !importedIds.has(sm.id));
}

export async function getMealsForUser(): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*, meal_ingredients(*)')
    .order('created_at', { ascending: true });

  if (error) throw error;
  const meals = data as DbMeal[];

  // Fetch ingredient catalog flags (optional, pantry_staple) for names used across all meals
  const ingredientNames = Array.from(
    new Set(
      meals.flatMap(m => (m.meal_ingredients ?? []).map(i => i.name.trim()).filter(Boolean))
    )
  );

  let catalogByName = new Map<string, { optional: boolean; pantry_staple: boolean }>();
  if (ingredientNames.length > 0) {
    const { data: catRows, error: catErr } = await supabase
      .from('ingredients')
      .select('name, optional, pantry_staple')
      .in('name', ingredientNames);
    if (catErr) throw catErr;
    catalogByName = new Map(
      (catRows as { name: string; optional: boolean; pantry_staple: boolean }[]).map(r => [
        r.name.toLowerCase(),
        { optional: r.optional, pantry_staple: r.pantry_staple },
      ])
    );
  }

  // Collect unique source_starter_meal_ids to fetch product data
  const starterMealIds = [
    ...new Set(
      meals
        .map(m => m.source_starter_meal_id)
        .filter((id): id is string => id != null)
    ),
  ];

  let productLookup: Map<string, Map<string, Ingredient>> = new Map();

  if (starterMealIds.length > 0) {
    const { data: smData, error: smError } = await supabase
      .from('starter_meals')
      .select(`id, starter_meal_ingredients(${STARTER_INGREDIENT_SELECT})`)
      .in('id', starterMealIds);

    if (smError) throw smError;
    productLookup = buildProductLookup(smData as DbStarterMeal[]);
  }

  return meals.map(meal => {
    const domainMeal = dbMealToDomain(meal);
    if (!meal.source_starter_meal_id) return domainMeal;

    const byName = productLookup.get(meal.source_starter_meal_id);
    // Enrich each ingredient with product links and catalog flags
    if (!byName) {
      return {
        ...domainMeal,
        ingredients: domainMeal.ingredients.map(ing => {
          const cat = catalogByName.get(ing.name.toLowerCase());
          return {
            ...ing,
            optional: cat?.optional ?? false,
            pantryStaple: cat?.pantry_staple ?? false,
          };
        }),
      };
    }

    return {
      ...domainMeal,
      ingredients: domainMeal.ingredients.map(ing => {
        const starterIng = byName.get(ing.name.toLowerCase());
        const cat = catalogByName.get(ing.name.toLowerCase());
        if (!starterIng) {
          return {
            ...ing,
            optional: cat?.optional ?? false,
            pantryStaple: cat?.pantry_staple ?? false,
          };
        }
        return {
          ...ing,
          primaryProduct: starterIng.primaryProduct,
          productOptions: starterIng.productOptions,
          optional: cat?.optional ?? false,
          pantryStaple: cat?.pantry_staple ?? false,
        };
      }),
    };
  });
}

export async function createMeal(
  meal: Omit<Meal, 'id'> & { userId: string }
): Promise<Meal> {
  const { data: mealRow, error: mealError } = await supabase
    .from('meals')
    .insert({
      user_id: meal.userId,
      name: meal.name,
      tags: meal.tags ?? [],
      prep_time_mins: meal.prepTimeMins ?? null,
      cook_time_mins: meal.cookTimeMins ?? null,
      instructions: meal.instructions,
      source_starter_meal_id: meal.sourceStarterMealId ?? null,
    })
    .select()
    .single();

  if (mealError) throw mealError;

  if (meal.ingredients.length > 0) {
    const { error: ingError } = await supabase
      .from('meal_ingredients')
      .insert(
        meal.ingredients.map((ing, idx) => ({
          meal_id: mealRow.id,
          name: ing.name,
          quantity: ing.quantityNum ?? null,
          unit: ing.unit ?? null,
          quantity_label: ing.quantity
            ?? (ing.quantityNum != null && ing.unit ? formatQuantity(ing.quantityNum, ing.unit) : null),
          store: ing.store ?? null,
          notes: ing.notes ?? null,
          sort_order: idx,
        }))
      );
    if (ingError) throw ingError;
  }

  return getMealById(mealRow.id);
}

export async function updateMeal(meal: Meal): Promise<Meal> {
  const { error: mealError } = await supabase
    .from('meals')
    .update({
      name: meal.name,
      tags: meal.tags ?? [],
      prep_time_mins: meal.prepTimeMins ?? null,
      cook_time_mins: meal.cookTimeMins ?? null,
      instructions: meal.instructions,
    })
    .eq('id', meal.id);

  if (mealError) throw mealError;

  // Replace ingredients: delete existing, re-insert
  const { error: delError } = await supabase
    .from('meal_ingredients')
    .delete()
    .eq('meal_id', meal.id);
  if (delError) throw delError;

  if (meal.ingredients.length > 0) {
    const { error: ingError } = await supabase
      .from('meal_ingredients')
      .insert(
        meal.ingredients.map((ing, idx) => ({
          meal_id: meal.id,
          name: ing.name,
          quantity: ing.quantityNum ?? null,
          unit: ing.unit ?? null,
          quantity_label: ing.quantity
            ?? (ing.quantityNum != null && ing.unit ? formatQuantity(ing.quantityNum, ing.unit) : null),
          store: ing.store ?? null,
          notes: ing.notes ?? null,
          sort_order: idx,
        }))
      );
    if (ingError) throw ingError;
  }

  return getMealById(meal.id);
}

export async function deleteMeal(id: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw error;
}

export async function getMealById(id: string): Promise<Meal> {
  const { data, error } = await supabase
    .from('meals')
    .select('*, meal_ingredients(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  const meal = dbMealToDomain(data as DbMeal);
  const names = Array.from(new Set(meal.ingredients.map(i => i.name.trim()).filter(Boolean)));
  if (names.length === 0) return meal;
  const { data: catRows, error: catErr } = await supabase
    .from('ingredients')
    .select('name, optional, pantry_staple')
    .in('name', names);
  if (catErr) throw catErr;
  const byName = new Map(
    (catRows as { name: string; optional: boolean; pantry_staple: boolean }[]).map(r => [
      r.name.toLowerCase(),
      { optional: r.optional, pantry_staple: r.pantry_staple },
    ])
  );
  return {
    ...meal,
    ingredients: meal.ingredients.map(ing => {
      const cat = byName.get(ing.name.toLowerCase());
      return {
        ...(ing as Ingredient),
        optional: cat?.optional ?? false,
        pantryStaple: cat?.pantry_staple ?? false,
      };
    }),
  };
}

/**
 * Copy selected starter meals (and their ingredients) into the current user's
 * meal library. Preserves source_starter_meal_id for traceability.
 */
export async function importStarterMealsForUser(
  starterMealIds: string[],
  userId: string
): Promise<void> {
  const uniqueIds = Array.from(new Set(starterMealIds));
  if (uniqueIds.length === 0) return;

  // Prevent duplicate imports by removing starter meals already present
  // in this user's meal library.
  const { data: existingRows, error: existingErr } = await supabase
    .from('meals')
    .select('source_starter_meal_id')
    .eq('user_id', userId)
    .in('source_starter_meal_id', uniqueIds);

  if (existingErr) throw existingErr;

  const existingIds = new Set(
    (existingRows as { source_starter_meal_id: string | null }[])
      .map(r => r.source_starter_meal_id)
      .filter((id): id is string => id != null)
  );

  const toImport = uniqueIds.filter(id => !existingIds.has(id));
  if (toImport.length === 0) return;

  const { data, error } = await supabase
    .from('starter_meals')
    .select(`*, starter_meal_ingredients(${STARTER_INGREDIENT_SELECT})`)
    .in('id', toImport);

  if (error) throw error;

  const starterMeals = (data as DbStarterMeal[]).map(dbStarterMealToDomain);

  await Promise.all(
    starterMeals.map(sm =>
      createMeal({
        userId,
        name: sm.name,
        tags: sm.tags,
        ingredients: sm.ingredients,
        instructions: sm.instructions,
        prepTimeMins: sm.prepTimeMins,
        cookTimeMins: sm.cookTimeMins,
        sourceStarterMealId: sm.id,
      })
    )
  );
}

/**
 * Mark the user's onboarding as completed.
 */
export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ has_completed_onboarding: true })
    .eq('id', userId);
  if (error) throw error;
}
