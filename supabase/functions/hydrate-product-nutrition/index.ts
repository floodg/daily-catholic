import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AnySupabaseClient, LogFn } from "../_shared/product-enrichment.ts";
import { ensureIngredientNutrition } from "../_shared/nutrition-enrichment.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MATCH_STOP_WORDS = new Set([
  "coles", "woolworths", "woolies", "aldi", "iga",
  "australian", "australia", "fresh", "organic", "natural",
  "free", "range", "premium", "classic", "original", "value",
  "pack", "pk", "packet", "each", "ea", "large", "medium", "small",
  "fillet", "fillets", "portion", "portions",
]);

const singularizeToken = (token: string): string => {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("oes") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
};

const normalizeForMatch = (value: string): string[] => value
  .toLowerCase()
  .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|mg|l|ml|pack|pk|pkt|ct|count|x)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .split(/\s+/)
  .map(singularizeToken)
  .filter((token) => token.length > 1 && !MATCH_STOP_WORDS.has(token));

const scoreIngredientMatch = (
  mealIngredientName: string,
  productName: string,
  requestedIngredientName: string,
): number => {
  const ingredientTokens = normalizeForMatch(mealIngredientName);
  const productTokens = normalizeForMatch(productName);
  const requestedTokens = normalizeForMatch(requestedIngredientName);
  if (ingredientTokens.length === 0 || productTokens.length === 0) return -1000;

  const ingredientNorm = ingredientTokens.join(" ");
  const productNorm = productTokens.join(" ");
  const requestedNorm = requestedTokens.join(" ");

  let score = 0;
  if (ingredientNorm === productNorm) score += 220;
  if (productNorm.startsWith(`${ingredientNorm} `) || productNorm.endsWith(` ${ingredientNorm}`)) score += 130;
  else if (productNorm.includes(ingredientNorm)) score += 100;

  const matched = ingredientTokens.filter((token) => productTokens.includes(token));
  if (matched.length === 0) return -1000;
  const coverage = matched.length / ingredientTokens.length;
  score += Math.round(coverage * 80);
  if (coverage === 1 && ingredientTokens.length >= 2) score += 60;

  // One-word ingredients are deliberately conservative unless the product name
  // effectively resolves to that word. This avoids links such as "salt" →
  // "salt reduced chicken stock".
  if (ingredientTokens.length === 1 && ingredientNorm !== productNorm) {
    const token = ingredientTokens[0];
    const isEdgeToken = productTokens[0] === token || productTokens[productTokens.length - 1] === token;
    score += isEdgeToken ? 35 : -70;
  }

  // The caller's ingredient name is useful corroboration, but product-name
  // evidence is still required before a link is written.
  if (requestedNorm && requestedNorm === ingredientNorm) score += 45;
  return score;
};

interface MatchedIngredient {
  id: string;
  name: string;
  score: number;
}

