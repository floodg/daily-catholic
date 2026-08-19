import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AnySupabaseClient,
  type Candidate,
  collectCandidate,
  persistCandidate,
  type LogFn,
} from "../_shared/product-enrichment.ts";

const DEFAULT_STORE_NAME_MAP: Record<string, string> = {
  coles: "Coles",
  woolworths: "Woolworths",
  woolies: "Woolworths",
  aldi: "Aldi",
  iga: "IGA",
};
const DEFAULT_TASK_STORE = "Coles";
const COMPLETED_TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const FROM_STORE_PATTERN = /\s+from\s+(.+)$/i;
const AND_ALSO_PATTERN = /\s+and\s+also\s+/i;
const FUNCTION_NAME = "sync-google-tasks";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown> | null | undefined;
interface BufferedLog {
  level: LogLevel;
  message: string;
  context: LogContext;
  at: string;
}
interface ParsedTask {
  productNames: string[];
  store: string;
  storeFromTitle: boolean;
}
interface CanonicalIngredient {
  id: string;
  name: string;
}

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
  if (!res.ok) throw new Error(`Failed to get Google access token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
};

const getAllTaskLists = async (token: string): Promise<Map<string, string>> => {
  const res = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return new Map();
  const data = await res.json();
  const out = new Map<string, string>();
  for (const list of data.items ?? []) {
    if (list.title && list.id) out.set(list.title, list.id);
  }
  return out;
};

const getTasks = async (token: string, listId: string, showCompleted = false): Promise<any[]> => {
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
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) break;
    const data = await res.json();
    tasks.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return tasks;
};

const deleteTask = async (token: string, listId: string, taskId: string): Promise<boolean> => {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  return res.ok;
};

const purgeOldCompletedTasks = async (
  token: string,
  listId: string,
  store: string,
  log: LogFn,
): Promise<number> => {
  const cutoff = Date.now() - COMPLETED_TASK_RETENTION_MS;
  const tasks = await getTasks(token, listId, true);
  let purged = 0;
  for (const task of tasks) {
    if (task?.status !== "completed" || !task?.id) continue;
    const completedAt = task.completed ? Date.parse(task.completed) : NaN;
    if (!Number.isFinite(completedAt) || completedAt > cutoff) continue;
    if (await deleteTask(token, listId, task.id)) {
      purged++;
      log(`[purge] ${store}: deleted completed task "${task.title ?? ""}"`, "info", {
        store,
        task_id: task.id,
        completed: task.completed,
      });
    }
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
      if (key && value) aliases[key] = value;
    }
    return { ...DEFAULT_STORE_NAME_MAP, ...aliases };
  } catch (error) {
    log(`[sync] Invalid STORE_LIST_ALIASES_JSON; using defaults: ${String(error)}`, "warn", {
      error: String(error),
    });
    return DEFAULT_STORE_NAME_MAP;
  }
};

const normalizeStoreName = (value: string, map: Record<string, string>): string => {
  const trimmed = value.trim();
  return map[trimmed.toLowerCase()] ?? trimmed;
};

const splitProductNames = (value: string): string[] => value
  .trim()
  .split(AND_ALSO_PATTERN)
  .map((x) => x.trim())
  .filter(Boolean);

const parseTaskTitle = (
  title: string,
  listStore: string,
  storeMap: Record<string, string>,
): ParsedTask => {
  const trimmed = title.trim();
  const match = trimmed.match(FROM_STORE_PATTERN);
  if (match && match.index != null) {
    const productNames = splitProductNames(trimmed.slice(0, match.index));
    const rawStore = match[1].trim();
    if (productNames.length && rawStore) {
      return {
        productNames,
        store: normalizeStoreName(rawStore, storeMap),
        storeFromTitle: true,
      };
    }
  }
  return { productNames: splitProductNames(trimmed), store: listStore, storeFromTitle: false };
};

const resolveItemStore = (parsed: ParsedTask, storeMap: Record<string, string>): string => {
  if (parsed.storeFromTitle) return parsed.store;
  return normalizeStoreName(Deno.env.get("DEFAULT_SYNC_STORE")?.trim() || DEFAULT_TASK_STORE, storeMap);
};

const findOrCreateOpenTrip = async (
  supabase: AnySupabaseClient,
  userId: string,
  store: string,
  log: LogFn,
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
    log(`[trip] lookup FAILED for store=${store}: ${JSON.stringify(findErr)}`, "error", { store, error: findErr });
    return null;
  }
  if (existing) {
    const id = (existing as { id: string }).id;
    log(`[trip] reusing open trip id=${id} store=${store}`, "info", { store, trip_id: id, reused: true });
    return id;
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
    log(`[trip] create FAILED for store=${store}: ${JSON.stringify(insertErr)}`, "error", { store, error: insertErr });
    return null;
  }
  const id = (created as { id: string }).id;
  log(`[trip] created trip id=${id} store=${store}`, "info", { store, trip_id: id, reused: false });
  return id;
};

const parsePackSize = (label: string | null): { qty: number; unit: string } | null => {
  if (!label) return null;
  const value = label.trim().toLowerCase();
  const weightVolume = value.match(/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/);
  if (weightVolume) return { qty: Number(weightVolume[1]), unit: weightVolume[2] };
  const pack = value.match(/^(\d+(?:\.\d+)?)\s*(pack|pk|pkt|pc|pcs|piece|pieces|each|ea|ct|count|x)\b/);
  if (pack) return { qty: Number(pack[1]), unit: "units" };
  const bare = value.match(/^(\d+(?:\.\d+)?)$/);
  return bare ? { qty: Number(bare[1]), unit: "units" } : null;
};

const resolveCanonicalIngredient = async (
  supabase: AnySupabaseClient,
  text: string,
  log: LogFn,
): Promise<CanonicalIngredient | null> => {
  const { data: resolved, error } = await supabase.rpc("resolve_canonical_ingredient_id", { p_text: text });
  if (error) {
    log(`[canonical] resolver failed for "${text}": ${JSON.stringify(error)}`, "error", { text, error });
    return null;
  }
  const id = typeof resolved === "string" ? resolved : null;
  if (!id) return null;
  const { data: row, error: rowErr } = await supabase
    .from("ingredients")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (rowErr || !row) {
    log(`[canonical] ingredient lookup failed for id=${id}`, "error", { text, ingredient_id: id, error: rowErr });
    return null;
  }
  return row as CanonicalIngredient;
};

const persistIngredientPreferences = async (
  supabase: AnySupabaseClient,
  ingredientId: string,
  defaultProductId: string,
): Promise<void> => {
  await supabase.from("ingredients").update({ default_store_product_id: defaultProductId }).eq("id", ingredientId);
};

const upsertTripItemForProduct = async (
  supabase: AnySupabaseClient,
  tripId: string,
  title: string,
  candidate: Candidate,
  canonicalName: string | null,
  log: LogFn,
): Promise<boolean> => {
  if (!candidate.id) {
    log(`[sync] "${title}": missing store_product_id — cannot upsert trip item`, "error", {
      title,
      trip_id: tripId,
      reason: "missing_store_product_id",
    });
    return false;
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
    log(`[sync] "${title}": shopping_trip_items lookup error: ${JSON.stringify(findErr)}`, "error", {
      title,
      trip_id: tripId,
      error: findErr,
    });
    return false;
  }

  if (existing) {
    const row = existing as { id: string; quantity_purchased: number | null };
    const nextQuantity = Math.max(1, Number(row.quantity_purchased ?? 0) + 1);
    const { error: updErr } = await supabase
      .from("shopping_trip_items")
      .update({ quantity_purchased: nextQuantity, ingredient_name: canonicalName ?? title })
      .eq("id", row.id);
    if (updErr) {
      log(`[sync] "${title}": shopping_trip_items quantity update error: ${JSON.stringify(updErr)}`, "error", {
        title,
        trip_id: tripId,
        row_id: row.id,
        error: updErr,
      });
      return false;
    }
    log(`[sync] "${title}": incremented trip quantity to ${nextQuantity}`, "info", {
      title,
      trip_id: tripId,
      shopping_trip_item_id: row.id,
      quantity_purchased: nextQuantity,
    });
    return true;
  }

  const pack = parsePackSize(candidate.size_label);
  const productName = [candidate.brand, candidate.name].filter(Boolean).join(" ").trim() || title;
  const { error: insertErr } = await supabase.from("shopping_trip_items").insert({
    shopping_trip_id: tripId,
    product_name: productName,
    ingredient_name: canonicalName ?? title,
    quantity_purchased: 1,
    pack_quantity: pack?.qty ?? null,
    pack_unit: pack?.unit ?? null,
    store_product_id: candidate.id,
  });
  if (insertErr) {
    log(`[sync] "${title}": shopping_trip_items insert error: ${JSON.stringify(insertErr)}`, "error", {
      title,
      trip_id: tripId,
      error: insertErr,
    });
    return false;
  }
  log(`[sync] "${title}": added to shopping_trip_items (trip=${tripId})`, "info", { title, trip_id: tripId });
  return true;
};

const upsertTripItemByName = async (
  supabase: AnySupabaseClient,
  tripId: string,
  productName: string,
  canonicalName: string | null,
  log: LogFn,
): Promise<boolean> => {
  const ingredientName = canonicalName ?? productName;
  const { data: existing, error: findErr } = await supabase
    .from("shopping_trip_items")
    .select("id, quantity_purchased")
    .eq("shopping_trip_id", tripId)
    .ilike("ingredient_name", ingredientName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) {
    log(`[sync] "${productName}": unenriched trip lookup error: ${JSON.stringify(findErr)}`, "error", {
      product_name: productName,
      trip_id: tripId,
      error: findErr,
    });
    return false;
  }
  if (existing) {
    const row = existing as { id: string; quantity_purchased: number | null };
    const nextQuantity = Math.max(1, Number(row.quantity_purchased ?? 0) + 1);
    const { error: updErr } = await supabase
      .from("shopping_trip_items")
      .update({ quantity_purchased: nextQuantity, ingredient_name: ingredientName })
      .eq("id", row.id);
    if (updErr) {
      log(`[sync] "${productName}": unenriched quantity update error: ${JSON.stringify(updErr)}`, "error", {
        product_name: productName,
        row_id: row.id,
        error: updErr,
      });
      return false;
    }
    return true;
  }

  const { error: insertErr } = await supabase.from("shopping_trip_items").insert({
    shopping_trip_id: tripId,
    product_name: productName,
    ingredient_name: ingredientName,
    quantity_purchased: 1,
    pack_quantity: null,
    pack_unit: null,
    store_product_id: null,
  });
  if (insertErr) {
    log(`[sync] "${productName}": unenriched trip insert error: ${JSON.stringify(insertErr)}`, "error", {
      product_name: productName,
      trip_id: tripId,
      error: insertErr,
    });
    return false;
  }
  log(`[sync] "${productName}": added unenriched shopping_trip_items row (trip=${tripId})`, "info", {
    product_name: productName,
    trip_id: tripId,
  });
  return true;
};

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
  const canonical = await resolveCanonicalIngredient(supabase, productName, log);
  log(`[sync] "${taskTitle}" → "${productName}": canonicalIngredientId=${canonical?.id ?? null}`, "info", {
    store: itemStore,
    title: taskTitle,
    product_name: productName,
    ingredient_id: canonical?.id ?? null,
    canonical_name: canonical?.name ?? null,
  });

  const rawCandidate = await collectCandidate(supabase, productName, itemStore, log, {
    userId: syncUserId ?? undefined,
  });

  if (!rawCandidate) {
    if (!tripId) {
      log(`[sync] "${taskTitle}" → "${productName}": no candidate and no trip`, "warn", {
        store: itemStore,
        product_name: productName,
        reason: "no_candidate_no_trip",
      });
      return false;
    }
    const added = await upsertTripItemByName(supabase, tripId, productName, canonical?.name ?? null, log);
    if (!added) return false;
    log(`[sync] "${taskTitle}" → "${productName}": added without enrichment`, "warn", {
      store: itemStore,
      product_name: productName,
      reason: "unenriched_fallback",
    });
    return true;
  }

  const candidate = await persistCandidate(supabase, rawCandidate, log, {
    userId: syncUserId ?? undefined,
  });
  if (!candidate) {
    log(`[sync] "${taskTitle}" → "${productName}": store product persist failed`, "error", {
      store: itemStore,
      product_name: productName,
      reason: "persist_failed",
    });
    return false;
  }

  if (canonical) await persistIngredientPreferences(supabase, canonical.id, candidate.id);

  const { error: legacyInsertErr } = await supabase.from("shopping_list_items").insert({
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
  if (legacyInsertErr) {
    log(`[sync] "${taskTitle}" → "${productName}": legacy shopping_list_items insert error: ${JSON.stringify(legacyInsertErr)}`, "warn", {
      store: itemStore,
      product_name: productName,
      error: legacyInsertErr,
    });
  }

  if (syncUserId && !tripId) {
    log(`[sync] "${taskTitle}" → "${productName}": no shopping trip available`, "error", {
      store: itemStore,
      product_name: productName,
      reason: "no_trip",
    });
    return false;
  }

  if (tripId) {
    const tripOk = await upsertTripItemForProduct(
      supabase,
      tripId,
      productName,
      candidate,
      canonical?.name ?? null,
      log,
    );
    if (!tripOk) {
      log(`[sync] "${taskTitle}" → "${productName}": failed — trip/shopping write did not complete`, "error", {
        store: itemStore,
        product_name: productName,
        reason: "trip_write_failed",
      });
      return false;
    }
  }

  log(`[sync] "${taskTitle}" → "${productName}": processed OK`, "info", {
    store: itemStore,
    product_name: productName,
  });
  return true;
};

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const runId = crypto.randomUUID();
  const debugLog: string[] = [];
  const dbBuffer: BufferedLog[] = [];

  const log: LogFn = (msg, level = "info", context = null) => {
    console.log(`[${level}] ${msg}`);
    debugLog.push(msg);
    dbBuffer.push({ level, message: msg, context: context ?? null, at: new Date().toISOString() });
  };

  const flushLogs = async () => {
    if (!dbBuffer.length) return;
    const rows = dbBuffer.splice(0).map((entry) => ({
      function_name: FUNCTION_NAME,
      run_id: runId,
      level: entry.level,
      message: entry.message,
      context: entry.context,
      created_at: entry.at,
    }));
    const { error } = await supabase.from("edge_function_logs").insert(rows);
    if (error) console.error(`[edge_function_logs] flush FAILED: ${JSON.stringify(error)}`);
  };

  const respond = async (body: Record<string, unknown>, status = 200) => {
    await flushLogs();
    return new Response(JSON.stringify({ run_id: runId, ...body }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };

  const syncUserId = Deno.env.get("SYNC_USER_ID") ?? null;
  const storeMap = buildStoreAliasMap(log);
  log(`[sync] Starting. SUPABASE_URL set=${!!supabaseUrl} SERVICE_KEY set=${!!supabaseServiceKey} SYNC_USER_ID set=${!!syncUserId}`, "info", {
    supabase_url_set: !!supabaseUrl,
    service_key_set: !!supabaseServiceKey,
    sync_user_id_set: !!syncUserId,
  });

  let token: string;
  try {
    token = await getAccessToken();
    log("[sync] Google auth OK");
  } catch (error) {
    log(`[sync] Google auth FAILED: ${String(error)}`, "error", { error: String(error) });
    return respond({ ok: false, error: "google_auth_failed", debug: debugLog }, 500);
  }

  const taskLists = await getAllTaskLists(token);
  log(`[sync] Found ${taskLists.size} task lists: ${JSON.stringify([...taskLists.keys()])}`, "info", {
    task_list_count: taskLists.size,
    task_lists: [...taskLists.keys()],
  });

  let processed = 0;
  let skipped = 0;
  let purged = 0;

  for (const [listTitle, listId] of taskLists) {
    const listStore = normalizeStoreName(listTitle, storeMap);
    purged += await purgeOldCompletedTasks(token, listId, listStore, log);
    const tasks = await getTasks(token, listId);
    log(`[sync] ${listStore} (list="${listTitle}") tasks found=${tasks.length} titles=${JSON.stringify(tasks.map((t: any) => t.title))}`, "info", {
      list_title: listTitle,
      store: listStore,
      task_count: tasks.length,
    });
    if (!tasks.length) continue;

    const tripIdsByStore = new Map<string, string>();
    const resolveTripId = async (store: string): Promise<string | null> => {
      if (!syncUserId) return null;
      const cached = tripIdsByStore.get(store);
      if (cached) return cached;
      const id = await findOrCreateOpenTrip(supabase, syncUserId, store, log);
      if (id) tripIdsByStore.set(store, id);
      return id;
    };

    for (const task of tasks) {
      const title: string = task?.title ?? "";
      if (!title || !task?.id) {
        skipped++;
        continue;
      }
      const parsed = parseTaskTitle(title, listStore, storeMap);
      if (!parsed.productNames.length) {
        skipped++;
        continue;
      }
      const itemStore = resolveItemStore(parsed, storeMap);
      log(`[sync] Processing task: "${title}" → products=${JSON.stringify(parsed.productNames)} store=${itemStore} (list=${listTitle}, fromTitle=${parsed.storeFromTitle}, id=${task.id})`, "info", {
        list_store: listStore,
        item_store: itemStore,
        title,
        product_names: parsed.productNames,
        task_id: task.id,
      });

      try {
        const tripId = await resolveTripId(itemStore);
        let allOk = true;
        for (const productName of parsed.productNames) {
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

        if (!allOk) {
          skipped += parsed.productNames.length;
          log(`[sync] "${title}": kept in Google Tasks — one or more products failed`, "warn", {
            store: itemStore,
            title,
            reason: "partial_failure",
          });
          continue;
        }

        const deleted = await deleteTask(token, listId, task.id);
        if (!deleted) {
          skipped += parsed.productNames.length;
          log(`[sync] "${title}": writes succeeded but Google Task deletion failed`, "error", {
            store: itemStore,
            title,
            task_id: task.id,
            reason: "google_delete_failed",
          });
          continue;
        }
        processed += parsed.productNames.length;
      } catch (error) {
        skipped += parsed.productNames.length;
        log(`[sync] "${title}": EXCEPTION: ${String(error)}`, "error", {
          store: itemStore,
          title,
          task_id: task.id,
          error: String(error),
        });
      }
    }
  }

  log(`[sync] Done. processed=${processed} skipped=${skipped} purged=${purged}`, "info", { processed, skipped, purged });
  return respond({ ok: true, processed, skipped, purged, debug: debugLog });
});
