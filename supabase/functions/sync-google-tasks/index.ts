import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// `ReturnType<typeof createClient>` collapses the schema/row generics to `never`
// in recent supabase-js versions, which propagates as "never" row types to every
// `.insert()` / `.update()` call. Using the loose client type matches what the
// actual `createClient(url, key)` call returns at runtime.
// deno-lint-ignore no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// Store priority used only for default product selection — not for task list discovery.
// Task lists are discovered dynamically from Google Tasks (any list name works).
const STORE_PRIORITY = ["Coles", "Woolworths", "Aldi"];
const COLES_BRAND_PATTERN = /^coles\b/i;
const DEFAULT_STORE_NAME_MAP: Record<string, string> = {
  coles: "Coles",
  woolworths: "Woolworths",
  woolies: "Woolworths",
  aldi: "Aldi",
  iga: "IGA",
};

/** Store used when a task title has no " from [store]" suffix. */
const DEFAULT_TASK_STORE = "Coles";

// --- Types ---

interface GeminiProduct {
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

interface StoreProductRow {
  id: string;
  name: string;
  brand: string | null;
  size_label: string | null;
  store: string;
  product_url: string | null;
  image_url: string | null;
}

interface Candidate extends StoreProductRow {
  price: number | null;
  category: string | null;
  isNew: boolean;
}

// --- Auth ---

const getAccessToken = async (): Promise<string> => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get Google access token: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
};

// --- Google Tasks ---

// Returns all task lists as Map<listName, listId>
const getAllTaskLists = async (token: string): Promise<Map<string, string>> => {
  const res = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return new Map();
  const data = await res.json();
  const map = new Map<string, string>();
  for (const list of data.items ?? []) {
    if (list.title && list.id) map.set(list.title, list.id);
  }
  return map;
};

/** Completed Google Tasks older than this are deleted during sync. */
const COMPLETED_TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const getTasks = async (
  token: string,
  listId: string,
  showCompleted = false
): Promise<any[]> => {
  const tasks: any[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      showCompleted: String(showCompleted),
      showHidden: "true",
      maxResults: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) break;

    const data = await res.json();
    tasks.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return tasks;
};

/** Remove completed (Done) Google Tasks that are older than one week. */
const purgeOldCompletedTasks = async (
  token: string,
  listId: string,
  store: string,
  log: LogFn
): Promise<number> => {
  const cutoff = Date.now() - COMPLETED_TASK_RETENTION_MS;
  const tasks = await getTasks(token, listId, true);
  let purged = 0;

  for (const task of tasks) {
    if (task?.status !== "completed" || !task?.id) continue;

    const completedAt = task.completed ? Date.parse(task.completed) : NaN;
    if (!Number.isFinite(completedAt) || completedAt > cutoff) continue;

    await deleteTask(token, listId, task.id);
    purged++;
    log(
      `[purge] ${store}: deleted completed task "${task.title ?? ""}" (completed ${task.completed})`,
      "info",
      { store, task_id: task.id, title: task.title, completed: task.completed }
    );
  }

  return purged;
};

const buildStoreAliasMap = (log: LogFn): Record<string, string> => {
  const configured = Deno.env.get("STORE_LIST_ALIASES_JSON");
  if (!configured) return DEFAULT_STORE_NAME_MAP;

  try {
    const parsed = JSON.parse(configured) as Record<string, unknown>;
    const aliases: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = rawKey.trim().toLowerCase();
      const value = typeof rawValue === "string" ? rawValue.trim() : "";
      if (!key || !value) continue;
      aliases[key] = value;
    }
    return { ...DEFAULT_STORE_NAME_MAP, ...aliases };
  } catch (error) {
    log(
      `[sync] Invalid STORE_LIST_ALIASES_JSON; using defaults: ${String(error)}`,
      "warn",
      { error: String(error) }
    );
    return DEFAULT_STORE_NAME_MAP;
  }
};

const normalizeStoreName = (listTitle: string, storeNameMap: Record<string, string>): string => {
  const trimmed = listTitle.trim();
  if (!trimmed) return listTitle;
  const mapped = storeNameMap[trimmed.toLowerCase()];
  return mapped ?? trimmed;
};

