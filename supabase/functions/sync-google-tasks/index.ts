import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Store priority used only for default product selection — not for task list discovery.
// Task lists are discovered dynamically from Google Tasks (any list name works).
const STORE_PRIORITY = ["Coles", "Woolworths", "Aldi"];
const COLES_BRAND_PATTERN = /^coles\b/i;

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

const getTasks = async (token: string, listId: string): Promise<any[]> => {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=false`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
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
  supabase: ReturnType<typeof createClient>,
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

// --- Claude Enrichment ---

const enrichWithClaude = async (productName: string, store: string, log: (m: string) => void): Promise<GeminiProduct> => {
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
    log(`[claude] ${store} NO API KEY`);
    return fallback;
  }
  log(`[claude] ${store} calling API for "${productName}"`);

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
  "category": "e.g. Cleaning, Dairy, Bakery, Pantry"
}`,
      }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    log(`[claude] ${store} HTTP ${res.status}: ${errText.slice(0, 300)}`);
    return fallback;
  }

  const data = await res.json();

  // Extract the last text block from the response (after tool use)
  const textBlock = [...(data?.content ?? [])].reverse().find((b: any) => b.type === "text");
  const text = textBlock?.text ?? "{}";
  log(`[claude] ${store} raw text: ${String(text).slice(0, 300)}`);

  try {
    // Extract JSON: try code fence first, then first {...} block
    let jsonStr = String(text);
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1];
    } else {
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) jsonStr = objMatch[0];
    }
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
  } catch (e) {
    log(`[claude] ${store} JSON parse error: ${e}`);
    return fallback;
  }
};

// --- Collect Candidate ---
// Looks up an existing store_products row for this store first.
// If none found, calls Claude to enrich. One candidate per task.

const collectCandidate = async (
  supabase: ReturnType<typeof createClient>,
  productName: string,
  store: string,
  log: (m: string) => void
): Promise<Candidate | null> => {
  const cached = await lookupExistingProduct(supabase, productName, store);
  if (cached) {
    log(`[collect] ${store}: cache hit id=${cached.id} name="${cached.name}"`);
    return { ...cached, price: null, category: null, isNew: false };
  }

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

// --- Persist New Product ---

const persistCandidate = async (
  supabase: ReturnType<typeof createClient>,
  candidate: Candidate,
  log: (m: string) => void
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
    log(`[persist] store_products insert FAILED for "${candidate.name}" (${candidate.store}): ${JSON.stringify(error)}`);
    return null;
  }

  log(`[persist] store_products inserted id=${(data as { id: string }).id} name="${candidate.name}" store=${candidate.store}`);
  return { ...candidate, id: (data as { id: string }).id, isNew: false };
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

const resolveIngredient = async (
  supabase: ReturnType<typeof createClient>,
  name: string
): Promise<string | null> => {
  const { data: existing } = await supabase
    .from("ingredients")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await supabase
    .from("ingredients")
    .insert({ name: name.trim(), optional: false, pantry_staple: false })
    .select("id")
    .single();

  if (error || !created) return null;
  return (created as { id: string }).id;
};

// --- Persist Ingredient Preferences ---

const persistIngredientPreferences = async (
  supabase: ReturnType<typeof createClient>,
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

// --- Main ---

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const debugLog: string[] = [];
  const log = (msg: string) => { console.log(msg); debugLog.push(msg); };

  const syncUserId = Deno.env.get("SYNC_USER_ID") ?? null;
  log(`[sync] Starting. SUPABASE_URL set=${!!supabaseUrl} SERVICE_KEY set=${!!supabaseServiceKey} SYNC_USER_ID set=${!!syncUserId}`);


  let token: string | null = null;
  try {
    token = await getAccessToken();
    log("[sync] Google auth OK");
  } catch (e) {
    log(`[sync] Google auth FAILED: ${e}`);
    return new Response(JSON.stringify({ ok: false, error: "google_auth_failed", debug: debugLog }), { status: 200 });
  }

  // Discover all task lists dynamically — supports any store name (Coles, Bunnings, etc.)
  const taskLists = await getAllTaskLists(token);
  log(`[sync] Found ${taskLists.size} task lists: ${JSON.stringify([...taskLists.keys()])}`);

  let processed = 0;
  let skipped = 0;

  for (const [store, listId] of taskLists) {
    const tasks = await getTasks(token, listId);
    log(`[sync] ${store} tasks found=${tasks.length} titles=${JSON.stringify(tasks.map((t: any) => t.title))}`);
    if (!Array.isArray(tasks) || tasks.length === 0) continue;

    for (const task of tasks) {
      const title: string = task?.title ?? "";
      log(`[sync] Processing task: "${title}" (store=${store} id=${task.id})`);
      if (!title) { skipped++; continue; }

      try {
        // 1. Lookup existing store_products for this store, or enrich via Claude
        const rawCandidate = await collectCandidate(supabase, title, store, log);
        if (!rawCandidate) {
          log(`[sync] "${title}": skipping — no candidate found`);
          skipped++;
          continue;
        }

        // 2. Persist to store_products if new
        const candidate = await persistCandidate(supabase, rawCandidate, log);
        if (!candidate) {
          log(`[sync] "${title}": skipping — store_products persist failed`);
          skipped++;
          continue;
        }

        // 3. Resolve or create ingredient, then save as default product
        const ingredientId = await resolveIngredient(supabase, title);
        log(`[sync] "${title}": ingredientId=${ingredientId}`);
        if (ingredientId) {
          await persistIngredientPreferences(supabase, ingredientId, candidate.id, []);
        }

        // 4. Record to shopping_list_items (enriched archive log)
        const { error: insertErr } = await supabase.from("shopping_list_items").insert({
          user_id: syncUserId,
          raw_name: title,
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
        if (insertErr) log(`[sync] "${title}": shopping_list_items insert error: ${JSON.stringify(insertErr)}`);

        // 5. Insert into shopping_list so the item appears in the Shopping List UI
        if (syncUserId) {
          const { error: slErr } = await supabase.from("shopping_list").insert({
            user_id: syncUserId,
            ingredient_name: title,
            source: "google_tasks",
            is_checked: false,
          });
          if (slErr) log(`[sync] "${title}": shopping_list insert error: ${JSON.stringify(slErr)}`);
          else log(`[sync] "${title}": added to shopping_list for user`);
        } else {
          log(`[sync] "${title}": SYNC_USER_ID not set — skipping shopping_list insert`);
        }

        // Delete task only after successful processing
        await deleteTask(token, listId, task.id);
        processed++;
        log(`[sync] "${title}": processed OK`);
      } catch (e) {
        log(`[sync] "${title}": EXCEPTION: ${e}`);
        skipped++;
      }
    }
  }

  log(`[sync] Done. processed=${processed} skipped=${skipped}`);
  return new Response(JSON.stringify({ ok: true, processed, skipped, debug: debugLog }), { status: 200 });
});
