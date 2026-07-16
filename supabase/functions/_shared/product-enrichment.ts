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

export type PersistCandidateOptions = {
  /** When set, new products are owned by this user (not the shared catalog). */
  userId?: string;
};

const packSizesFromLabel = (
  sizeLabel: string | null,
): {
  pack_size_g: number | null;
  pack_size_ml: number | null;
  pack_size_units: number | null;
} => {
  const s = (sizeLabel ?? "").toLowerCase();
  const kg = s.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kg) {
    return { pack_size_g: Number(kg[1]) * 1000, pack_size_ml: null, pack_size_units: null };
  }
  const g = s.match(/(\d+(?:\.\d+)?)\s*g\b/);
  if (g) {
    return { pack_size_g: Number(g[1]), pack_size_ml: null, pack_size_units: null };
  }
  const liter = s.match(/(\d+(?:\.\d+)?)\s*l\b/);
  if (liter) {
    return {
      pack_size_g: null,
      pack_size_ml: Number(liter[1]) * 1000,
      pack_size_units: null,
    };
  }
  const ml = s.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) {
    return { pack_size_g: null, pack_size_ml: Number(ml[1]), pack_size_units: null };
  }
  const pack = s.match(/(\d+)\s*pack\b/);
  if (pack) {
    return { pack_size_g: null, pack_size_ml: null, pack_size_units: Number(pack[1]) };
  }
  // User-linked rows require at least one pack size.
  return { pack_size_g: null, pack_size_ml: null, pack_size_units: 1 };
};

export const lookupExistingProduct = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  options?: PersistCandidateOptions,
): Promise<StoreProductRow | null> => {
  const q = productName.trim();
  if (!q) return null;

  if (options?.userId) {
    const { data: own } = await supabase
      .from("store_products")
      .select("id, name, brand, size_label, store, product_url, image_url")
      .ilike("name", `%${q}%`)
      .eq("store", store)
      .eq("user_id", options.userId)
      .limit(1)
      .maybeSingle();
    if (own) return own as StoreProductRow;
  }

  const { data } = await supabase
    .from("store_products")
    .select("id, name, brand, size_label, store, product_url, image_url")
    .ilike("name", `%${q}%`)
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
  options?: CollectCandidateOptions & PersistCandidateOptions,
): Promise<Candidate | null> => {
  const cached = await lookupExistingProduct(supabase, productName, store, {
    userId: options?.userId,
  });
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
  options?: PersistCandidateOptions,
): Promise<Candidate | null> => {
  if (!candidate.isNew) return candidate;

  const pack = options?.userId
    ? packSizesFromLabel(candidate.size_label)
    : {
      pack_size_g: null as number | null,
      pack_size_ml: null as number | null,
      pack_size_units: null as number | null,
    };

  const { data, error } = await supabase
    .from("store_products")
    .insert({
      name: candidate.name,
      brand: candidate.brand ?? null,
      size_label: candidate.size_label ?? null,
      store: candidate.store,
      product_url: candidate.product_url ?? null,
      image_url: candidate.image_url ?? null,
      user_id: options?.userId ?? null,
      pack_size_g: pack.pack_size_g,
      pack_size_ml: pack.pack_size_ml,
      pack_size_units: pack.pack_size_units,
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
        user_id: options?.userId ?? null,
        error,
      },
    );
    return null;
  }

  const insertedId = (data as { id: string }).id;
  log(
    `[persist] store_products inserted id=${insertedId} name="${candidate.name}" store=${candidate.store}${
      options?.userId ? " (user-owned)" : " (global)"
    }`,
    "info",
    {
      store: candidate.store,
      product_name: candidate.name,
      store_product_id: insertedId,
      user_id: options?.userId ?? null,
    },
  );
  return { ...candidate, id: insertedId, isNew: false };
};

