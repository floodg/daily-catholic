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
    .select("id, name, store, product_url, size_label, user_id")
    .eq("id", productId)
    .maybeSingle();

  if (productError) return jsonResponse({ error: productError.message }, 500);
  if (!product) return jsonResponse({ error: "Product not found" }, 404);

  const ownerId = (product as { user_id?: string | null }).user_id ?? null;
  if (ownerId && ownerId !== userData.user.id) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  const hydrated = await ensureIngredientNutrition(
    serviceClient,
    userData.user.id,
    ingredientName,
    {
      name: product.name as string,
      store: product.store as string,
      product_url: product.product_url as string | null,
      size_label: product.size_label as string | null,
    },
    log,
  );

  return jsonResponse({ hydrated });
});
