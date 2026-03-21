import { supabase } from '../../lib/supabase';
import type { MealIngredientProduct, StarterMeal } from '../../domain/types';

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface DbStoreProduct {
  id: string;
  name: string;
  brand: string | null;
  size_label: string | null;
  store: string;
  product_url: string;
  image_url: string | null;
}

interface DbProductOption {
  id: string;
  store_product_id: string;
  sort_order: number;
  store_products: DbStoreProduct;
}

export interface DbStarterIngredient {
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
  starter_meal_ingredients: DbStarterIngredient[];
}

// ─── Domain types for this feature ───────────────────────────────────────────

export interface IngredientProductOption {
  optionRowId: string;
  storeProductId: string;
  product: MealIngredientProduct;
  sortOrder: number;
}

export interface StarterIngredient {
  id: string;
  name: string;
  quantity?: string;
  sortOrder: number;
  primaryProductId?: string;
  primaryProduct?: MealIngredientProduct;
  productOptions: IngredientProductOption[];
}

export interface StarterMealWithIngredients {
  id: string;
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  ingredients: StarterIngredient[];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function dbProductToDomain(row: DbStoreProduct): MealIngredientProduct {
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

function dbIngredientToDomain(row: DbStarterIngredient): StarterIngredient {
  const primaryProduct = row.store_products
    ? dbProductToDomain(row.store_products)
    : undefined;

  const productOptions: IngredientProductOption[] = [...(row.starter_meal_ingredient_product_options ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(opt => ({
      optionRowId: opt.id,
      storeProductId: opt.store_product_id,
      product: dbProductToDomain(opt.store_products),
      sortOrder: opt.sort_order,
    }));

  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity ?? undefined,
    sortOrder: row.sort_order,
    primaryProductId: row.store_product_id ?? undefined,
    primaryProduct,
    productOptions,
  };
}

function dbMealToDomain(row: DbStarterMeal): StarterMealWithIngredients {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    tags: row.tags ?? [],
    ingredients: [...(row.starter_meal_ingredients ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbIngredientToDomain),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const INGREDIENT_SELECT =
  '*, store_products:store_product_id(*), starter_meal_ingredient_product_options(id, sort_order, store_product_id, store_products:store_product_id(*))';

export async function getStarterMealsWithIngredients(): Promise<StarterMealWithIngredients[]> {
  const { data, error } = await supabase
    .from('starter_meals')
    .select(`id, slug, name, description, tags, prep_time_mins, cook_time_mins, starter_meal_ingredients(${INGREDIENT_SELECT})`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as DbStarterMeal[]).map(dbMealToDomain);
}

/**
 * Set the default (primary) product for an ingredient.
 * Pass `null` to clear the default.
 */
export async function setIngredientPrimaryProduct(
  ingredientId: string,
  productId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('starter_meal_ingredients')
    .update({ store_product_id: productId })
    .eq('id', ingredientId);

  if (error) throw error;
}

/**
 * Add a store product to an ingredient's options list.
 */
export async function addIngredientProductOption(
  ingredientId: string,
  productId: string,
  sortOrder: number
): Promise<void> {
  const { error } = await supabase
    .from('starter_meal_ingredient_product_options')
    .insert({
      starter_meal_ingredient_id: ingredientId,
      store_product_id: productId,
      sort_order: sortOrder,
    });

  if (error) throw error;
}

/**
 * Remove a store product from an ingredient's options list.
 */
export async function removeIngredientProductOption(
  ingredientId: string,
  productId: string
): Promise<void> {
  const { error } = await supabase
    .from('starter_meal_ingredient_product_options')
    .delete()
    .eq('starter_meal_ingredient_id', ingredientId)
    .eq('store_product_id', productId);

  if (error) throw error;
}

// Re-export StarterMeal type shape that the rest of the app uses
export type { StarterMeal };
