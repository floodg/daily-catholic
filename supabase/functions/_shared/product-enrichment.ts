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

export const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
export const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash-lite";

const STORE_DOMAINS: Record<string, string> = {
  Coles: "coles.com.au",
  Woolworths: "woolworths.com.au",
  Aldi: "aldi.com.au",
  IGA: "iga.com.au",
};

const NON_FOOD_TERMS = [
  "body lotion",
  "lotion",
  "moisturiser",
  "moisturizer",
  "skin care",
  "skincare",
  "body wash",
  "shampoo",
  "conditioner",
  "soap",
  "deodorant",
  "cleaner",
  "cleaning",
  "detergent",
  "dishwashing",
  "laundry",
  "toilet",
  "bathroom",
  "cosmetic",
  "makeup",
  "beauty",
  "sunscreen",
  "hand cream",
  "face cream",
  "pet food",
  "dog food",
  "cat food",
];

const STOP_WORDS = new Set([
  "fresh",
  "organic",
  "natural",
  "australian",
  "australia",
  "coles",
  "woolworths",
  "aldi",
  "iga",
  "the",
  "and",
]);

const normalize = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const ingredientTokens = (value: string): string[] => normalize(value)
  .split(/\s+/)
  .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

const isLikelyFoodName = (name: string, category?: string | null): boolean => {
  const haystack = `${normalize(name)} ${normalize(category ?? "")}`;
  return !NON_FOOD_TERMS.some((term) => haystack.includes(normalize(term)));
};

const storeUrlMatches = (url: string | null, store: string): boolean => {
  if (!url) return false;
  const expected = STORE_DOMAINS[store];
  if (!expected) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === expected || host.endsWith(`.${expected}`);
  } catch {
    return false;
  }
};

const scoreProductMatch = (
  ingredient: string,
  productName: string,
  category?: string | null,
): number => {
  if (!isLikelyFoodName(productName, category)) return -1000;

  const ingredientNorm = normalize(ingredient);
  const productNorm = normalize(productName);
  const tokens = ingredientTokens(ingredient);
  if (!ingredientNorm || !productNorm || tokens.length === 0) return -1000;

  let score = 0;
  if (productNorm === ingredientNorm) score += 120;
  if (productNorm.startsWith(`${ingredientNorm} `)) score += 80;
  if (productNorm.includes(ingredientNorm)) score += 60;

  const matchedTokens = tokens.filter((t) => productNorm.includes(t));
  score += matchedTokens.length * 25;
  if (matchedTokens.length === tokens.length) score += 40;
  if (matchedTokens.length === 0) return -1000;

  // Prefer concise grocery product names over unrelated products that merely contain one token.
  const extraWordPenalty = Math.max(0, productNorm.split(/\s+/).length - tokens.length - 4);
  score -= extraWordPenalty * 3;
  return score;
};

const pickBestExisting = (
  rows: StoreProductRow[],
  productName: string,
): StoreProductRow | null => {
  const ranked = rows
    .map((row) => ({ row, score: scoreProductMatch(productName, row.name) }))
    .filter((x) => x.score >= 50)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.row ?? null;
};

const rankExisting = (
  rows: StoreProductRow[],
  productName: string,
): StoreProductRow[] => rows
  .map((row) => ({ row, score: scoreProductMatch(productName, row.name) }))
  .filter((x) => x.score >= 50)
  .sort((a, b) => b.score - a.score)
  .map((x) => x.row);

export const parseEnrichmentPayload = (
  text: string,
  productName: string,
  store: string,
): GeminiProduct | null => {
  let jsonStr = String(text);
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1];
  else {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim()) as Record<string, unknown>;
    const result: GeminiProduct = {
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
    if (!isLikelyFoodName(result.name, result.category)) return null;
    if (scoreProductMatch(productName, result.name, result.category) < 50) return null;
    if (store !== "Other" && !storeUrlMatches(result.url, store)) return null;
    return result;
  } catch {
    return null;
  }
};

export type PersistCandidateOptions = { userId?: string };

const packSizesFromLabel = (sizeLabel: string | null) => {
  const s = (sizeLabel ?? "").toLowerCase();
  const kg = s.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kg) return { pack_size_g: Number(kg[1]) * 1000, pack_size_ml: null, pack_size_units: null };
  const g = s.match(/(\d+(?:\.\d+)?)\s*g\b/);
  if (g) return { pack_size_g: Number(g[1]), pack_size_ml: null, pack_size_units: null };
  const liter = s.match(/(\d+(?:\.\d+)?)\s*l\b/);
  if (liter) return { pack_size_g: null, pack_size_ml: Number(liter[1]) * 1000, pack_size_units: null };
  const ml = s.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) return { pack_size_g: null, pack_size_ml: Number(ml[1]), pack_size_units: null };
  const pack = s.match(/(\d+)\s*pack\b/);
  if (pack) return { pack_size_g: null, pack_size_ml: null, pack_size_units: Number(pack[1]) };
  return { pack_size_g: null, pack_size_ml: null, pack_size_units: 1 };
};

