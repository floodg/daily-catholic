/**
 * Utilities for parsing and formatting ingredient quantity strings.
 *
 * Quantities in meal ingredients are stored as plain strings (e.g. "500g",
 * "1.5 kg", "2 cups").  These helpers allow us to parse them into numeric
 * values so that inventory stock levels can be subtracted from the total
 * meal demand to produce the final shopping list.
 */

export interface ParsedQuantity {
  amount: number;
  /** Canonical (normalised) unit string, e.g. "g", "ml", "cup", "units". */
  unit: string;
}

/** Convert a raw unit string to its canonical abbreviation. */
export function normalizeUnit(raw: string): ParsedQuantity['unit'] {
  const u = raw.toLowerCase().trim();
  if (u === "gram" || u === "grams" || u === "g") return "g";
  if (u === "kilogram" || u === "kilograms" || u === "kg") return "kg";
  if (u === "milliliter" || u === "milliliters" || u === "millilitre" || u === "millilitres" || u === "ml") return "ml";
  if (u === "liter" || u === "liters" || u === "litre" || u === "litres" || u === "l") return "l";
  if (u === "unit" || u === "units" || u === "piece" || u === "pieces" || u === "pcs") return "units";
  if (u === "cup" || u === "cups") return "cup";
  if (u === "tablespoon" || u === "tablespoons" || u === "tbsp") return "tbsp";
  if (u === "teaspoon" || u === "teaspoons" || u === "tsp") return "tsp";
  return u;
}

/** Convert amount + unit to a base SI unit (g for mass, ml for volume).
 * Approximations:
 * - 1 tsp  ≈ 5 g
 * - 1 tbsp ≈ 15 g
 * - 1 cup  ≈ 240 ml
 */
export function toBaseUnit(amount: number, unit: string): ParsedQuantity {
  const n = normalizeUnit(unit);
  if (n === "kg") return { amount: amount * 1000, unit: "g" };
  if (n === "l") return { amount: amount * 1000, unit: "ml" };
  if (n === "tsp") return { amount: amount * 5, unit: "g" };
  if (n === "tbsp") return { amount: amount * 15, unit: "g" };
  if (n === "cup") return { amount: amount * 240, unit: "ml" };
  return { amount, unit: n };
}

/**
 * Parse a quantity string (e.g. "500g", "1.5 kg", "2 cups") into a numeric
 * amount and a canonical unit.  Returns `null` when the string cannot be
 * parsed or is empty.
 *
 * Handles:
 * - Bare numbers: "0.5" → {amount: 0.5, unit: "units"}
 * - Ranges with hyphen or en-dash: "4-6" or "4–6" → lower bound {amount: 4, unit: "units"}
 * - Number + unit: "500g", "1.5 kg", "2 cups", "1 tbsp", "0.5 tsp"
 */
export function parseQuantity(q: string | undefined): ParsedQuantity | null {
  if (!q) return null;
  const trimmed = q.trim();
  // Collapse dash/en-dash ranges to their lower bound before further parsing.
  // Matches: <number>[whitespace][-–][whitespace]<number>, keeps first number.
  const rangeStripped = trimmed.replace(
    /^([+-]?\d+(?:\.\d+)?)\s*[–\-]\s*\d+(?:\.\d+)?/,
    "$1"
  );
  // Match an optional sign, a number (integer or decimal), optional
  // whitespace, and an optional unit label.
  const match = rangeStripped.match(/^([+-]?\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const rawUnit = match[2] || "units";
  const base = toBaseUnit(amount, rawUnit);
  return {
    amount: base.amount,
    unit: base.unit as ParsedQuantity['unit'],
  };
}

/**
 * Free-text quantity strings that represent an unmeasured or discretionary
 * amount.  These should be silently skipped rather than surfaced as phantom
 * shopping-list items.
 *
 * Matches: "to taste", "optional", "as desired", "as needed", "pinch",
 * "to serve", "small", "large", "medium", "1 serving", "2 servings", etc.
 */
const UNMEASURED_RE =
  /^(to taste|optional|as desired|as needed|pinch|to serve|small|large|medium|\d+\s*servings?)$/i;

export function isUnmeasuredQuantity(q: string): boolean {
  return UNMEASURED_RE.test(q.trim());
}

/**
 * Format a (amount, unit) pair back into a human-readable string.
 * Amounts are rounded to at most two decimal places.
 */
export function formatQuantity(amount: number, unit: string): string {
  const rounded = Math.round(amount * 100) / 100;
  if (unit === "units") return `${rounded}`;
  // Add a space before named cooking measures for readability
  if (unit === "cup" || unit === "tbsp" || unit === "tsp") return `${rounded} ${unit}`;
  return `${rounded}${unit}`;
}