/** Matches task titles like "Almond meal from Coles" or "Drill bits from Bunnings". */
const FROM_STORE_PATTERN = /\s+from\s+(.+)$/i;

interface ParsedTask {
  productNames: string[];
  store: string;
  storeFromTitle: boolean;
}

/**
 * Split the product portion of a task into one or more item names.
 * - "lettuce, cordial, Almond meal" → comma-separated (multi-word segments OK)
 * - "lettuce cordial electrolytes" → space-separated when 3+ single-word tokens
 *   and none of the tokens match the store name (avoids splitting product titles)
 * - "Coles Raspberry Cordial" / "Almond meal" → kept as one item
 */
const splitProductNames = (productPart: string, store?: string): string[] => {
  const trimmed = productPart.trim();
  if (!trimmed) return [];

  if (/[,;]/.test(trimmed)) {
    return trimmed.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  const bySpace = trimmed.split(/\s+/).filter(Boolean);
  if (bySpace.length >= 3) {
    const storeLower = store?.trim().toLowerCase();
    const mentionsStore = storeLower
      ? bySpace.some((word) => word.toLowerCase() === storeLower)
      : false;
    if (!mentionsStore) {
      return bySpace;
    }
  }

  return [trimmed];
};

/**
 * Parse a Google Task title into product name(s) + store.
 * When the title contains " from [store]", the store suffix wins over the list name
 * (supports a single generic Tasks list). Known store aliases are normalized via
 * storeNameMap; unknown stores keep the raw text after "from".
 *
 * Multiple items in one task:
 *   "lettuce cordial electrolytes from Coles"  → 3 items
 *   "lettuce, cordial, Almond meal from Coles" → 3 items (comma for multi-word names)
 */
const parseTaskTitle = (
  title: string,
  listStore: string,
  storeNameMap: Record<string, string>,
): ParsedTask => {
  const trimmed = title.trim();
  const match = trimmed.match(FROM_STORE_PATTERN);
  if (match && match.index != null) {
    const productPart = trimmed.slice(0, match.index).trim();
    const rawStore = match[1].trim();
    const normalizedStore = normalizeStoreName(rawStore, storeNameMap);
    const productNames = splitProductNames(productPart, normalizedStore);
    if (productNames.length > 0 && rawStore) {
      return {
        productNames,
        store: normalizedStore,
        storeFromTitle: true,
      };
    }
  }
  return {
    productNames: splitProductNames(trimmed, listStore),
    store: listStore,
    storeFromTitle: false,
  };
};

/**
 * Resolve the retailer store for a task.
 * Titles with " from Woolworths" etc. use that store; otherwise defaults to Coles.
 * DEFAULT_SYNC_STORE secret overrides the Coles default if set.
 */
const resolveItemStore = (
  parsed: ParsedTask,
  storeNameMap: Record<string, string>,
): string => {
  if (parsed.storeFromTitle) return parsed.store;
  const configured = Deno.env.get("DEFAULT_SYNC_STORE")?.trim() || DEFAULT_TASK_STORE;
  return normalizeStoreName(configured, storeNameMap);
};

const deleteTask = async (token: string, listId: string, taskId: string): Promise<void> => {
  await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
};

// --- Store Products Cache Lookup ---
// Scoped to the specific store so Coles tasks only hit Coles products,
// Bunnings tasks only hit Bunnings products, etc.

const lookupExistingProduct = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string
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

/** Best-effort extraction when LLM JSON is truncated or wrapped in prose. */
const parseEnrichmentPayload = (
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

// --- Claude Enrichment ---

// Log callback shared by helpers: accepts an optional severity and structured
// context so the main handler can persist both to edge_function_logs.
type LogFn = (
  msg: string,
  level?: "debug" | "info" | "warn" | "error",
  context?: Record<string, unknown> | null,
) => void;

const enrichWithClaude = async (productName: string, store: string, log: LogFn): Promise<GeminiProduct> => {
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
  log(`[claude] ${store} calling API for "${productName}"`, "info", { store, product_name: productName });

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
      { store, product_name: productName, status: res.status, body_preview: errText.slice(0, 300) }
    );
    return fallback;
  }

  const data = await res.json();

  // Extract the last text block from the response (after tool use)
  const textBlock = [...(data?.content ?? [])].reverse().find((b: any) => b.type === "text");
  const text = textBlock?.text ?? "{}";
  log(`[claude] ${store} raw text: ${String(text).slice(0, 300)}`, "debug", { store, product_name: productName });

  const parsed = parseEnrichmentPayload(String(text), productName, store);
  if (parsed) return parsed;

  log(
    `[claude] ${store} could not extract product JSON`,
    "error",
    { store, product_name: productName, raw_preview: String(text).slice(0, 300) },
  );
  return fallback;
};

