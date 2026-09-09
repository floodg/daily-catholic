import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AnySupabaseClient,
  collectCandidates,
} from "../_shared/product-enrichment.ts";
import { ensureIngredientNutrition } from "../_shared/nutrition-enrichment.ts";
import { createPersistentLogger } from "../_shared/persistent-logger.ts";
import {
  buildProductSearchVariants,
  logSearchNormalization,
  normalizeProductSearchTerm,
} from "../_shared/product-search.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_STORES = new Set(["Coles", "Woolworths", "Aldi", "IGA", "Other"]);
const FUNCTION_NAME = "find-store-products";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceKey) as AnySupabaseClient;
  const { runId, log, flush } = createPersistentLogger(serviceClient, FUNCTION_NAME);
  const respond = async (body: Record<string, unknown>, status = 200) => {
    await flush();
    return jsonResponse({ run_id: runId, ...body }, status);
  };

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    log("Missing authorization", "warn");
    return respond({ error: "Missing authorization" }, 401);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) {
    log("Missing authorization token", "warn");
    return respond({ error: "Missing authorization" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) {
    log("Unauthorized", "warn", { auth_error: userError?.message ?? "no user" });
    return respond({
      error: "Unauthorized — sign out and sign back in, then try again.",
    }, 401);
  }

  let body: { ingredientName?: unknown; store?: unknown };
  try {
    body = await req.json();
  } catch {
    log("Invalid JSON body", "warn", { user_id: userData.user.id });
    return respond({ error: "Invalid JSON body" }, 400);
  }

  const ingredientName = typeof body.ingredientName === "string"
    ? body.ingredientName.trim()
    : "";
  const store = typeof body.store === "string" ? body.store.trim() : "";

  if (!ingredientName) {
    log("ingredientName is required", "warn", { user_id: userData.user.id });
    return respond({ error: "ingredientName is required" }, 400);
  }
  if (!ALLOWED_STORES.has(store)) {
    log("Invalid store", "warn", { user_id: userData.user.id, store });
    return respond({
      error: `store must be one of: ${[...ALLOWED_STORES].join(", ")}`,
    }, 400);
  }

  const searchTerm = normalizeProductSearchTerm(ingredientName);
  const variants = buildProductSearchVariants(ingredientName);
  logSearchNormalization(ingredientName, searchTerm, store, log);
  log(`[find-store-products] starting search`, "info", {
    user_id: userData.user.id,
    ingredient_name: ingredientName,
    search_term: searchTerm,
    search_variants: variants,
    store,
  });

  try {
    const byId = new Map<string, Awaited<ReturnType<typeof collectCandidates>>[number]>();

    for (const variant of variants) {
      const candidates = await collectCandidates(
        serviceClient,
        variant,
        store,
        log,
        { preferGemini: false, limit: 6, userId: userData.user.id },
      );

      log(`[find-store-products] variant completed`, candidates.length > 0 ? "info" : "warn", {
        user_id: userData.user.id,
        ingredient_name: ingredientName,
        search_term: variant,
        store,
        candidate_count: candidates.length,
        reason: candidates.length > 0 ? "candidates_found" : "no_candidates_after_validation",
      });

      for (const candidate of candidates) {
        if (candidate.id) byId.set(candidate.id, candidate);
      }
      if (byId.size >= 6) break;
    }

    const candidates = [...byId.values()].slice(0, 6);

    const nutritionHydrated = await ensureIngredientNutrition(
      serviceClient,
      userData.user.id,
      ingredientName,
      candidates[0] ?? null,
      log,
    );

    const products = candidates.map((c) => ({
      id: c.id,
      name: c.name,
      brand: c.brand ?? undefined,
      sizeLabel: c.size_label ?? undefined,
      store: c.store,
      productUrl: c.product_url,
      imageUrl: c.image_url ?? undefined,
    }));

    const elapsedMs = Date.now() - startedAt;
    log(
      products.length > 0
        ? `[find-store-products] completed with ${products.length} product(s)`
        : `[find-store-products] completed with no products`,
      products.length > 0 ? "info" : "warn",
      {
        user_id: userData.user.id,
        ingredient_name: ingredientName,
        search_term: searchTerm,
        store,
        product_count: products.length,
        nutrition_hydrated: nutritionHydrated,
        elapsed_ms: elapsedMs,
        reason: products.length > 0 ? "success" : "no_products_found",
      },
    );

    return respond({
      products,
      nutritionHydrated,
      searchTerm,
      diagnostics: products.length > 0
        ? undefined
        : {
          reason: "no_products_found",
          searched: variants,
          store,
        },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[find-store-products] failed: ${message}`, "error", {
      user_id: userData.user.id,
      ingredient_name: ingredientName,
      search_term: searchTerm,
      store,
      elapsed_ms: Date.now() - startedAt,
    });
    return respond({ error: message }, 500);
  }
});
