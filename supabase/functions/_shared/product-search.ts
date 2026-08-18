import type { LogFn } from "./product-enrichment.ts";

const LEADING_QUANTITY_PATTERN = /^\s*(?:(?:\d+(?:\.\d+)?)\s*(?:kg|g|l|ml|pack|pk|pkt|packs|units?|each|ea)\b\s*(?:of\s+)?)+/i;
const MULTIPACK_PATTERN = /^\s*\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:kg|g|l|ml)\b\s*/i;

export const normalizeProductSearchTerm = (value: string): string => {
  let normalized = value.trim();
  if (!normalized) return "";

  normalized = normalized.replace(MULTIPACK_PATTERN, "");
  normalized = normalized.replace(LEADING_QUANTITY_PATTERN, "");
  normalized = normalized.replace(/^\s*(?:of\s+)+/i, "");
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized || value.trim();
};

export const buildProductSearchVariants = (value: string): string[] => {
  const normalized = normalizeProductSearchTerm(value);
  const variants = new Set<string>([normalized]);

  const minceMatch = normalized.match(/^(.+?)\s+mince$/i);
  if (minceMatch) variants.add(`minced ${minceMatch[1].trim()}`);

  const mincedMatch = normalized.match(/^minced\s+(.+)$/i);
  if (mincedMatch) variants.add(`${mincedMatch[1].trim()} mince`);

  return [...variants].filter(Boolean);
};

export const logSearchNormalization = (
  original: string,
  normalized: string,
  store: string,
  log: LogFn,
) => {
  if (original.trim() === normalized.trim()) return;
  log(
    `[product-search] normalized "${original}" → "${normalized}"`,
    "info",
    { store, original_product_name: original, search_term: normalized },
  );
};
