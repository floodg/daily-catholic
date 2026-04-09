import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type AnalyzeImage = {
  mimeType: string;
  base64: string;
};

type AnalyzeRequest = {
  action: "analyze";
  images: AnalyzeImage[];
};

type ApplyRequest = {
  action: "apply";
  names: string[];
};

type ScanRequest = AnalyzeRequest | ApplyRequest;

type ScanBuckets = {
  missing: string[];
  low: string[];
  sufficient: string[];
  unknown: string[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function normalizeBuckets(input: ScanBuckets, allowList: string[]): ScanBuckets {
  const allowByExact = new Map<string, string>();
  const normalizedAllow = allowList.map((name) => {
    const normalized = normalizeText(name);
    allowByExact.set(normalized, name);
    return { normalized, canonical: name };
  });

  const resolveName = (rawName: string): string | null => {
    const normalized = normalizeText(rawName);
    if (!normalized) return null;

    const exact = allowByExact.get(normalized);
    if (exact) return exact;

    let best: { canonical: string; score: number } | null = null;
    for (const candidate of normalizedAllow) {
      const distance = levenshtein(normalized, candidate.normalized);
      const maxLen = Math.max(normalized.length, candidate.normalized.length);
      const score = maxLen === 0 ? 0 : distance / maxLen;
      if (!best || score < best.score) {
        best = { canonical: candidate.canonical, score };
      }
    }
    if (!best) return null;
    return best.score <= 0.34 ? best.canonical : null;
  };

  const bucket = (values: string[]): string[] => {
    const set = new Set<string>();
    for (const value of values) {
      const resolved = resolveName(value);
      if (resolved) set.add(resolved);
    }
    return Array.from(set);
  };

  const missing = bucket(input.missing);
  const low = bucket(input.low);
  const sufficient = bucket(input.sufficient);
  const unknown = bucket(input.unknown);

  const missingSet = new Set(missing);
  const lowSet = new Set(low);
  const sufficientSet = new Set(sufficient);

  return {
    missing: missing.filter((x) => !lowSet.has(x) && !sufficientSet.has(x)),
    low: low.filter((x) => !sufficientSet.has(x)),
    sufficient,
    unknown: unknown.filter((x) => !missingSet.has(x) && !lowSet.has(x) && !sufficientSet.has(x)),
  };
}

async function fetchAllowList(supabase: ReturnType<typeof createClient>, userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("meal_plan_required_ingredients_for_week", {
    p_user_id: userId,
  });
  if (error) throw new Error(`Failed to load meal-plan ingredients: ${error.message}`);
  return ((data ?? []) as Array<{ display_name: string }>)
    .map((row) => row.display_name?.trim())
    .filter((name): name is string => Boolean(name));
}

function sanitizeBuckets(data: unknown): ScanBuckets {
  const obj = (data ?? {}) as Record<string, unknown>;
  const ensureArray = (key: keyof ScanBuckets) => {
    const source = obj[key];
    if (!Array.isArray(source)) return [];
    return source
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  };

  return {
    missing: ensureArray("missing"),
    low: ensureArray("low"),
    sufficient: ensureArray("sufficient"),
    unknown: ensureArray("unknown"),
  };
}

async function callGemini(images: AnalyzeImage[], allowList: string[]): Promise<ScanBuckets> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const prompt = [
    "You are a kitchen inventory assistant for a keto meal planning app.",
    "",
    "This week's meal plan requires these ingredients:",
    ...allowList.map((name) => `- ${name}`),
    "",
    "Analyse the provided image(s) of the user's fridge and cupboards.",
    "",
    "For each required ingredient, determine if it is:",
    '- "missing": not visible at all',
    '- "low": visible but quantity looks less than ~25% full / only a small amount remains',
    '- "sufficient": clearly enough for the week',
    '- "unknown": cannot confidently assess from images',
    "",
    "Use EXACT ingredient names from the list above whenever possible.",
    "Respond ONLY with valid JSON in this format:",
    '{ "missing": [], "low": [], "sufficient": [], "unknown": [] }',
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...images.map((image) => ({
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.base64,
                },
              })),
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${bodyText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.find((part: any) => typeof part?.text === "string")?.text;
  if (!text) throw new Error("Gemini response did not include JSON text");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned non-JSON content");
  }

  return sanitizeBuckets(parsed);
}

async function applySuggestions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  names: string[]
): Promise<{ added: number; skipped: number; insertedNames: string[] }> {
  if (names.length === 0) return { added: 0, skipped: 0, insertedNames: [] };

  const normalizedNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (normalizedNames.length === 0) return { added: 0, skipped: 0, insertedNames: [] };

  const { data: existingRows, error: existingError } = await supabase
    .from("shopping_list")
    .select("ingredient_name")
    .eq("user_id", userId)
    .eq("is_checked", false);
  if (existingError) throw new Error(`Failed to check duplicates: ${existingError.message}`);

  const existingSet = new Set(
    ((existingRows ?? []) as Array<{ ingredient_name: string }>)
      .map((row) => normalizeText(row.ingredient_name))
  );

  const toInsertNames = normalizedNames.filter((name) => !existingSet.has(normalizeText(name)));
  if (toInsertNames.length === 0) {
    return { added: 0, skipped: normalizedNames.length, insertedNames: [] };
  }

  const payload = toInsertNames.map((name) => ({
    user_id: userId,
    ingredient_name: name,
    source: "kitchen_scan",
    is_checked: false,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("shopping_list")
    .insert(payload)
    .select("ingredient_name");
  if (insertError) throw new Error(`Failed to insert shopping list rows: ${insertError.message}`);

  const insertedNames = ((insertedRows ?? []) as Array<{ ingredient_name: string }>).map((r) => r.ingredient_name);
  return {
    added: insertedNames.length,
    skipped: normalizedNames.length - insertedNames.length,
    insertedNames,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return json(500, { error: "Supabase env is not configured" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization header" });

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Unauthorized" });

  let body: ScanRequest;
  try {
    body = (await req.json()) as ScanRequest;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const allowList = await fetchAllowList(supabase, authData.user.id);

  if (body.action === "analyze") {
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0) return json(400, { error: "At least one image is required" });
    if (images.length > 3) return json(400, { error: "Maximum of 3 images is allowed" });

    const validImages = images.filter((img) => img && typeof img.mimeType === "string" && typeof img.base64 === "string");
    if (validImages.length !== images.length) return json(400, { error: "Invalid image payload" });
    if (allowList.length === 0) {
      return json(200, {
        missing: [],
        low: [],
        sufficient: [],
        unknown: [],
        unknownCount: 0,
        message: "No meal-plan ingredients found for this week.",
      });
    }

    try {
      const aiBuckets = await callGemini(validImages, allowList);
      const normalized = normalizeBuckets(aiBuckets, allowList);
      return json(200, {
        ...normalized,
        unknownCount: normalized.unknown.length,
      });
    } catch (error) {
      console.error(error);
      return json(502, { error: "Failed to analyze kitchen images" });
    }
  }

  if (body.action === "apply") {
    const requestedNames = Array.isArray(body.names) ? body.names : [];
    const allowSet = new Set(allowList.map((name) => normalizeText(name)));
    const validatedNames = requestedNames
      .map((name) => String(name ?? "").trim())
      .filter((name) => allowSet.has(normalizeText(name)));

    try {
      const result = await applySuggestions(supabase, authData.user.id, validatedNames);
      return json(200, result);
    } catch (error) {
      console.error(error);
      return json(500, { error: "Failed to apply shopping list suggestions" });
    }
  }

  return json(400, { error: "Invalid action" });
});