// --- Gemini Enrichment (Fallback) ---
// Uses the Gemini REST API via generativelanguage.googleapis.com.
// Only used as a fallback when Claude enrichment is unavailable/unhelpful.

const GEMINI_DEFAULT_MODEL = "gemini-3-flash-preview";

const enrichWithGemini = async (productName: string, store: string, log: LogFn): Promise<GeminiProduct> => {
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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  log(`[gemini] ${store} calling API for "${productName}" (model=${model})`, "info", {
    store,
    product_name: productName,
    model,
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Search the web (from your training + browsing capabilities if available) for a product listing on ${store} Australia matching: ${productName}.

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

  if (!res.ok) {
    const errText = await res.text();
    log(
      `[gemini] ${store} HTTP ${res.status}: ${errText.slice(0, 300)}`,
      "error",
      { store, product_name: productName, status: res.status, body_preview: errText.slice(0, 300) }
    );
    return fallback;
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === "string")?.text
    ?? "{}";
  log(`[gemini] ${store} raw text: ${String(text).slice(0, 300)}`, "debug", { store, product_name: productName });

  const parsed = parseEnrichmentPayload(String(text), productName, store);
  if (parsed) return parsed;

  log(
    `[gemini] ${store} could not extract product JSON`,
    "error",
    { store, product_name: productName, raw_preview: String(text).slice(0, 300) },
  );
  return fallback;
};

// --- Collect Candidate ---
// Looks up an existing store_products row for this store first.
// If none found, calls Claude to enrich. One candidate per task.

const collectCandidate = async (
  supabase: AnySupabaseClient,
  productName: string,
  store: string,
  log: LogFn
): Promise<Candidate | null> => {
  const cached = await lookupExistingProduct(supabase, productName, store);
  if (cached) {
    log(
      `[collect] ${store}: cache hit id=${cached.id} name="${cached.name}"`,
      "info",
      { store, product_name: productName, store_product_id: cached.id }
    );
    return { ...cached, price: null, category: null, isNew: false };
  }

  // Prefer Claude (has explicit web_search tool), but fall back to Gemini when
  // Claude is unavailable (e.g. missing key / insufficient credits).
  let enriched = await enrichWithClaude(productName, store, log);
  if (!enriched.enriched) {
    const gemini = await enrichWithGemini(productName, store, log);
    if (gemini.enriched) enriched = gemini;
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

// --- Persist New Product ---

const persistCandidate = async (
  supabase: AnySupabaseClient,
  candidate: Candidate,
  log: LogFn
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
      `[persist] store_products insert FAILED for "${candidate.name}" (${candidate.store}): ${JSON.stringify(error)}`,
      "error",
      { store: candidate.store, product_name: candidate.name, table: "store_products", error }
    );
    return null;
  }

  const insertedId = (data as { id: string }).id;
  log(
    `[persist] store_products inserted id=${insertedId} name="${candidate.name}" store=${candidate.store}`,
    "info",
    { store: candidate.store, product_name: candidate.name, store_product_id: insertedId }
  );
  return { ...candidate, id: insertedId, isNew: false };
};

// --- Select Default Product ---
// Rule 1: Coles-brand product (brand or name starts with "Coles").
// Rule 2: Cheapest by price (nulls last), tie-break by store priority then name.
// Rule 3: Fallback store-priority order.

const selectDefault = (candidates: Candidate[]): Candidate | null => {
  if (candidates.length === 0) return null;

  const colesBrand = candidates.find(
    c => COLES_BRAND_PATTERN.test(c.brand ?? "") || COLES_BRAND_PATTERN.test(c.name)
  );
  if (colesBrand) return colesBrand;

  const withPrice = candidates
    .filter(c => c.price !== null)
    .sort((a, b) => {
      const priceDiff = (a.price ?? 0) - (b.price ?? 0);
      if (priceDiff !== 0) return priceDiff;
      const storeDiff = STORE_PRIORITY.indexOf(a.store) - STORE_PRIORITY.indexOf(b.store);
      return storeDiff !== 0 ? storeDiff : a.name.localeCompare(b.name);
    });
  if (withPrice.length > 0) return withPrice[0];

  return [...candidates].sort((a, b) => {
    const storeDiff = STORE_PRIORITY.indexOf(a.store) - STORE_PRIORITY.indexOf(b.store);
    return storeDiff !== 0 ? storeDiff : a.name.localeCompare(b.name);
  })[0];
};

// --- Ingredient Resolution ---

const HOUSEHOLD_CATEGORY_PATTERN =
  /\b(cleaning|household|hardware|garden|bathroom|laundry|toiletries|personal\s*care|bunnings|diy|home\s*care|pet\s*care)\b/i;

const kindFromCategory = (category: string | null | undefined): "food" | "household" => {
  if (!category) return "food";
  return HOUSEHOLD_CATEGORY_PATTERN.test(category) ? "household" : "food";
};

const resolveIngredient = async (
  supabase: AnySupabaseClient,
  name: string,
  category?: string | null,
): Promise<string | null> => {
  const kind = kindFromCategory(category);
  const { data: existing } = await supabase
    .from("ingredients")
    .select("id, kind")
    .ilike("name", name.trim())
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; kind: string | null };
    // Promote food → household when enrichment says non-food; never demote.
    if (kind === "household" && row.kind !== "household") {
      await supabase.from("ingredients").update({ kind: "household" }).eq("id", row.id);
    }
    return row.id;
  }

  const { data: created, error } = await supabase
    .from("ingredients")
    .insert({ name: name.trim(), optional: false, pantry_staple: false, kind })
    .select("id")
    .single();

  if (error || !created) return null;
  return (created as { id: string }).id;
};

