import { supabase } from '../../lib/supabase';
import type { InventoryTransaction, InventoryTransactionType } from '../../domain/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type IngredientIdAndName = { ingredientId: string; canonicalName: string };

async function getCurrentUserId(): Promise<string> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

/** Normalise a raw unit string to its canonical abbreviation, for aggregation. */
function normalizeInventoryUnit(raw: string): string {
  const u = raw.toLowerCase().trim();
  if (u === "gram" || u === "grams" || u === "g") return "g";
  if (u === "kilogram" || u === "kilograms" || u === "kg") return "kg";
  if (u === "milliliter" || u === "milliliters" || u === "millilitre" || u === "millilitres" || u === "ml") return "ml";
  if (u === "liter" || u === "liters" || u === "litre" || u === "litres" || u === "l") return "l";
  if (u === "unit" || u === "units" || u === "piece" || u === "pieces" || u === "pcs") return "units";
  return u;
}

async function resolveIngredientIdAndCanonicalName(
  rawName: string,
  opts: { createIfMissing: boolean }
): Promise<IngredientIdAndName> {
  const name = rawName.trim();
  if (!name) throw new Error('Ingredient name is required.');

  const { data: rows, error } = await supabase
    .from('ingredients')
    .select('id, name')
    // Exact, case-insensitive match (no wildcards supplied)
    .ilike('name', name);
  if (error) throw error;

  const matches = Array.isArray(rows) ? (rows as { id: string; name: string }[]) : [];
  if (matches.length > 0) {
    const exact = matches.find(r => r.name === name);
    const canonical = exact ?? matches.sort((a, b) => a.name.localeCompare(b.name))[0];
    return { ingredientId: canonical.id, canonicalName: canonical.name };
  }

  if (!opts.createIfMissing) {
    throw new Error('Ingredient not found.');
  }

  const { error: insertErr } = await supabase
    .from('ingredients')
    .insert({ name, optional: false, pantry_staple: false });
  if (insertErr) throw insertErr;

  const { data: rows2, error: rowsErr } = await supabase
    .from('ingredients')
    .select('id, name')
    .ilike('name', name);
  if (rowsErr) throw rowsErr;

  const matches2 = Array.isArray(rows2) ? (rows2 as { id: string; name: string }[]) : [];
  const canonical = matches2.sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!canonical) throw new Error('Ingredient not found after insert.');
  return { ingredientId: canonical.id, canonicalName: canonical.name };
}

async function resolveIngredientId(
  rawName: string
): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;

  const { data: rows, error } = await supabase
    .from('ingredients')
    .select('id')
    .ilike('name', name);
  if (error) throw error;
  const matches = Array.isArray(rows) ? (rows as { id: string }[]) : [];
  if (matches.length === 0) return null;
  // Prefer exact-case match when possible by reusing canonical selection logic.
  const exact = matches.find(r => r.id != null);
  return (exact ?? matches[0]).id;
}

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface DbInventoryTransaction {
  id: string;
  user_id: string;
  ingredient_name: string;
  ingredient_id?: string | null;
  quantity_delta: number;
  unit: string | null;
  unit_code: string | null;
  transaction_type: string;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string;
  created_at: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function dbToDomain(row: DbInventoryTransaction): InventoryTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    ingredientName: row.ingredient_name,
    quantityDelta: row.quantity_delta,
    unit: (row.unit_code ?? row.unit ?? undefined) ?? undefined,
    transactionType: row.transaction_type as InventoryTransactionType,
    sourceType: row.source_type ?? undefined,
    sourceId: row.source_id ?? undefined,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CreateInventoryTransactionInput {
  userId: string;
  ingredientName: string;
  quantityDelta: number;
  unit?: string;
  transactionType: InventoryTransactionType;
  sourceType?: string;
  sourceId?: string;
  occurredAt?: string;
}

/**
 * Record a new inventory transaction (purchase, meal consumption, waste, or manual adjustment).
 */
export async function createInventoryTransaction(
  input: CreateInventoryTransactionInput
): Promise<InventoryTransaction> {
  const { ingredientId, canonicalName } = await resolveIngredientIdAndCanonicalName(input.ingredientName, { createIfMissing: true });

  const { data, error } = await supabase
    .from('inventory_transactions')
    .insert({
      user_id: input.userId,
      ingredient_id: ingredientId,
      ingredient_name: canonicalName,
      quantity_delta: input.quantityDelta,
      unit: input.unit ?? null,
      unit_code: input.unit ? normalizeInventoryUnit(input.unit) : 'units',
      transaction_type: input.transactionType,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      occurred_at: input.occurredAt,
    })
    .select()
    .single();

  if (error) throw error;
  return dbToDomain(data as DbInventoryTransaction);
}

/**
 * Fetch all inventory transactions for the current user, ordered most-recent first.
 */
export async function getInventoryTransactions(): Promise<InventoryTransaction[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false });

  if (error) throw error;
  return (data as DbInventoryTransaction[]).map(dbToDomain);
}

/**
 * Fetch inventory transactions for a specific ingredient.
 */
export async function getTransactionsForIngredient(
  ingredientName: string
): Promise<InventoryTransaction[]> {
  const userId = await getCurrentUserId();
  const ingredientId = await resolveIngredientId(ingredientName);
  if (!ingredientId) return [];

  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('ingredient_id', ingredientId)
    .order('occurred_at', { ascending: false });

  if (error) throw error;
  return (data as DbInventoryTransaction[]).map(dbToDomain);
}

/**
 * Calculate the current stock level for each ingredient by summing all deltas,
 * broken down by unit.
 *
 * Returns a nested map:
 *   lowercase(ingredient_name) → normalised_unit → current_quantity
 *
 * Unit keys are normalised (via the same rules as `quantityUtils.normalizeUnit`)
 * so that they can be matched directly against parsed ingredient quantities.
 * A null unit in the database is represented as an empty string "".
 */
export async function getIngredientStockLevels(): Promise<Record<string, Record<string, number>>> {
  const userId = await getCurrentUserId();
  // inventory_stock_levels is built per-user, but we still filter by user_id
  // here to guarantee isolation if the view/query shape evolves.
  const { data: scopedData, error: scopedErr } = await supabase
    .from('inventory_stock_levels')
    .select('ingredient_name, unit, current_quantity')
    .eq('user_id', userId)
    .gt('current_quantity', 0);

  if (scopedErr) throw scopedErr;

  const stock: Record<string, Record<string, number>> = {};
  for (const row of scopedData as { ingredient_name: string; unit: string | null; current_quantity: number }[]) {
    // `inventory_stock_levels` now groups by `ingredient_id` and returns a canonical
    // `ingredient_name` casing from `public.ingredients`, so we preserve it for display.
    const key = row.ingredient_name;
    // Normalise unit so it can be matched against parsed ingredient quantities.
    const unit = row.unit ? normalizeInventoryUnit(row.unit) : "";
    if (!stock[key]) stock[key] = {};
    // Sum across unit variants for the same ingredient.
    stock[key][unit] = (stock[key][unit] ?? 0) + row.current_quantity;
  }
  return stock;
}
