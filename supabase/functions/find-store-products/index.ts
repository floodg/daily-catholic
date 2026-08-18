import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AnySupabaseClient,
  collectCandidates,
  type LogFn,
} from "../_shared/product-enrichment.ts";
import { ensureIngredientNutrition } from "../_shared/nutrition-enrichment.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_STORES = new Set(["Coles", "Woolworths", "Aldi", "IGA", "Other"]);

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  // Pass the JWT explicitly — global Authorization headers are not always
  // picked up by auth.getUser() in the Edge runtime.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) {
    console.log(JSON.stringify({
      level: "warn",
      msg: "Unauthorized",
      context: { auth_error: userError?.message ?? "no user" },
    }));
    return jsonResponse({
      error: "Unauthorized — sign out and sign back in, then try again.",
    }, 401);
  }

  let body: { ingredientName?: unknown; store?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const ingredientName = typeof body.ingredientName === "string"
    ? body.ingredientName.trim()
    : "";
  const store = typeof body.store === "string" ? body.store.trim() : "";

  if (!ingredientName) {
    return jsonResponse({ error: "ingredientName is required" }, 400);
  }
  if (!ALLOWED_STORES.has(store)) {
    return jsonResponse({
      error: `store must be one of: ${[...ALLOWED_STORES].join(", ")}`,
    }, 400);
  }

  const log: LogFn = (msg, level = "info", context = null) => {
    console.log(JSON.stringify({ level, msg, context, user_id: userData.user.id }));
  };

  const serviceClient = createClient(supabaseUrl, serviceKey) as AnySupabaseClient;

  try {
    // Prefer Claude when Gemini quota is often exhausted (429).
    // Persist matches as user-owned so they don't enter the shared catalog.
    const candidates = await collectCandidates(
      serviceClient,
      ingredientName,
      store,
      log,
      { preferGemini: false, limit: 6, userId: userData.user.id },
    );

    // The first candidate is the highest-ranked product match. Use it to fill
    // the ingredient's macro profile if the user has not already supplied one.
    // Nutrition enrichment is best-effort and must never block product search.
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

    return jsonResponse({ products, nutritionHydrated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[find-store-products] failed: ${message}`, "error");
    return jsonResponse({ error: message }, 500);
  }
});
