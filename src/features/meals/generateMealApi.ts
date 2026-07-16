import { supabase } from '../../lib/supabase';
import type { Ingredient, Meal, MealIngredientProduct, MeasurementUnitCode } from '../../domain/types';

const ALLOWED_UNITS = new Set<MeasurementUnitCode>([
  'g', 'ml', 'units', 'tsp', 'tbsp', 'cup',
]);

export interface GenerateMealDraft {
  name: string;
  tags: string[];
  prepTimeMins?: number;
  cookTimeMins?: number;
  instructions: string[];
  ingredients: Ingredient[];
}

interface ApiDraftProduct {
  id: string;
  name: string;
  brand?: string;
  sizeLabel?: string;
  store: string;
  productUrl: string | null;
  imageUrl?: string;
}

interface ApiDraftIngredient {
  name: string;
  quantityNum?: number;
  unit?: string;
  quantity?: string;
  store?: string;
  notes?: string;
  primaryProduct?: ApiDraftProduct;
}

interface ApiDraftMeal {
  name: string;
  tags?: string[];
  prepTimeMins?: number;
  cookTimeMins?: number;
  instructions?: string[];
  ingredients?: ApiDraftIngredient[];
}

function mapProduct(p: ApiDraftProduct): MealIngredientProduct {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    sizeLabel: p.sizeLabel,
    store: p.store,
    productUrl: p.productUrl,
    imageUrl: p.imageUrl,
  };
}

function mapDraft(meal: ApiDraftMeal): GenerateMealDraft {
  return {
    name: meal.name?.trim() || 'Untitled meal',
    tags: Array.isArray(meal.tags) ? meal.tags.filter(Boolean) : [],
    prepTimeMins: meal.prepTimeMins,
    cookTimeMins: meal.cookTimeMins,
    instructions: Array.isArray(meal.instructions)
      ? meal.instructions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    ingredients: (meal.ingredients ?? []).map((ing, idx): Ingredient => {
      const unit = typeof ing.unit === 'string' && ALLOWED_UNITS.has(ing.unit as MeasurementUnitCode)
        ? (ing.unit as MeasurementUnitCode)
        : undefined;
      return {
        id: `draft-${idx}`,
        name: ing.name,
        quantityNum: ing.quantityNum,
        unit,
        quantity: ing.quantity,
        store: ing.store,
        notes: ing.notes,
        primaryProduct: ing.primaryProduct ? mapProduct(ing.primaryProduct) : undefined,
      };
    }),
  };
}

async function readInvokeErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: Response }).context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = await ctx.json() as { error?: string; message?: string };
    return body.error || body.message || null;
  } catch {
    return null;
  }
}

export async function generateMealDraft(
  prompt: string,
  store: string,
): Promise<GenerateMealDraft> {
  const { data, error } = await supabase.functions.invoke('generate-meal', {
    body: { prompt, store },
  });

  const payload = data as { meal?: ApiDraftMeal; error?: string } | null;
  if (payload?.error) {
    throw new Error(payload.error);
  }
  if (error) {
    const fromBody = await readInvokeErrorMessage(error);
    throw new Error(fromBody || error.message || 'Failed to generate meal');
  }
  if (!payload?.meal) {
    throw new Error('No meal returned from generate-meal');
  }

  return mapDraft(payload.meal);
}

/** Convert a confirmed draft into a Meal-shaped object ready for createMeal. */
export function draftToMealInput(draft: GenerateMealDraft): Omit<Meal, 'id'> {
  return {
    name: draft.name,
    tags: draft.tags,
    prepTimeMins: draft.prepTimeMins,
    cookTimeMins: draft.cookTimeMins,
    instructions: draft.instructions,
    ingredients: draft.ingredients.map((ing, idx) => ({
      ...ing,
      id: ing.id || `ing-${idx}`,
    })),
  };
}