/** Parse a JSON array (or `{ products: [...] }`) of store product matches. */
export const parseEnrichmentListPayload = (
  text: string,
  productName: string,
  store: string,
): GeminiProduct[] => {
  let jsonStr = String(text);
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  } else {
    const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (arrMatch) jsonStr = arrMatch[0];
    else if (objMatch) jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim()) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" &&
          Array.isArray((parsed as { products?: unknown }).products))
      ? (parsed as { products: unknown[] }).products
      : [];

    const out: GeminiProduct[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" && r.name.trim()
        ? r.name.trim()
        : null;
      if (!name) continue;
      out.push({
        name,
        brand: typeof r.brand === "string" && r.brand.trim()
          ? r.brand.trim()
          : null,
        price: typeof r.price === "number" ? r.price : null,
        unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : null,
        url: typeof r.url === "string" && r.url.trim() ? r.url.trim() : null,
        image_url: typeof r.image_url === "string" && r.image_url.trim()
          ? r.image_url.trim()
          : null,
        category: typeof r.category === "string" && r.category.trim()
          ? r.category.trim()
          : null,
        store,
        enriched: true,
      });
    }
    return out;
  } catch {
    const single = parseEnrichmentPayload(text, productName, store);
    return single?.enriched ? [single] : [];
  }
};