const queryExistingRows = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  userId?: string,
  limit = 30,
): Promise<StoreProductRow[]> => {
  const tokens = ingredientTokens(productName);
  const searchTerm = [...tokens].sort((a, b) => b.length - a.length)[0] ?? productName.trim();
  if (!searchTerm) return [];

  let query = supabase
    .from("store_products")
    .select("id, name, brand, size_label, store, product_url, image_url")
    .ilike("name", `%${searchTerm}%`)
    .eq("store", store)
    .limit(limit);

  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  const { data } = await query;
  return (data as StoreProductRow[] | null) ?? [];
};

export const lookupExistingProduct = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  options?: PersistCandidateOptions,
): Promise<StoreProductRow | null> => {
  if (options?.userId) {
    const own = await queryExistingRows(supabase, productName, store, options.userId);
    const bestOwn = pickBestExisting(own, productName);
    if (bestOwn) return bestOwn;
  }
  const shared = await queryExistingRows(supabase, productName, store);
  return pickBestExisting(shared, productName);
};

const emptyProduct = (productName: string, store: string): GeminiProduct => ({
  name: productName,
  brand: null,
  price: null,
  unit: null,
  url: null,
  image_url: null,
  category: null,
  store,
  enriched: false,
});

const storeSitePrompt = (productName: string, store: string, count: number) => {
  const domain = STORE_DOMAINS[store];
  const source = domain ? `ONLY ${domain}` : `the official ${store} website`;
  return `Search ${source} for the grocery ingredient "${productName}".
Use only real grocery/food product pages from that store. Do not return cosmetics, body care, cleaning, household, pet or non-food products even if their name contains the ingredient word.
The direct product URL MUST be on ${source}. If you cannot verify a real matching store product page, return an empty array.
Return up to ${count} best matching grocery products as JSON only:
[
  {
    "name": "full product name exactly as listed by the store",
    "brand": "brand or null",
    "price": 3.5,
    "unit": "pack size e.g. 250g",
    "url": "direct product URL on the selected store domain",
    "image_url": "image URL or null",
    "category": "grocery category"
  }
]`;
};

export const searchProductsWithClaude = async (
  productName: string,
  store: string,
  log: LogFn,
): Promise<GeminiProduct[]> => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    log(`[claude-store] ${store} NO API KEY`, "warn", { store, product_name: productName });
    return [];
  }

  const domain = STORE_DOMAINS[store];
  const searchQuery = domain ? `${productName} site:${domain}` : `${productName} ${store} Australia`;
  log(`[claude-store] searching official ${store} site for "${productName}"`, "info", {
    store,
    product_name: productName,
    domain: domain ?? null,
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
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{
        role: "user",
        content: `Use web_search for exactly this store-restricted search: ${searchQuery}\n\n${storeSitePrompt(productName, store, 6)}`,
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    log(`[claude-store] ${store} HTTP ${res.status}: ${body.slice(0, 300)}`, "error", {
      store,
      product_name: productName,
      status: res.status,
    });
    return [];
  }

  const data = await res.json();
  const textBlock = [...(data?.content ?? [])].reverse().find((b: { type?: string }) => b.type === "text");
  const text = (textBlock as { text?: string } | undefined)?.text ?? "[]";
  return parseEnrichmentListPayload(String(text), productName, store);
};

export const enrichWithClaude = async (
  productName: string,
  store: string,
  log: LogFn,
): Promise<GeminiProduct> => {
  const products = await searchProductsWithClaude(productName, store, log);
  return products[0] ?? emptyProduct(productName, store);
};

// Retained for compatibility, but store product retrieval now uses the store site as source of truth.
export const enrichWithGemini = async (
  productName: string,
  store: string,
  log: LogFn,
  _options?: { timeoutMs?: number },
): Promise<GeminiProduct> => {
  log(`[gemini-store] skipped for "${productName}"; official store-site lookup is required`, "debug", {
    store,
    product_name: productName,
  });
  return emptyProduct(productName, store);
};

export const searchProductsWithGemini = async (
  productName: string,
  store: string,
  log: LogFn,
  _options?: { timeoutMs?: number },
): Promise<GeminiProduct[]> => {
  log(`[gemini-store] skipped multi-search for "${productName}"; official store-site lookup is required`, "debug", {
    store,
    product_name: productName,
  });
  return [];
};

export type CollectCandidateOptions = {
  skipClaude?: boolean;
  skipGemini?: boolean;
  preferGemini?: boolean;
};

export const collectCandidate = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  log: LogFn,
  options?: CollectCandidateOptions & PersistCandidateOptions,
): Promise<Candidate | null> => {
  // 1. Database catalog first.
  const cached = await lookupExistingProduct(supabase, productName, store, { userId: options?.userId });
  if (cached) {
    log(`[collect] ${store}: ranked catalog hit id=${cached.id} name="${cached.name}"`, "info", {
      store,
      product_name: productName,
      store_product_id: cached.id,
    });
    return { ...cached, price: null, category: null, isNew: false };
  }

  // 2. No good catalog match: retrieve from the official store site.
  if (options?.skipClaude) return null;
  const enriched = await enrichWithClaude(productName, store, log);
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
  if (!isLikelyFoodName(candidate.name, candidate.category)) return null;
  if (candidate.store !== "Other" && !storeUrlMatches(candidate.product_url, candidate.store)) return null;

  const pack = options?.userId
    ? packSizesFromLabel(candidate.size_label)
    : { pack_size_g: null, pack_size_ml: null, pack_size_units: null };

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
    log(`[persist] store_products insert FAILED for "${candidate.name}"`, "error", {
      store: candidate.store,
      product_name: candidate.name,
      user_id: options?.userId ?? null,
      error,
    });
    return null;
  }

  return { ...candidate, id: (data as { id: string }).id, isNew: false };
};