async function matchProductToMealIngredient(
  supabase: AnySupabaseClient,
  userId: string,
  productId: string,
  productName: string,
  requestedIngredientName: string,
  productOwnerId: string | null,
  log: LogFn,
): Promise<MatchedIngredient | null> {
  const { data: mealRows, error: mealError } = await supabase
    .from("meals")
    .select("id")
    .eq("user_id", userId);
  if (mealError) {
    log("[hydrate-link] failed to load meals", "warn", { error: mealError });
    return null;
  }

  const mealIds = ((mealRows ?? []) as { id: string }[]).map((row) => row.id);
  if (mealIds.length === 0) return null;

  const { data: ingredientRows, error: ingredientError } = await supabase
    .from("meal_ingredients")
    .select("name")
    .in("meal_id", mealIds);
  if (ingredientError) {
    log("[hydrate-link] failed to load meal ingredients", "warn", { error: ingredientError });
    return null;
  }

  const names = Array.from(new Set(
    ((ingredientRows ?? []) as { name: string }[])
      .map((row) => row.name?.trim())
      .filter((name): name is string => Boolean(name)),
  ));

  const ranked = names
    .map((name) => ({ name, score: scoreIngredientMatch(name, productName, requestedIngredientName) }))
    .filter((entry) => entry.score >= 120)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) {
    log("[hydrate-link] no confident meal ingredient match", "info", {
      product_id: productId,
      product_name: productName,
      requested_ingredient: requestedIngredientName,
    });
    return null;
  }

  const second = ranked[1];
  if (second && best.score - second.score < 25 && best.name.toLowerCase() !== requestedIngredientName.toLowerCase()) {
    log("[hydrate-link] ambiguous meal ingredient match; leaving product unlinked", "info", {
      product_id: productId,
      product_name: productName,
      best: best.name,
      best_score: best.score,
      second: second.name,
      second_score: second.score,
    });
    return null;
  }

  const { data: catalogRows, error: catalogError } = await supabase
    .from("ingredients")
    .select("id, name, created_by_user_id")
    .ilike("name", best.name);
  if (catalogError) {
    log("[hydrate-link] failed to resolve canonical ingredient", "warn", { error: catalogError });
    return null;
  }

  const catalog = ((catalogRows ?? []) as { id: string; name: string; created_by_user_id: string | null }[])
    .sort((a, b) => {
      const aExact = a.name === best.name ? 0 : 1;
      const bExact = b.name === best.name ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aShared = a.created_by_user_id == null ? 0 : 1;
      const bShared = b.created_by_user_id == null ? 0 : 1;
      return aShared - bShared;
    })[0] ?? null;

  if (!catalog) {
    log("[hydrate-link] matched meal ingredient has no canonical ingredient row", "info", {
      product_id: productId,
      ingredient_name: best.name,
    });
    return null;
  }

  // Shared catalog products must never be linked to another user's private
  // ingredient row. Shared ingredients are safe for shared products; user-owned
  // products can also link to that same user's private ingredient.
  if (productOwnerId == null && catalog.created_by_user_id != null) {
    log("[hydrate-link] shared product matched a private ingredient; leaving unlinked", "info", {
      product_id: productId,
      ingredient_id: catalog.id,
      ingredient_name: catalog.name,
    });
    return null;
  }
  if (productOwnerId != null && catalog.created_by_user_id != null && catalog.created_by_user_id !== userId) {
    return null;
  }

  const { error: linkError } = await supabase
    .from("store_products")
    .update({ ingredient_id: catalog.id })
    .eq("id", productId);
  if (linkError) {
    log("[hydrate-link] failed to link product to ingredient", "warn", {
      product_id: productId,
      ingredient_id: catalog.id,
      error: linkError,
    });
    return null;
  }

  // If the meal row did not already have a curated product, attach this matched
  // product without overwriting an existing explicit selection.
  await supabase
    .from("meal_ingredients")
    .update({ store_product_id: productId })
    .in("meal_id", mealIds)
    .ilike("name", best.name)
    .is("store_product_id", null);

  log("[hydrate-link] linked product to meal ingredient", "info", {
    product_id: productId,
    product_name: productName,
    ingredient_id: catalog.id,
    ingredient_name: catalog.name,
    score: best.score,
  });

  return { id: catalog.id, name: catalog.name, score: best.score };
}