// --- Shopping Trip Resolution ---
// Find-or-create the latest OPEN (completed_at is null) shopping_trips row
// for the given user + store. Shopping may span multiple days between when
// items are added to Google Tasks and when the user actually goes shopping,
// so we accumulate into the currently-open trip regardless of date. When the
// user checks off the final item in a trip, a DB trigger marks it complete;
// subsequent syncs then create a fresh trip.

const findOrCreateOpenTrip = async (
  supabase: AnySupabaseClient,
  userId: string,
  store: string,
  log: LogFn
): Promise<string | null> => {
  const { data: existing, error: findErr } = await supabase
    .from("shopping_trips")
    .select("id")
    .eq("user_id", userId)
    .eq("store", store)
    .is("completed_at", null)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    log(
      `[trip] lookup FAILED for store=${store}: ${JSON.stringify(findErr)}`,
      "error",
      { store, user_id: userId, table: "shopping_trips", op: "lookup", error: findErr }
    );
    return null;
  }
  if (existing) {
    const tripId = (existing as { id: string }).id;
    log(
      `[trip] reusing open trip id=${tripId} store=${store}`,
      "info",
      { store, user_id: userId, trip_id: tripId, reused: true }
    );
    return tripId;
  }

  const { data: created, error: insertErr } = await supabase
    .from("shopping_trips")
    .insert({
      user_id: userId,
      store,
      purchased_at: new Date().toISOString(),
      notes: "Auto-created from Google Tasks sync",
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    log(
      `[trip] create FAILED for store=${store}: ${JSON.stringify(insertErr)}`,
      "error",
      { store, user_id: userId, table: "shopping_trips", op: "insert", error: insertErr }
    );
    return null;
  }

  const newTripId = (created as { id: string }).id;
  log(
    `[trip] created trip id=${newTripId} store=${store}`,
    "info",
    { store, user_id: userId, trip_id: newTripId, reused: false }
  );
  return newTripId;
};

