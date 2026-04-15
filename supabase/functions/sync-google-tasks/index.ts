import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STORES = ["Coles", "Woolworths", "Aldi"];

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

const getTaskListId = async (token: string, listName: string): Promise<string | null> => {
  const res = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.find((l: any) => l.title === listName)?.id ?? null;
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

// --- Gemini Enrichment ---

const enrichWithGemini = async (productName: string, store: string): Promise<any> => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { name: productName, enriched: false };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tools: [{ google_search: {} }],
        contents: [{
          parts: [{
            text: `Search for "${productName}" on the ${store} Australia website (${store.toLowerCase()}.com.au).

Return ONLY a JSON object with no markdown, no backticks, no explanation:
{
  "name": "full product name",
  "brand": "brand name or null",
  "price": 3.50,
  "unit": "pack size or weight e.g. 500g, 6 pack",
  "url": "direct product URL on ${store.toLowerCase()}.com.au",
  "image_url": "product image URL or null",
  "category": "e.g. Cleaning, Dairy, Bakery, Pantry"
}`
          }]
        }]
      }),
    }
  );

  if (!res.ok) {
    return { name: productName, enriched: false };
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  try {
    return JSON.parse(String(text).replace(/```json|```/g, "").trim());
  } catch {
    return { name: productName, enriched: false };
  }
};

// --- Main ---

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1" || url.searchParams.get("debug") === "true";
  const onlyStore = url.searchParams.get("store") || undefined;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey =
    Deno.env.get("SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SB_SERVICE_ROLE_KEY") ??
    "";
  if (!supabaseServiceKey) {
    const body = { ok: false, error: "missing_service_role_key" };
    return new Response(JSON.stringify(body), { status: 200 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch (_e) {
    const body = { ok: false, error: "google_auth_failed" };
    return new Response(JSON.stringify(body), { status: 200 });
  }

  const storesToProcess = onlyStore ? STORES.filter((s) => s.toLowerCase() === onlyStore.toLowerCase()) : STORES;
  const runSummary: Record<string, unknown> = debug ? {} : {};

  for (const store of storesToProcess) {
    let summary: any = debug ? { store } : null;
    const listId = await getTaskListId(token!, store);
    if (debug) summary.listId = listId ?? null;
    if (!listId) {
      if (debug) (runSummary as any)[store] = summary;
      continue;
    }

    const tasks = await getTasks(token!, listId);
    if (debug) summary.numTasks = tasks.length;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      if (debug) (runSummary as any)[store] = summary;
      continue;
    }

    let inserted = 0;
    const errors: string[] = [];
    for (const task of tasks) {
      const title: string = task?.title ?? "";
      if (!title) continue;

      const product = await enrichWithGemini(title, store);

      const { error } = await supabase.from("shopping_list_items").insert({
        raw_name: title,
        name: product.name ?? title,
        brand: product.brand ?? null,
        price: product.price ?? null,
        unit: product.unit ?? null,
        url: product.url ?? null,
        image_url: product.image_url ?? null,
        category: product.category ?? null,
        store,
        source: "google_tasks",
        enriched: product.enriched !== false,
      });
      if (error) {
        errors.push(`insert_failed:${error.message}`);
        continue;
      }
      inserted += 1;

      // Best-effort delete; ignore errors
      try {
        await deleteTask(token!, listId, task.id);
      } catch {
        // ignore
      }
    }

    if (debug) {
      summary.inserted = inserted;
      if (errors.length) summary.errors = errors;
      (runSummary as any)[store] = summary;
    }
  }

  const body = debug ? { ok: true, summary: runSummary } : { ok: true };
  return new Response(JSON.stringify(body), { status: 200 });
});

