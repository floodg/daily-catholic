import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
export type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface GeminiProduct {
  name: string;
  brand: string | null;
  price: number | null;
  unit: string | null;
  url: string | null;
  image_url: string | null;
  category: string | null;
  store: string;
  enriched: boolean;
}

export interface StoreProductRow {
  id: string;
  name: string;
  brand: string | null;
  size_label: string | null;
  store: string;
  product_url: string | null;
  image_url: string | null;
}

export interface Candidate extends StoreProductRow {
  price: number | null;
  category: string | null;
  isNew: boolean;
}

export type LogFn = (
  msg: string,
  level?: "debug" | "info" | "warn" | "error",
  context?: Record<string, unknown> | null,
) => void;

/** Stable default — preview models often 503 under load. Override with GEMINI_MODEL. */
export const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
export const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash-lite";

/** Best-effort extraction when LLM JSON is truncated or wrapped in prose. */
export const parseEnrichmentPayload = (
  text: string,
  productName: string,
  store: string,
): GeminiProduct | null => {
  let jsonStr = String(text);
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  } else {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());
    return {
      name: String(parsed.name ?? productName).trim(),
      brand: parsed.brand ? String(parsed.brand).trim() : null,
      price: typeof parsed.price === "number" ? parsed.price : null,
      unit: parsed.unit ? String(parsed.unit).trim() : null,
      url: parsed.url ? String(parsed.url).trim() : null,
      image_url: parsed.image_url ? String(parsed.image_url).trim() : null,
      category: parsed.category ? String(parsed.category).trim() : null,
      store,
      enriched: true,
    };
  } catch {
    const pick = (key: string): string | null => {
      const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
      return m ? m[1].replace(/\\"/g, '"').trim() : null;
    };
    const name = pick("name");
    if (!name) return null;
    const priceRaw = jsonStr.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
    return {
      name,
      brand: pick("brand"),
      price: priceRaw ? Number(priceRaw[1]) : null,
      unit: pick("unit"),
      url: pick("url"),
      image_url: pick("image_url"),
      category: pick("category"),
      store,
      enriched: true,
    };
  }
};

export const lookupExistingProduct = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
): Promise<StoreProductRow | null> => {
  const { data } = await supabase
    .from("store_products")
    .select("id, name, brand, size_label, store, product_url, image_url")
    .ilike("name", `%${productName.trim()}%`)
    .eq("store", store)
    .is("user_id", null)
    .limit(1)
    .maybeSingle();
  return (data as StoreProductRow | null) ?? null;
};

