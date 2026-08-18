import type { AnySupabaseClient, LogFn } from "./product-enrichment.ts";

export interface NutritionSourceProduct {
  name: string;
  store: string;
  product_url?: string | null;
  size_label?: string | null;
}

interface NutritionProfile {
  basis_unit: "g" | "ml";
  amount_per_unit: number | null;
  calories_kcal_per_100: number;
  protein_g_per_100: number;
  fat_g_per_100: number;
  total_carbs_g_per_100: number;
  fibre_g_per_100: number;
}

const normalizeIngredientKey = (value: string): string =>
  value.trim().toLowerCase();

const finiteNonNegative = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const finitePositive = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parseNutritionPayload = (text: string): NutritionProfile | null => {
  let json = String(text).trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) json = fence[1];
  else {
    const object = json.match(/\{[\s\S]*\}/);
    if (object) json = object[0];
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const basis = parsed.basis_unit === "ml" ? "ml" : "g";
    const calories = finiteNonNegative(parsed.calories_kcal_per_100);
    const protein = finiteNonNegative(parsed.protein_g_per_100);
    const fat = finiteNonNegative(parsed.fat_g_per_100);
    const carbs = finiteNonNegative(parsed.total_carbs_g_per_100);
    const fibre = finiteNonNegative(parsed.fibre_g_per_100);

    if ([calories, protein, fat, carbs, fibre].some((v) => v === null)) {
      return null;
    }

    return {
      basis_unit: basis,
      amount_per_unit: finitePositive(parsed.amount_per_unit),
      calories_kcal_per_100: calories!,
      protein_g_per_100: protein!,
      fat_g_per_100: fat!,
      total_carbs_g_per_100: carbs!,
      fibre_g_per_100: fibre!,
    };
  } catch {
    return null;
  }
};

const lookupNutritionWithClaude = async (
  ingredientName: string,
  product: NutritionSourceProduct,
  log: LogFn,
): Promise<NutritionProfile | null> => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    log("[nutrition] ANTHROPIC_API_KEY is not configured", "warn", {
      ingredient_name: ingredientName,
    });
    return null;
  }

  const productUrl = product.product_url?.trim() || null;
  const searchTarget = productUrl
    ? `the exact product page ${productUrl}`
    : `${product.name} at ${product.store} Australia`;

  const prompt = `Find nutrition information for this grocery ingredient and product.
Ingredient: ${ingredientName}
Product: ${product.name}
Store: ${product.store}
Pack size: ${product.size_label ?? "unknown"}
Product URL: ${productUrl ?? "unknown"}

Use web_search and prefer ${searchTarget}. Use the exact product nutrition panel when available. If the exact panel is unavailable, use a reasonable nutrition estimate for the closest equivalent food so the app can calculate macros automatically.

Normalize all nutrition to per 100 g for solid foods or per 100 ml for liquids. If the source only gives values per serving, convert them using the serving size. For ingredients normally counted in units (for example eggs), set amount_per_unit to the approximate grams or ml represented by one unit; otherwise return null.

Return JSON only in exactly this shape:
{
  "basis_unit": "g",
  "amount_per_unit": null,
  "calories_kcal_per_100": 0,
  "protein_g_per_100": 0,
  "fat_g_per_100": 0,
  "total_carbs_g_per_100": 0,
  "fibre_g_per_100": 0
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      log(`[nutrition] Claude HTTP ${response.status}: ${body.slice(0, 300)}`, "warn", {
        ingredient_name: ingredientName,
        product_name: product.name,
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    const textBlock = [...(data?.content ?? [])]
      .reverse()
      .find((block: { type?: string }) => block.type === "text");
    const text = (textBlock as { text?: string } | undefined)?.text ?? "";
    return parseNutritionPayload(String(text));
  } catch (error) {
    log(`[nutrition] lookup failed: ${error instanceof Error ? error.message : String(error)}`, "warn", {
      ingredient_name: ingredientName,
      product_name: product.name,
    });
    return null;
  }
};

/**
 * Populate a user's ingredient nutrition profile from the best hydrated store
 * product. Existing profiles are never overwritten, so manual edits remain
 * authoritative.
 */
export const ensureIngredientNutrition = async (
  supabase: AnySupabaseClient,
  userId: string,
  ingredientName: string,
  product: NutritionSourceProduct | null | undefined,
  log: LogFn,
): Promise<boolean> => {
  const trimmedName = ingredientName.trim();
  const ingredientKey = normalizeIngredientKey(trimmedName);
  if (!ingredientKey || !product) return false;

  const { data: existing, error: existingError } = await supabase
    .from("user_ingredient_nutrition")
    .select("id")
    .eq("user_id", userId)
    .eq("ingredient_key", ingredientKey)
    .maybeSingle();

  if (existingError) {
    log(`[nutrition] existing profile lookup failed: ${existingError.message}`, "warn", {
      ingredient_name: trimmedName,
      user_id: userId,
    });
    return false;
  }

  if (existing) {
    log(`[nutrition] keeping existing profile for "${trimmedName}"`, "debug", {
      ingredient_name: trimmedName,
      user_id: userId,
    });
    return false;
  }

  const nutrition = await lookupNutritionWithClaude(trimmedName, product, log);
  if (!nutrition) return false;

  const { error } = await supabase
    .from("user_ingredient_nutrition")
    .insert({
      user_id: userId,
      ingredient_key: ingredientKey,
      ingredient_name: trimmedName,
      basis_unit: nutrition.basis_unit,
      amount_per_unit: nutrition.amount_per_unit,
      calories_kcal_per_100: nutrition.calories_kcal_per_100,
      protein_g_per_100: nutrition.protein_g_per_100,
      fat_g_per_100: nutrition.fat_g_per_100,
      total_carbs_g_per_100: nutrition.total_carbs_g_per_100,
      fibre_g_per_100: nutrition.fibre_g_per_100,
    });

  if (error) {
    // A concurrent request or a manual edit may have created the row after the
    // initial lookup. Never overwrite it.
    if ((error as { code?: string }).code === "23505") return false;
    log(`[nutrition] profile insert failed: ${error.message}`, "warn", {
      ingredient_name: trimmedName,
      user_id: userId,
      product_name: product.name,
    });
    return false;
  }

  log(`[nutrition] automatically hydrated macros for "${trimmedName}"`, "info", {
    ingredient_name: trimmedName,
    user_id: userId,
    product_name: product.name,
    store: product.store,
  });
  return true;
};