// --- Pack Size Parsing ---
// Parse common size labels returned by Claude (e.g. "500g", "1 kg", "750 ml",
// "2 L", "6 pack", "12pk", "1 each") into a numeric pack_quantity + pack_unit.
// Kept intentionally simple; toBaseUnit on the client handles normalisation.

const parsePackSize = (sizeLabel: string | null): { qty: number; unit: string } | null => {
  if (!sizeLabel) return null;
  const s = sizeLabel.trim().toLowerCase();
  if (!s) return null;

  const weightVol = s.match(/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/);
  if (weightVol) {
    return { qty: Number(weightVol[1]), unit: weightVol[2] };
  }

  const pack = s.match(/^(\d+(?:\.\d+)?)\s*(pack|pk|pkt|pc|pcs|piece|pieces|each|ea|ct|count|x)\b/);
  if (pack) {
    return { qty: Number(pack[1]), unit: "units" };
  }

  const bareNumber = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bareNumber) {
    return { qty: Number(bareNumber[1]), unit: "units" };
  }

  return null;
};

// --- Persist Ingredient Preferences ---

const persistIngredientPreferences = async (
  supabase: AnySupabaseClient,
  ingredientId: string,
  defaultProductId: string,
  alternativeIds: string[]
): Promise<void> => {
  await supabase
    .from("ingredients")
    .update({ default_store_product_id: defaultProductId })
    .eq("id", ingredientId);

  await supabase
    .from("ingredient_store_product_options")
    .delete()
    .eq("ingredient_id", ingredientId);

  if (alternativeIds.length > 0) {
    const rows = alternativeIds.map((storeProductId, index) => ({
      ingredient_id: ingredientId,
      store_product_id: storeProductId,
      sort_order: index,
    }));
    await supabase.from("ingredient_store_product_options").insert(rows);
  }
};

// --- Trip Item Upsert ---
// If a product already exists on the current open trip, increment quantity
// instead of inserting a duplicate row.
const upsertTripItemForProduct = async (
  supabase: AnySupabaseClient,
  tripId: string,
  title: string,
  candidate: Candidate,
  log: LogFn
): Promise<void> => {
  if (!candidate.id) {
    log(
      `[sync] "${title}": missing store_product_id — cannot upsert trip item`,
      "warn",
      { title, reason: "missing_store_product_id", trip_id: tripId }
    );
    return;
  }

  const { data: existing, error: findErr } = await supabase
    .from("shopping_trip_items")
    .select("id, quantity_purchased")
    .eq("shopping_trip_id", tripId)
    .eq("store_product_id", candidate.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    log(
      `[sync] "${title}": shopping_trip_items lookup error: ${JSON.stringify(findErr)}`,
      "error",
      { title, table: "shopping_trip_items", trip_id: tripId, error: findErr }
    );
    return;
  }

  if (existing) {
    const row = existing as { id: string; quantity_purchased: number | null };
    const nextQuantity = Math.max(1, Number(row.quantity_purchased ?? 0) + 1);
    const { error: updErr } = await supabase
      .from("shopping_trip_items")
      .update({ quantity_purchased: nextQuantity })
      .eq("id", row.id);

    if (updErr) {
      log(
        `[sync] "${title}": shopping_trip_items quantity update error: ${JSON.stringify(updErr)}`,
        "error",
        { title, table: "shopping_trip_items", trip_id: tripId, row_id: row.id, error: updErr }
      );
      return;
    }

    log(
      `[sync] "${title}": incremented shopping_trip_items quantity to ${nextQuantity} (row=${row.id})`,
      "info",
      { title, trip_id: tripId, shopping_trip_item_id: row.id, quantity_purchased: nextQuantity }
    );
    return;
  }

  const pack = parsePackSize(candidate.size_label);
  const productName = [candidate.brand, candidate.name].filter(Boolean).join(" ").trim() || title;
  const { error: tiErr } = await supabase.from("shopping_trip_items").insert({
    shopping_trip_id: tripId,
    product_name: productName,
    ingredient_name: title,
    quantity_purchased: 1,
    pack_quantity: pack?.qty ?? null,
    pack_unit: pack?.unit ?? null,
    store_product_id: candidate.id || null,
  });
  if (tiErr) {
    log(
      `[sync] "${title}": shopping_trip_items insert error: ${JSON.stringify(tiErr)}`,
      "error",
      { title, table: "shopping_trip_items", trip_id: tripId, error: tiErr }
    );
  } else {
    log(
      `[sync] "${title}": added to shopping_trip_items (trip=${tripId})`,
      "info",
      { title, trip_id: tripId }
    );
  }
};

