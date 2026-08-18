import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AnySupabaseClient,
  collectCandidate,
  GEMINI_DEFAULT_MODEL,
  GEMINI_FALLBACK_MODEL,
  type LogFn,
  persistCandidate,
} from "../_shared/product-enrichment.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_UNITS = new Set(["g", "ml", "units", "tsp", "tbsp", "cup"]);
const ALLOWED_STORES = new Set(["Coles", "Woolworths", "Aldi", "IGA", "Other"]);
const MEAL_FETCH_TIMEOUT_MS = 40_000;

interface GeneratedIngredient {
  name: string;
  quantityNum: number | null;
  unit: string | null;
  notes?: string | null;
}

interface GeneratedMealRaw {
  name?: string;
  tags?: unknown;
  prepTimeMins?: unknown;
  cookTimeMins?: unknown;
  ingredients?: unknown;
  instructions?: unknown;
}

interface DraftProduct {
  id: string;
  name: string;
  brand?: string;
  sizeLabel?: string;
  store: string;
  productUrl: string | null;
  imageUrl?: string;
}

interface DraftIngredient {
  name: string;
  quantityNum?: number;
  unit?: string;
  quantity?: string;
  store: string;
  notes?: string;
  primaryProduct?: DraftProduct;
}

interface DraftMeal {
  name: string;
  tags: string[];
  prepTimeMins?: number;
  cookTimeMins?: number;
  instructions: string[];
  ingredients: DraftIngredient[];
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const formatQuantity = (amount: number, unit: string): string => {
  if (unit === "units" && Number.isInteger(amount)) return String(amount);
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded}${unit === "units" ? "" : unit}`;
};

const asPositiveNumber = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
};

const normalizeUnit = (unit: unknown): string | null => {
  if (typeof unit !== "string") return null;
  const u = unit.trim().toLowerCase();
  if (u === "kg") return "g";
  if (u === "l" || u === "liter" || u === "litre") return "ml";
  return ALLOWED_UNITS.has(u) ? u : null;
};

const parseGeneratedMeal = (raw: GeneratedMealRaw, store: string): DraftMeal => {
  const name = typeof raw.name === "string" && raw.name.trim()
    ? raw.name.trim()
    : "Untitled meal";

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim())
    : [];

  const ingredientsRaw = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const ingredients: DraftIngredient[] = [];
  for (const item of ingredientsRaw) {
    if (!item || typeof item !== "object") continue;
    const ing = item as GeneratedIngredient;
    if (typeof ing.name !== "string" || !ing.name.trim()) continue;
    const quantityNum =
      typeof ing.quantityNum === "number" && Number.isFinite(ing.quantityNum) &&
        ing.quantityNum > 0
        ? ing.quantityNum
        : undefined;
    const unit = normalizeUnit(ing.unit) ?? undefined;
    const quantity = quantityNum != null && unit
      ? formatQuantity(quantityNum, unit)
      : undefined;
    ingredients.push({
      name: ing.name.trim(),
      quantityNum,
      unit,
      quantity,
      store,
      notes: typeof ing.notes === "string" && ing.notes.trim() ? ing.notes.trim() : undefined,
    });
  }

  const instructions = Array.isArray(raw.instructions)
    ? raw.instructions
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())
    : [];

  return {
    name,
    tags,
    prepTimeMins: asPositiveNumber(raw.prepTimeMins),
    cookTimeMins: asPositiveNumber(raw.cookTimeMins),
    instructions,
    ingredients,
  };
};

const mealSystemPrompt = (store: string) =>
  `You are a meal planner for Joe's Keto, an Australian low-carb / keto home cooking app.
Create one practical keto-friendly meal based on the user's request.
Prefer Australian grocery ingredient names that match ${store} product search terms.
Do not include household / cleaning items. Only food ingredients.
Keep the ingredient list short (6–10 items max).
Use units from this set only: g, ml, units, tsp, tbsp, cup.
Return JSON only matching this schema:
{
  "name": "string",
  "tags": ["keto", "..."],
  "prepTimeMins": 15,
  "cookTimeMins": 20,
  "ingredients": [
    { "name": "chicken thigh", "quantityNum": 500, "unit": "g", "notes": "optional" }
  ],
  "instructions": ["Step 1...", "Step 2..."]
}`;

const mealModels = (): string[] => {
  const primary = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3.6-flash";
  const models = [primary, "gemini-3.5-flash"];
  if (primary !== GEMINI_FALLBACK_MODEL) models.push(GEMINI_FALLBACK_MODEL);
  if (primary !== GEMINI_DEFAULT_MODEL && GEMINI_DEFAULT_MODEL !== GEMINI_FALLBACK_MODEL) {
    models.push(GEMINI_DEFAULT_MODEL);
  }
  return [...new Set(models)];
};

const finalizeMealJson = (text: string, store: string): DraftMeal => {
  let parsed: GeneratedMealRaw;
  try {
    parsed = JSON.parse(text) as GeneratedMealRaw;
  } catch {
    const objMatch = String(text).match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("Could not parse meal JSON");
    parsed = JSON.parse(objMatch[0]) as GeneratedMealRaw;
  }

  const meal = parseGeneratedMeal(parsed, store);
  if (meal.ingredients.length === 0) {
    throw new Error("Model returned a meal with no ingredients");
  }
  if (meal.instructions.length === 0) {
    throw new Error("Model returned a meal with no instructions");
  }
  return meal;
};

const callGeminiMeal = async (
  prompt: string,
  store: string,
  model: string,
  log: LogFn,
): Promise<DraftMeal> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  log(`[generate-meal] calling Gemini model=${model}`, "info", { store, model });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(MEAL_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{
          parts: [{
            text:
              `${mealSystemPrompt(store)}\n\nUser request: ${prompt}\nPreferred store for shopping: ${store}`,
          }],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini request timed out or failed (${model}): ${msg}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    log(`[generate-meal] Gemini HTTP ${res.status}`, "error", {
      status: res.status,
      model,
      body_preview: errText.slice(0, 400),
    });
    throw new Error(`Gemini meal generation failed (${res.status}, model=${model})`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.find(
    (p: { text?: string }) => typeof p?.text === "string",
  )?.text;
  if (!text) throw new Error("Gemini returned an empty meal response");
  return finalizeMealJson(text, store);
};

const callClaudeMeal = async (
  prompt: string,
  store: string,
  log: LogFn,
): Promise<DraftMeal> => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Gemini quota exceeded and ANTHROPIC_API_KEY is not set — add it to .env for local Claude fallback",
    );
  }

  log(`[generate-meal] calling Claude meal fallback`, "info", { store });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(MEAL_FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content:
          `${mealSystemPrompt(store)}\n\nUser request: ${prompt}\nPreferred store for shopping: ${store}\n\nReturn ONLY the JSON object, no markdown.`,
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    log(`[generate-meal] Claude HTTP ${res.status}`, "error", {
      status: res.status,
      body_preview: errText.slice(0, 400),
    });
    throw new Error(`Claude meal generation failed (${res.status})`);
  }

  const data = await res.json();
  const textBlock = [...(data?.content ?? [])].reverse().find((b: { type?: string }) =>
    b.type === "text"
  );
  const text = (textBlock as { text?: string } | undefined)?.text;
  if (!text) throw new Error("Claude returned an empty meal response");
  return finalizeMealJson(text, store);
};

type MealProvider = "gemini" | "claude";

const generateMeal = async (
  prompt: string,
  store: string,
  log: LogFn,
): Promise<{ meal: DraftMeal; provider: MealProvider }> => {
  const models = mealModels();
  let lastError: Error | null = null;
  let geminiQuotaHit = false;

  for (const model of models) {
    try {
      const meal = await callGeminiMeal(prompt, store, model, log);
      return { meal, provider: "gemini" };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable = /404|503|429|UNAVAILABLE|timed out|high demand|quota/i.test(
        lastError.message,
      );
      if (/429|quota/i.test(lastError.message)) geminiQuotaHit = true;
      log(`[generate-meal] model=${model} failed: ${lastError.message}`, "warn", {
        model,
        retryable,
      });
      if (!retryable) throw lastError;
    }
  }

  log(`[generate-meal] Gemini unavailable — trying Claude`, "warn", { geminiQuotaHit });
  try {
    const meal = await callClaudeMeal(prompt, store, log);
    return { meal, provider: "claude" };
  } catch (err) {
    const claudeErr = err instanceof Error ? err : new Error(String(err));
    throw new Error(
      `${claudeErr.message}${lastError ? ` (Gemini: ${lastError.message})` : ""}`,
    );
  }
};

const hydrateOne = async (
  supabase: AnySupabaseClient,
  ing: DraftIngredient,
  store: string,
  log: LogFn,
  opts: { skipGemini: boolean; userId: string },
): Promise<DraftIngredient> => {
  try {
    const candidate = await collectCandidate(supabase, ing.name, store, log, {
      // Prefer Gemini when available; fall back to Claude when Gemini quota is out.
      skipClaude: !opts.skipGemini,
      skipGemini: opts.skipGemini,
      preferGemini: !opts.skipGemini,
      userId: opts.userId,
    });
    if (!candidate) return ing;
    const persisted = await persistCandidate(supabase, candidate, log, {
      userId: opts.userId,
    });
    if (!persisted?.id) return ing;
    return {
      ...ing,
      primaryProduct: {
        id: persisted.id,
        name: persisted.name,
        brand: persisted.brand ?? undefined,
        sizeLabel: persisted.size_label ?? undefined,
        store: persisted.store,
        productUrl: persisted.product_url,
        imageUrl: persisted.image_url ?? undefined,
      },
    };
  } catch (err) {
    log(
      `[generate-meal] product hydrate failed for "${ing.name}": ${
        err instanceof Error ? err.message : String(err)
      }`,
      "warn",
    );
    return ing;
  }
};

const hydrateProducts = async (
  supabase: AnySupabaseClient,
  meal: DraftMeal,
  store: string,
  log: LogFn,
  opts: { skipGemini: boolean; userId: string },
): Promise<DraftMeal> => {
  const ingredients = await Promise.all(
    meal.ingredients.map((ing) => hydrateOne(supabase, ing, store, log, opts)),
  );
  return { ...meal, ingredients };
};

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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { prompt?: unknown; store?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const store = typeof body.store === "string" ? body.store.trim() : "";
  if (!prompt) return jsonResponse({ error: "prompt is required" }, 400);
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
    const { meal: generated, provider } = await generateMeal(prompt, store, log);
    const meal = await hydrateProducts(serviceClient, generated, store, log, {
      skipGemini: provider === "claude",
      userId: userData.user.id,
    });
    return jsonResponse({ meal, provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[generate-meal] failed: ${message}`, "error");
    return jsonResponse({ error: message }, 500);
  }
});