async function propagateIngredientMatch(
  supabase: AnySupabaseClient,
  userId: string,
  productId: string,
  ingredient: MatchedIngredient,
  log: LogFn,
): Promise<void> {
  const { data: tripRows, error: tripError } = await supabase
    .from("shopping_trips")
    .select("id")
    .eq("user_id", userId);
  if (tripError) {
    log("[hydrate-link] failed to load shopping trips for propagation", "warn", { error: tripError });
    return;
  }

  const tripIds = ((tripRows ?? []) as { id: string }[]).map((row) => row.id);
  if (tripIds.length === 0) return;

  const { data: tripItems, error: tripItemError } = await supabase
    .from("shopping_trip_items")
    .select("id")
    .in("shopping_trip_id", tripIds)
    .eq("store_product_id", productId);
  if (tripItemError) {
    log("[hydrate-link] failed to find shopping items for propagation", "warn", { error: tripItemError });
    return;
  }

  const tripItemIds = ((tripItems ?? []) as { id: string }[]).map((row) => row.id);
  if (tripItemIds.length === 0) return;

  await supabase
    .from("shopping_trip_items")
    .update({ ingredient_name: ingredient.name })
    .in("id", tripItemIds);

  const { data: listRows, error: listError } = await supabase
    .from("shopping_list")
    .select("id")
    .eq("user_id", userId)
    .in("shopping_trip_item_id", tripItemIds);
  if (listError) {
    log("[hydrate-link] failed to find shopping-list rows for propagation", "warn", { error: listError });
    return;
  }

  const listIds = ((listRows ?? []) as { id: string }[]).map((row) => row.id);
  if (listIds.length > 0) {
    await supabase
      .from("shopping_list")
      .update({ ingredient_name: ingredient.name })
      .eq("user_id", userId)
      .in("id", listIds);
  }

  await supabase
    .from("inventory_transactions")
    .update({ ingredient_id: ingredient.id, ingredient_name: ingredient.name })
    .eq("user_id", userId)
    .eq("source_type", "shopping_trip_item")
    .in("source_id", tripItemIds);

  if (listIds.length > 0) {
    await supabase
      .from("inventory_transactions")
      .update({ ingredient_id: ingredient.id, ingredient_name: ingredient.name })
      .eq("user_id", userId)
      .eq("source_type", "shopping_list_item")
      .in("source_id", listIds);
  }

  log("[hydrate-link] propagated canonical ingredient through Pantry purchase rows", "info", {
    product_id: productId,
    ingredient_id: ingredient.id,
    ingredient_name: ingredient.name,
    shopping_trip_items: tripItemIds.length,
    shopping_list_items: listIds.length,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Missing authorization" }, 401);
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) return jsonResponse({ error: "Missing authorization" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: { ingredientName?: unknown; productId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const ingredientName = typeof body.ingredientName === "string" ? body.ingredientName.trim() : "";
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!ingredientName) return jsonResponse({ error: "ingredientName is required" }, 400);
  if (!productId) return jsonResponse({ error: "productId is required" }, 400);

  const log: LogFn = (msg, level = "info", context = null) => {
    console.log(JSON.stringify({ level, msg, context, user_id: userData.user.id }));
  };
  const serviceClient = createClient(supabaseUrl, serviceKey) as AnySupabaseClient;

  const { data: product, error: productError } = await serviceClient
    .from("store_products")
    .select("id, name, store, product_url, size_label, user_id, ingredient_id")
    .eq("id", productId)
    .maybeSingle();

  if (productError) return jsonResponse({ error: productError.message }, 500);
  if (!product) return jsonResponse({ error: "Product not found" }, 404);

  const ownerId = (product as { user_id?: string | null }).user_id ?? null;
  if (ownerId && ownerId !== userData.user.id) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  const matchedIngredient = await matchProductToMealIngredient(
    serviceClient,
    userData.user.id,
    productId,
    product.name as string,
    ingredientName,
    ownerId,
    log,
  );

  if (matchedIngredient) {
    await propagateIngredientMatch(
      serviceClient,
      userData.user.id,
      productId,
      matchedIngredient,
      log,
    );
  }

  const hydrationIngredientName = matchedIngredient?.name ?? ingredientName;
  const hydrated = await ensureIngredientNutrition(
    serviceClient,
    userData.user.id,
    hydrationIngredientName,
    {
      name: product.name as string,
      store: product.store as string,
      product_url: product.product_url as string | null,
      size_label: product.size_label as string | null,
    },
    log,
  );

  return jsonResponse({
    hydrated,
    matchedIngredient: matchedIngredient
      ? { id: matchedIngredient.id, name: matchedIngredient.name, score: matchedIngredient.score }
      : null,
  });
});