/** Add a trip line from the raw task text when product enrichment is unavailable. */
const upsertTripItemByName = async (
  supabase: AnySupabaseClient,
  tripId: string,
  productName: string,
  log: LogFn,
): Promise<boolean> => {
  const { data: existing, error: findErr } = await supabase
    .from("shopping_trip_items")
    .select("id, quantity_purchased")
    .eq("shopping_trip_id", tripId)
    .is("store_product_id", null)
    .ilike("ingredient_name", productName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    log(
      `[sync] "${productName}": shopping_trip_items lookup error: ${JSON.stringify(findErr)}`,
      "error",
      { title: productName, table: "shopping_trip_items", trip_id: tripId, error: findErr },
    );
    return false;
  }

  if (existing) {
    const row = existing as { id: string; quantity_purchased: number | null };
    const nextQuantity = Math.max(1, Number(row.quantity_purchased ?? 0) + 1);
    const { error: updErr } = await supabase
      .from("shopping_trip_items")
      .update({ quantity_purchased: nextQuantity })
      .eq("id", row.id);
    if (updErr) {
      log(
        `[sync] "${productName}": shopping_trip_items quantity update error: ${JSON.stringify(updErr)}`,
        "error",
        { title: productName, table: "shopping_trip_items", trip_id: tripId, row_id: row.id, error: updErr },
      );
      return false;
    }
    return true;
  }

  const { error: tiErr } = await supabase.from("shopping_trip_items").insert({
    shopping_trip_id: tripId,
    product_name: productName,
    ingredient_name: productName,
    quantity_purchased: 1,
    pack_quantity: null,
    pack_unit: null,
    store_product_id: null,
  });
  if (tiErr) {
    log(
      `[sync] "${productName}": shopping_trip_items insert error: ${JSON.stringify(tiErr)}`,
      "error",
      { title: productName, table: "shopping_trip_items", trip_id: tripId, error: tiErr },
    );
    return false;
  }

  log(
    `[sync] "${productName}": added unenriched shopping_trip_items row (trip=${tripId})`,
    "info",
    { title: productName, trip_id: tripId, enriched: false },
  );
  return true;
};

