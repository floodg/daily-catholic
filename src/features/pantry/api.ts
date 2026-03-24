import { supabase } from '../../lib/supabase';
import type { MeasurementUnitCode } from '../../domain/types';
import { createInventoryTransaction } from '../inventory/api';

export interface PurchaseBreakdown {
  quantity: number;
  product_name: string;
  trip_date: string;
  store: string;
}

export interface PantryItem {
  id: string;
  userId: string;
  ingredientId: string;
  ingredientName: string;
  unit: MeasurementUnitCode;
  remainingQty: number;
  totalPurchased: number;
  lastPurchaseDate?: string;
  autoReorder: boolean;
  purchaseBreakdowns: PurchaseBreakdown[];
}

interface RpcRow {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  remaining: number;
  total_purchased: number;
  auto_reorder: boolean;
  last_purchase_date: string | null;
  purchase_breakdowns: PurchaseBreakdown[];
}

async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

function rpcToDomain(userId: string, row: RpcRow): PantryItem {
  const id = `${row.ingredient_id}|${row.unit}`;
  const breakdowns = Array.isArray(row.purchase_breakdowns) ? row.purchase_breakdowns : [];
  return {
    id,
    userId,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    unit: row.unit as MeasurementUnitCode,
    remainingQty: Number(row.remaining ?? 0),
    totalPurchased: Number(row.total_purchased ?? 0),
    lastPurchaseDate: row.last_purchase_date ?? undefined,
    autoReorder: Boolean(row.auto_reorder),
    purchaseBreakdowns: breakdowns,
  };
}

export async function getPantryItems(): Promise<PantryItem[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.rpc('get_pantry_items_from_inventory', {
    p_user_id: userId,
  });
  if (error) throw error;
  const rows: RpcRow[] = Array.isArray(data) ? data : [];
  return rows.map((row) => rpcToDomain(userId, row)).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
}

async function ensureIngredientExists(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Ingredient name is required.');
  const { data } = await supabase.from('ingredients').select('id').eq('name', trimmed).maybeSingle();
  if (data) return;
  await supabase
    .from('ingredients')
    .insert({ name: trimmed, optional: false, pantry_staple: false });
}

/**
 * Add stock using linked product pack sizes.
 */
export async function addStockByPacks(ingredientName: string, packs: number): Promise<void> {
  if (!(packs > 0)) throw new Error('Pack count must be greater than zero.');
  const userId = await getCurrentUserId();
  await ensureIngredientExists(ingredientName);

  const { data: ing } = await supabase
    .from('ingredients')
    .select('id')
    .eq('name', ingredientName.trim())
    .maybeSingle();
  if (!ing) throw new Error('Ingredient not found.');

  const { data: link, error: linkErr } = await supabase
    .from('store_products')
    .select('id, pack_size_g, pack_size_ml, pack_size_units')
    .eq('user_id', userId)
    .eq('ingredient_id', ing.id)
    .maybeSingle();

  if (linkErr || !link) {
    throw new Error('No linked product found. Please link a product or enter a quantity directly.');
  }

  const packG = (link as { pack_size_g?: number }).pack_size_g;
  const packMl = (link as { pack_size_ml?: number }).pack_size_ml;
  const packUnits = (link as { pack_size_units?: number }).pack_size_units;

  let unit: MeasurementUnitCode;
  let unitQty: number;
  if (packG && packG > 0) {
    unit = 'g';
    unitQty = packG;
  } else if (packMl && packMl > 0) {
    unit = 'ml';
    unitQty = packMl;
  } else if (packUnits && packUnits > 0) {
    unit = 'units';
    unitQty = packUnits;
  } else {
    throw new Error('Linked product has no valid pack size.');
  }

  const quantityDelta = packs * unitQty;
  await createInventoryTransaction({
    userId,
    ingredientName: ingredientName.trim(),
    quantityDelta,
    unit,
    transactionType: 'purchase',
  });
}

export async function addStockByIngredientProduct(
  ingredientName: string,
  storeProductId: string,
  packs: number
): Promise<void> {
  if (!(packs > 0)) throw new Error('Pack count must be greater than zero.');
  const userId = await getCurrentUserId();
  await ensureIngredientExists(ingredientName);

  const { data: product, error } = await supabase
    .from('store_products')
    .select('id, size_value, size_unit_code, pack_size_g, pack_size_ml, pack_size_units')
    .eq('id', storeProductId)
    .maybeSingle();
  if (error || !product) throw new Error('Selected product is unavailable.');

  let unit: MeasurementUnitCode | null = null;
  let unitQty = 0;

  const sizeValue = Number((product as any).size_value ?? 0);
  const sizeUnitCode = ((product as any).size_unit_code ?? '').toLowerCase();
  if (sizeValue > 0 && sizeUnitCode) {
    if (sizeUnitCode === 'kg') {
      unit = 'g';
      unitQty = sizeValue * 1000;
    } else if (sizeUnitCode === 'g') {
      unit = 'g';
      unitQty = sizeValue;
    } else if (sizeUnitCode === 'l') {
      unit = 'ml';
      unitQty = sizeValue * 1000;
    } else if (sizeUnitCode === 'ml') {
      unit = 'ml';
      unitQty = sizeValue;
    } else if (sizeUnitCode === 'units') {
      unit = 'units';
      unitQty = sizeValue;
    }
  }

  if (!unit || !(unitQty > 0)) {
    const packG = Number((product as any).pack_size_g ?? 0);
    const packMl = Number((product as any).pack_size_ml ?? 0);
    const packUnits = Number((product as any).pack_size_units ?? 0);
    if (packG > 0) {
      unit = 'g';
      unitQty = packG;
    } else if (packMl > 0) {
      unit = 'ml';
      unitQty = packMl;
    } else if (packUnits > 0) {
      unit = 'units';
      unitQty = packUnits;
    }
  }

  if (!unit || !(unitQty > 0)) {
    throw new Error('Selected product has no usable pack size.');
  }

  await createInventoryTransaction({
    userId,
    ingredientName: ingredientName.trim(),
    quantityDelta: packs * unitQty,
    unit,
    transactionType: 'purchase',
  });
}

/**
 * Add stock directly with a numeric quantity (no linked product).
 */
export async function addStockDirect(
  ingredientName: string,
  unit: MeasurementUnitCode,
  quantity: number
): Promise<void> {
  if (!(quantity > 0)) throw new Error('Quantity must be greater than zero.');
  const userId = await getCurrentUserId();
  await ensureIngredientExists(ingredientName);

  await createInventoryTransaction({
    userId,
    ingredientName: ingredientName.trim(),
    quantityDelta: quantity,
    unit,
    transactionType: 'purchase',
  });
}

export async function setAutoReorder(
  ingredientName: string,
  unit: MeasurementUnitCode,
  enabled: boolean
): Promise<void> {
  const userId = await getCurrentUserId();
  const trimmed = ingredientName.trim();
  if (!trimmed) throw new Error('Ingredient name is required.');

  const { error } = await supabase.from('pantry_preferences').upsert(
    {
      user_id: userId,
      ingredient_name: trimmed,
      unit_code: unit,
      auto_reorder: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,ingredient_name,unit_code' }
  );
  if (error) throw error;
}