export const parseEnrichmentListPayload = (
  text: string,
  productName: string,
  store: string,
): GeminiProduct[] => {
  let jsonStr = String(text);
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1];
  else {
    const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (arrMatch) jsonStr = arrMatch[0];
    else if (objMatch) jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim()) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products)
      ? (parsed as { products: unknown[] }).products
      : [];

    return rows
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map((r) => ({
        name: typeof r.name === "string" ? r.name.trim() : "",
        brand: typeof r.brand === "string" && r.brand.trim() ? r.brand.trim() : null,
        price: typeof r.price === "number" ? r.price : null,
        unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim() : null,
        url: typeof r.url === "string" && r.url.trim() ? r.url.trim() : null,
        image_url: typeof r.image_url === "string" && r.image_url.trim() ? r.image_url.trim() : null,
        category: typeof r.category === "string" && r.category.trim() ? r.category.trim() : null,
        store,
        enriched: true,
      } as GeminiProduct))
      .filter((p) => p.name.length > 0)
      .filter((p) => isLikelyFoodName(p.name, p.category))
      .filter((p) => scoreProductMatch(productName, p.name, p.category) >= 50)
      .filter((p) => store === "Other" || storeUrlMatches(p.url, store))
      .sort((a, b) => scoreProductMatch(productName, b.name, b.category) - scoreProductMatch(productName, a.name, a.category));
  } catch {
    const single = parseEnrichmentPayload(text, productName, store);
    return single ? [single] : [];
  }
};

export const lookupExistingProducts = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  limit = 8,
  options?: PersistCandidateOptions,
): Promise<StoreProductRow[]> => {
  const out: StoreProductRow[] = [];
  const seen = new Set<string>();

  if (options?.userId) {
    for (const row of rankExisting(await queryExistingRows(supabase, productName, store, options.userId), productName)) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        out.push(row);
      }
      if (out.length >= limit) return out;
    }
  }

  for (const row of rankExisting(await queryExistingRows(supabase, productName, store), productName)) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      out.push(row);
    }
    if (out.length >= limit) break;
  }
  return out;
};

const candidateKey = (c: { name: string; brand?: string | null; product_url?: string | null }): string => {
  if (c.product_url) return `url:${c.product_url.trim().toLowerCase()}`;
  return `name:${(c.brand ?? "").trim().toLowerCase()}|${c.name.trim().toLowerCase()}`;
};

export type CollectCandidatesOptions = CollectCandidateOptions & PersistCandidateOptions & { limit?: number };

export const collectCandidates = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  log: LogFn,
  options?: CollectCandidatesOptions,
): Promise<Candidate[]> => {
  const limit = options?.limit ?? 6;
  const cached = await lookupExistingProducts(supabase, productName, store, limit, { userId: options?.userId });
  const byKey = new Map<string, Candidate>();

  for (const row of cached) {
    const c: Candidate = { ...row, price: null, category: null, isNew: false };
    byKey.set(candidateKey(c), c);
  }

  log(`[collect-multi] ${store}: ${cached.length} ranked catalog hit(s) for "${productName}"`, "info", {
    store,
    product_name: productName,
    cache_count: cached.length,
  });

  // Only go to the store site when the catalog cannot fill the requested result set.
  if (byKey.size < limit && !options?.skipClaude) {
    const storeProducts = await searchProductsWithClaude(productName, store, log);
    for (const p of storeProducts) {
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
      if (byKey.size >= limit) break;
    }
  }

  const merged = [...byKey.values()]
    .sort((a, b) => scoreProductMatch(productName, b.name, b.category) - scoreProductMatch(productName, a.name, a.category))
    .slice(0, limit);

  const persisted: Candidate[] = [];
  for (const c of merged) {
    const saved = await persistCandidate(supabase, c, log, { userId: options?.userId });
    if (saved?.id) persisted.push(saved);
  }
  return persisted;
};