/** Sync one parsed product name from a Google Task into store_products + trip. */
const processTaskProduct = async (
  supabase: AnySupabaseClient,
  params: {
    taskTitle: string;
    productName: string;
    itemStore: string;
    syncUserId: string | null;
    tripId: string | null;
    log: LogFn;
  },
): Promise<boolean> => {
  const { taskTitle, productName, itemStore, syncUserId, tripId, log } = params;

  const rawCandidate = await collectCandidate(supabase, productName, itemStore, log);
  if (!rawCandidate) {
    if (tripId) {
      const added = await upsertTripItemByName(supabase, tripId, productName, log);
      if (added) {
        log(
          `[sync] "${taskTitle}" → "${productName}": added without enrichment`,
          "warn",
          { store: itemStore, title: taskTitle, product_name: productName, reason: "unenriched_fallback" },
        );
        return true;
      }
    }
    log(
      `[sync] "${taskTitle}" → "${productName}": skipping — no candidate found`,
      "warn",
      { store: itemStore, title: taskTitle, product_name: productName, reason: "no_candidate" },
    );
    return false;
  }

  const candidate = await persistCandidate(supabase, rawCandidate, log);
  if (!candidate) {
    log(
      `[sync] "${taskTitle}" → "${productName}": skipping — store_products persist failed`,
      "warn",
      { store: itemStore, title: taskTitle, product_name: productName, reason: "persist_failed" },
    );
    return false;
  }

  const ingredientId = await resolveIngredient(supabase, productName, candidate.category);
  log(
    `[sync] "${taskTitle}" → "${productName}": ingredientId=${ingredientId}`,
    "info",
    { store: itemStore, title: taskTitle, product_name: productName, ingredient_id: ingredientId },
  );
  if (ingredientId) {
    await persistIngredientPreferences(supabase, ingredientId, candidate.id, []);
  }

  const { error: insertErr } = await supabase.from("shopping_list_items").insert({
    user_id: syncUserId,
    raw_name: taskTitle,
    name: candidate.name,
    brand: candidate.brand ?? null,
    price: candidate.price ?? null,
    unit: candidate.size_label ?? null,
    url: candidate.product_url ?? null,
    image_url: candidate.image_url ?? null,
    category: candidate.category ?? null,
    store: candidate.store,
    source: "google_tasks",
    enriched: true,
  });
  if (insertErr) {
    log(
      `[sync] "${taskTitle}" → "${productName}": shopping_list_items insert error: ${JSON.stringify(insertErr)}`,
      "error",
      { store: itemStore, title: taskTitle, product_name: productName, table: "shopping_list_items", error: insertErr },
    );
  }

  if (tripId) {
    await upsertTripItemForProduct(supabase, tripId, productName, candidate, log);
  } else if (syncUserId) {
    log(
      `[sync] "${taskTitle}" → "${productName}": no trip available — skipping shopping_trip_items insert`,
      "warn",
      { store: itemStore, title: taskTitle, product_name: productName, reason: "no_trip" },
    );
  }

  log(
    `[sync] "${taskTitle}" → "${productName}": processed OK`,
    "info",
    { store: itemStore, title: taskTitle, product_name: productName },
  );
  return true;
};

// --- Logging ---
// `log` writes to three sinks:
//   1. console (so Supabase's built-in function log viewer still picks it up),
//   2. an in-memory `debugLog` returned in the HTTP response (handy during
//      local curl-based debugging), and
//   3. a buffered batch that is flushed to public.edge_function_logs at every
//      exit point so errors and informational messages survive past the
//      invocation and are queryable from SQL.
// The buffer is flushed in a single insert to minimise request overhead; if
// the flush itself fails we fall back to console.error so the failure is
// still visible in the Supabase function logs.

const FUNCTION_NAME = "sync-google-tasks";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown> | null | undefined;
interface BufferedLog {
  level: LogLevel;
  message: string;
  context: LogContext;
  at: string;
}