export const enrichWithClaude = async (
  productName: string,
  store: string,
  log: LogFn,
): Promise<GeminiProduct> => {
  const fallback: GeminiProduct = {
    name: productName,
    brand: null,
    price: null,
    unit: null,
    url: null,
    image_url: null,
    category: null,
    store,
    enriched: false,
  };

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    log(`[claude] ${store} NO API KEY`, "warn", { store, product_name: productName });
    return fallback;
  }
  log(`[claude] ${store} calling API for "${productName}"`, "info", {
    store,
    product_name: productName,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{
        role: "user",
        content: `Use the web_search tool to search for: ${productName} site:${store.toLowerCase()}.com.au

Find the best matching product listing on ${store} Australia and return ONLY a JSON object with no markdown, no backticks, no explanation:
{
  "name": "full product name as listed",
  "brand": "brand name or null",
  "price": 3.50,
  "unit": "pack size or weight e.g. 500g, 6 pack",
  "url": "direct product URL on ${store.toLowerCase()}.com.au",
  "image_url": "product image URL or null",
  "category": "e.g. Cleaning, Household, Dairy, Bakery, Pantry"
}`,
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    log(
      `[claude] ${store} HTTP ${res.status}: ${errText.slice(0, 300)}`,
      "error",
      {
        store,
        product_name: productName,
        status: res.status,
        body_preview: errText.slice(0, 300),
      },
    );
    return fallback;
  }

  const data = await res.json();
  const textBlock = [...(data?.content ?? [])].reverse().find((b: { type?: string }) =>
    b.type === "text"
  );
  const text = (textBlock as { text?: string } | undefined)?.text ?? "{}";
  log(`[claude] ${store} raw text: ${String(text).slice(0, 300)}`, "debug", {
    store,
    product_name: productName,
  });

  const parsed = parseEnrichmentPayload(String(text), productName, store);
  if (parsed) return parsed;

  log(`[claude] ${store} could not extract product JSON`, "error", {
    store,
    product_name: productName,
    raw_preview: String(text).slice(0, 300),
  });
  return fallback;
};

export const enrichWithGemini = async (
  productName: string,
  store: string,
  log: LogFn,
  options?: { timeoutMs?: number },
): Promise<GeminiProduct> => {
  const fallback: GeminiProduct = {
    name: productName,
    brand: null,
    price: null,
    unit: null,
    url: null,
    image_url: null,
    category: null,
    store,
    enriched: false,
  };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    log(`[gemini] ${store} NO API KEY`, "debug", { store, product_name: productName });
    return fallback;
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || GEMINI_DEFAULT_MODEL;
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const timeoutMs = options?.timeoutMs ?? 25_000;

  log(`[gemini] ${store} calling API for "${productName}" (model=${model})`, "info", {
    store,
    product_name: productName,
    model,
  });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{
          parts: [{
            text:
              `Search the web (from your training + browsing capabilities if available) for a product listing on ${store} Australia matching: ${productName}.

Return ONLY a JSON object (no markdown/backticks/explanations) in this exact shape:
{
  "name": "full product name as listed",
  "brand": "brand name or null",
  "price": 3.50,
  "unit": "pack size or weight e.g. 500g, 6 pack",
  "url": "direct product URL on the store website if found, otherwise null",
  "image_url": "product image URL or null",
  "category": "e.g. Cleaning, Household, Dairy, Bakery, Pantry"
}`,
          }],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (err) {
    log(`[gemini] ${store} fetch failed: ${err instanceof Error ? err.message : String(err)}`, "error", {
      store,
      product_name: productName,
    });
    return fallback;
  }

  if (!res.ok) {
    const errText = await res.text();
    log(
      `[gemini] ${store} HTTP ${res.status}: ${errText.slice(0, 300)}`,
      "error",
      {
        store,
        product_name: productName,
        status: res.status,
        body_preview: errText.slice(0, 300),
      },
    );
    return fallback;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.find(
    (p: { text?: string }) => typeof p?.text === "string",
  )?.text ?? "{}";
  log(`[gemini] ${store} raw text: ${String(text).slice(0, 300)}`, "debug", {
    store,
    product_name: productName,
  });

  const parsed = parseEnrichmentPayload(String(text), productName, store);
  if (parsed) return parsed;

  log(`[gemini] ${store} could not extract product JSON`, "error", {
    store,
    product_name: productName,
    raw_preview: String(text).slice(0, 300),
  });
  return fallback;
};

export type CollectCandidateOptions = {
  /** Skip Claude (web_search) — faster for interactive flows. */
  skipClaude?: boolean;
  /** Skip Gemini (e.g. when quota is exhausted). */
  skipGemini?: boolean;
  /** Try Gemini before Claude. */
  preferGemini?: boolean;
};

export const collectCandidate = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  log: LogFn,
  options?: CollectCandidateOptions,
): Promise<Candidate | null> => {
  const cached = await lookupExistingProduct(supabase, productName, store);
  if (cached) {
    log(
      `[collect] ${store}: cache hit id=${cached.id} name="${cached.name}"`,
      "info",
      { store, product_name: productName, store_product_id: cached.id },
    );
    return { ...cached, price: null, category: null, isNew: false };
  }

  let enriched: GeminiProduct = {
    name: productName,
    brand: null,
    price: null,
    unit: null,
    url: null,
    image_url: null,
    category: null,
    store,
    enriched: false,
  };

  const tryClaude = async () => {
    if (options?.skipClaude) return;
    enriched = await enrichWithClaude(productName, store, log);
  };
  const tryGemini = async () => {
    if (options?.skipGemini) return;
    const gemini = await enrichWithGemini(productName, store, log, { timeoutMs: 20_000 });
    if (gemini.enriched) enriched = gemini;
  };

  if (options?.preferGemini || options?.skipClaude) {
    await tryGemini();
    if (!enriched.enriched) await tryClaude();
  } else {
    await tryClaude();
    if (!enriched.enriched) await tryGemini();
  }
  if (!enriched.enriched) return null;

  return {
    id: "",
    name: enriched.name,
    brand: enriched.brand,
    size_label: enriched.unit,
    store: enriched.store,
    product_url: enriched.url,
    image_url: enriched.image_url,
    price: enriched.price,
    category: enriched.category,
    isNew: true,
  };
};

export const persistCandidate = async (
  supabase: AnySupabaseClient,
  candidate: Candidate,
  log: LogFn,
): Promise<Candidate | null> => {
  if (!candidate.isNew) return candidate;

  const { data, error } = await supabase
    .from("store_products")
    .insert({
      name: candidate.name,
      brand: candidate.brand ?? null,
      size_label: candidate.size_label ?? null,
      store: candidate.store,
      product_url: candidate.product_url ?? null,
      image_url: candidate.image_url ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    log(
      `[persist] store_products insert FAILED for "${candidate.name}" (${candidate.store}): ${
        JSON.stringify(error)
      }`,
      "error",
      {
        store: candidate.store,
        product_name: candidate.name,
        table: "store_products",
        error,
      },
    );
    return null;
  }

  const insertedId = (data as { id: string }).id;
  log(
    `[persist] store_products inserted id=${insertedId} name="${candidate.name}" store=${candidate.store}`,
    "info",
    {
      store: candidate.store,
      product_name: candidate.name,
      store_product_id: insertedId,
    },
  );
  return { ...candidate, id: insertedId, isNew: false };
};