export const lookupExistingProducts = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  limit = 8,
  options?: PersistCandidateOptions,
): Promise<StoreProductRow[]> => {
  const q = productName.trim();
  if (!q) return [];

  const out: StoreProductRow[] = [];
  const seen = new Set<string>();

  if (options?.userId) {
    const { data: own } = await supabase
      .from("store_products")
      .select("id, name, brand, size_label, store, product_url, image_url")
      .ilike("name", `%${q}%`)
      .eq("store", store)
      .eq("user_id", options.userId)
      .limit(limit);
    for (const row of (own as StoreProductRow[] | null) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }

  if (out.length < limit) {
    const { data } = await supabase
      .from("store_products")
      .select("id, name, brand, size_label, store, product_url, image_url")
      .ilike("name", `%${q}%`)
      .eq("store", store)
      .is("user_id", null)
      .limit(limit - out.length);
    for (const row of (data as StoreProductRow[] | null) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }

  return out;
};

const candidateKey = (c: {
  name: string;
  brand?: string | null;
  product_url?: string | null;
}): string => {
  if (c.product_url) return `url:${c.product_url.trim().toLowerCase()}`;
  return `name:${(c.brand ?? "").trim().toLowerCase()}|${c.name.trim().toLowerCase()}`;
};

const multiSearchPrompt = (productName: string, store: string) =>
  `Find 3 to 6 real product listings on ${store} Australia that match the grocery ingredient "${productName}".
Prefer common pack sizes a home cook would buy. Diversify brands/sizes when possible.
Return ONLY a JSON array (no markdown, no backticks, no explanation) of objects:
[
  {
    "name": "full product name as listed",
    "brand": "brand name or null",
    "price": 3.50,
    "unit": "pack size or weight e.g. 500g, 6 pack",
    "url": "direct product URL on ${store.toLowerCase()}.com.au if known, otherwise null",
    "image_url": "product image URL or null",
    "category": "e.g. Dairy, Bakery, Pantry, Household"
  }
]`;

export const searchProductsWithClaude = async (
  productName: string,
  store: string,
  log: LogFn,
): Promise<GeminiProduct[]> => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    log(`[claude-multi] ${store} NO API KEY`, "warn", { store, product_name: productName });
    return [];
  }

  log(`[claude-multi] ${store} calling API for "${productName}"`, "info", {
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
      max_tokens: 2048,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{
        role: "user",
        content:
          `Use the web_search tool to search for: ${productName} site:${store.toLowerCase()}.com.au\n\n${multiSearchPrompt(productName, store)}`,
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    log(
      `[claude-multi] ${store} HTTP ${res.status}: ${errText.slice(0, 300)}`,
      "error",
      { store, product_name: productName, status: res.status },
    );
    return [];
  }

  const data = await res.json();
  const textBlock = [...(data?.content ?? [])].reverse().find((b: { type?: string }) =>
    b.type === "text"
  );
  const text = (textBlock as { text?: string } | undefined)?.text ?? "[]";
  return parseEnrichmentListPayload(String(text), productName, store);
};

export const searchProductsWithGemini = async (
  productName: string,
  store: string,
  log: LogFn,
  options?: { timeoutMs?: number },
): Promise<GeminiProduct[]> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    log(`[gemini-multi] ${store} NO API KEY`, "debug", { store, product_name: productName });
    return [];
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || GEMINI_DEFAULT_MODEL;
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const timeoutMs = options?.timeoutMs ?? 30_000;

  log(`[gemini-multi] ${store} calling API for "${productName}" (model=${model})`, "info", {
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
        contents: [{ parts: [{ text: multiSearchPrompt(productName, store) }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (err) {
    log(
      `[gemini-multi] ${store} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      "error",
      { store, product_name: productName },
    );
    return [];
  }

  if (!res.ok) {
    const errText = await res.text();
    log(
      `[gemini-multi] ${store} HTTP ${res.status}: ${errText.slice(0, 300)}`,
      "error",
      { store, product_name: productName, status: res.status },
    );
    return [];
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.find(
    (p: { text?: string }) => typeof p?.text === "string",
  )?.text ?? "[]";
  return parseEnrichmentListPayload(String(text), productName, store);
};

export type CollectCandidatesOptions = CollectCandidateOptions & PersistCandidateOptions & {
  /** Max products to return after merge + persist. */
  limit?: number;
};

/** Find several catalog + AI product matches for an ingredient at a store. */
export const collectCandidates = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  log: LogFn,
  options?: CollectCandidatesOptions,
): Promise<Candidate[]> => {
  const limit = options?.limit ?? 6;
  const cached = await lookupExistingProducts(
    supabase,
    productName,
    store,
    limit,
    { userId: options?.userId },
  );
  const byKey = new Map<string, Candidate>();

  for (const row of cached) {
    const c: Candidate = { ...row, price: null, category: null, isNew: false };
    byKey.set(candidateKey(c), c);
  }

  log(
    `[collect-multi] ${store}: ${cached.length} cache hit(s) for "${productName}"`,
    "info",
    { store, product_name: productName, cache_count: cached.length },
  );

  let aiProducts: GeminiProduct[] = [];
  const tryGemini = async () => {
    if (options?.skipGemini) return;
    aiProducts = await searchProductsWithGemini(productName, store, log, {
      timeoutMs: 25_000,
    });
  };
  const tryClaude = async () => {
    if (options?.skipClaude) return;
    aiProducts = await searchProductsWithClaude(productName, store, log);
  };

  if (options?.preferGemini || options?.skipClaude) {
    await tryGemini();
    if (aiProducts.length === 0) await tryClaude();
  } else {
    await tryClaude();
    if (aiProducts.length === 0) await tryGemini();
  }

  for (const p of aiProducts) {
    if (!p.enriched) continue;
    const c: Candidate = {
      id: "",
      name: p.name,
      brand: p.brand,
      size_label: p.unit,
      store: p.store,
      product_url: p.url,
      image_url: p.image_url,
      price: p.price,
      category: p.category,
      isNew: true,
    };
    const key = candidateKey(c);
    if (!byKey.has(key)) byKey.set(key, c);
  }

  const merged = [...byKey.values()].slice(0, limit);
  const persisted: Candidate[] = [];
  for (const c of merged) {
    const saved = await persistCandidate(supabase, c, log, {
      userId: options?.userId,
    });
    if (saved?.id) persisted.push(saved);
  }

  log(
    `[collect-multi] ${store}: returning ${persisted.length} product(s) for "${productName}"`,
    "info",
    { store, product_name: productName, count: persisted.length },
  );
  return persisted;
};