// --- Main ---

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const runId = crypto.randomUUID();
  const debugLog: string[] = [];
  const dbBuffer: BufferedLog[] = [];

  const log = (msg: string, level: LogLevel = "info", context: LogContext = null) => {
    console.log(`[${level}] ${msg}`);
    debugLog.push(msg);
    dbBuffer.push({ level, message: msg, context: context ?? null, at: new Date().toISOString() });
  };

  const flushLogs = async () => {
    if (dbBuffer.length === 0) return;
    const rows = dbBuffer.splice(0).map(entry => ({
      function_name: FUNCTION_NAME,
      run_id: runId,
      level: entry.level,
      message: entry.message,
      context: entry.context,
      created_at: entry.at,
    }));
    const { error } = await supabase.from("edge_function_logs").insert(rows);
    if (error) {
      console.error(`[edge_function_logs] flush FAILED: ${JSON.stringify(error)}`);
    }
  };

  const respond = async (body: Record<string, unknown>, status = 200) => {
    await flushLogs();
    return new Response(JSON.stringify({ run_id: runId, ...body }), { status });
  };

  const syncUserId = Deno.env.get("SYNC_USER_ID") ?? null;
  const storeNameMap = buildStoreAliasMap(log);
  log(
    `[sync] Starting. SUPABASE_URL set=${!!supabaseUrl} SERVICE_KEY set=${!!supabaseServiceKey} SYNC_USER_ID set=${!!syncUserId}`,
    "info",
    { supabase_url_set: !!supabaseUrl, service_key_set: !!supabaseServiceKey, sync_user_id_set: !!syncUserId }
  );


  let token: string | null = null;
  try {
    token = await getAccessToken();
    log("[sync] Google auth OK");
  } catch (e) {
    log(`[sync] Google auth FAILED: ${e}`, "error", { error: String(e) });
    return respond({ ok: false, error: "google_auth_failed", debug: debugLog });
  }

  // Discover all task lists dynamically — supports any store name (Coles, Bunnings, etc.)
  const taskLists = await getAllTaskLists(token);
  log(
    `[sync] Found ${taskLists.size} task lists: ${JSON.stringify([...taskLists.keys()])}`,
    "info",
    { task_list_count: taskLists.size, task_lists: [...taskLists.keys()] }
  );

  let processed = 0;
  let skipped = 0;
  let purged = 0;

  for (const [listTitle, listId] of taskLists) {
    const store = normalizeStoreName(listTitle, storeNameMap);
    const purgedForList = await purgeOldCompletedTasks(token, listId, store, log);
    purged += purgedForList;
    if (purgedForList > 0) {
      log(
        `[purge] ${store}: removed ${purgedForList} completed task(s) older than 1 week`,
        "info",
        { store, purged: purgedForList }
      );
    }

    const tasks = await getTasks(token, listId);
    log(
      `[sync] ${store} (list="${listTitle}") tasks found=${tasks.length} titles=${JSON.stringify(tasks.map((t: any) => t.title))}`,
      "info",
      { store, list_title: listTitle, task_count: tasks.length }
    );
    if (!Array.isArray(tasks) || tasks.length === 0) continue;

    // Trips are keyed by resolved store — a generic list may contain items for
    // multiple stores (e.g. "Milk from Coles", "Bread from Woolworths").
    const tripIdsByStore = new Map<string, string>();
    const resolveTripId = async (itemStore: string): Promise<string | null> => {
      if (!syncUserId) return null;
      const cached = tripIdsByStore.get(itemStore);
      if (cached) return cached;
      const tripId = await findOrCreateOpenTrip(supabase, syncUserId, itemStore, log);
      if (tripId) tripIdsByStore.set(itemStore, tripId);
      return tripId;
    };

    if (!syncUserId) {
      log(
        `[sync] ${store}: SYNC_USER_ID not set — cannot create shopping trip; items will be enriched only`,
        "warn",
        { store }
      );
    }

    for (const task of tasks) {
      const title: string = task?.title ?? "";
      if (!title) { skipped++; continue; }

      const parsed = parseTaskTitle(title, store, storeNameMap);
      const { productNames, storeFromTitle } = parsed;
      if (productNames.length === 0) { skipped++; continue; }

      const itemStore = resolveItemStore(parsed, storeNameMap);

      log(
        `[sync] Processing task: "${title}" → products=${JSON.stringify(productNames)} store=${itemStore} (list=${store}, fromTitle=${storeFromTitle}, id=${task.id})`,
        "info",
        {
          list_store: store,
          item_store: itemStore,
          title,
          product_names: productNames,
          store_from_title: storeFromTitle,
          task_id: task.id,
        },
      );

      try {
        const tripId = await resolveTripId(itemStore);
        let allOk = true;
        for (const productName of productNames) {
          const ok = await processTaskProduct(supabase, {
            taskTitle: title,
            productName,
            itemStore,
            syncUserId,
            tripId,
            log,
          });
          if (!ok) allOk = false;
        }

        if (allOk) {
          await deleteTask(token, listId, task.id);
          processed += productNames.length;
        } else {
          skipped += productNames.length;
          log(
            `[sync] "${title}": kept in Google Tasks — one or more products failed`,
            "warn",
            { store: itemStore, title, product_names: productNames, reason: "partial_failure" },
          );
        }
      } catch (e) {
        log(
          `[sync] "${title}": EXCEPTION: ${e}`,
          "error",
          { store: itemStore, title, task_id: task?.id, error: String(e) },
        );
        skipped += productNames.length;
      }
    }
  }

  log(`[sync] Done. processed=${processed} skipped=${skipped} purged=${purged}`, "info", { processed, skipped, purged });
  return respond({ ok: true, processed, skipped, purged, debug: debugLog });
});
