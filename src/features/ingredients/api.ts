import { supabase } from '../../lib/supabase';
import type { MeasurementUnitCode } from '../../domain/types';

export interface IngredientFlagsInput {
  name: string;
  optional?: boolean;
  pantryStaple?: boolean;
}

/**
 * Create or update ingredient flags in the global catalog.
 * Uses the unique constraint on `name` to upsert.
 */
export async function upsertIngredientFlags(
  inputs: IngredientFlagsInput[]
): Promise<void> {
  if (inputs.length === 0) return;
  const rows = inputs.map(i => ({
    name: i.name,
    optional: i.optional ?? false,
    pantry_staple: i.pantryStaple ?? false,
  }));
  const { error } = await supabase
    .from('ingredients')
    .upsert(rows, { onConflict: 'name' });
  if (error) throw error;
}

// ─── Ingredients catalog (pantry management) ─────────────────────────────────

export interface IngredientCatalog {
  id: string;
  name: string;
  optional: boolean;
  pantryStaple: boolean;
  defaultStoreProductId: string | null;
  defaultStoreProductName: string | null;
  defaultStoreProductStore: string | null;
  defaultStoreProductUrl: string | null;
  /** Structured size for default product, if available */
  defaultStoreProductSizeValue: number | null;
  defaultStoreProductUnitCode: string | null;
  alternativeStoreProducts: IngredientProductPreference[];
  createdAt: string;
}

export interface IngredientProductPreference {
  storeProductId: string;
  isDefault: boolean;
  sortOrder: number;
  name: string;
  brand: string | null;
  store: string;
  productUrl: string | null;
  sizeLabel: string | null;
  sizeValue: number | null;
  sizeUnitCode: string | null;
}

/** Supabase may return the FK relation as a single object or a one-element array */
type StoreProductRef = {
  name: string;
  brand?: string | null;
  store: string;
  product_url: string | null;
  size_label?: string | null;
  size_value?: number | null;
  size_unit_code?: string | null;
};

interface DbRow {
  id: string;
  name: string;
  optional: boolean;
  pantry_staple: boolean;
  default_store_product_id: string | null;
  created_at: string;
  store_products?: StoreProductRef | StoreProductRef[] | null;
}

interface DbIngredientProductOptionRow {
  ingredient_id: string;
  store_product_id: string;
  sort_order: number;
  store_products: {
    name: string;
    brand: string | null;
    store: string;
    product_url: string | null;
    size_label: string | null;
    size_value: number | null;
    size_unit_code: string | null;
  } | Array<{
    name: string;
    brand: string | null;
    store: string;
    product_url: string | null;
    size_label: string | null;
    size_value: number | null;
    size_unit_code: string | null;
  }> | null;
}

function dbToPreference(row: DbIngredientProductOptionRow): IngredientProductPreference | null {
  const product = Array.isArray(row.store_products)
    ? row.store_products[0] ?? null
    : row.store_products;
  if (!product) return null;
  return {
    storeProductId: row.store_product_id,
    isDefault: false,
    sortOrder: row.sort_order,
    name: product.name,
    brand: product.brand,
    store: product.store,
    productUrl: product.product_url,
    sizeLabel: product.size_label,
    sizeValue: product.size_value,
    sizeUnitCode: product.size_unit_code,
  };
}

function getStoreProductRef(row: DbRow): StoreProductRef | null {
  const sp = row.store_products;
  if (!sp) return null;
  return Array.isArray(sp) ? sp[0] ?? null : sp;
}

function dbToCatalog(row: DbRow): IngredientCatalog {
  const ref = getStoreProductRef(row);
  const defaultLabel = [ref?.brand ?? null, ref?.name ?? null].filter(Boolean).join(' ');
  return {
    id: row.id,
    name: row.name,
    optional: row.optional,
    pantryStaple: row.pantry_staple,
    defaultStoreProductId: row.default_store_product_id,
    defaultStoreProductName: defaultLabel || null,
    defaultStoreProductStore: ref?.store ?? null,
    defaultStoreProductUrl: ref?.product_url ?? null,
    defaultStoreProductSizeValue: ref?.size_value ?? null,
    defaultStoreProductUnitCode: ref?.size_unit_code ?? null,
    alternativeStoreProducts: [],
    createdAt: row.created_at,
  };
}

async function getIngredientPreferencesMapByIds(
  ingredientIds: string[]
): Promise<Map<string, IngredientProductPreference[]>> {
  if (ingredientIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('ingredient_store_product_options')
    .select(`
      ingredient_id,
      store_product_id,
      sort_order,
      store_products:store_product_id (
        name, brand, store, product_url, size_label, size_value, size_unit_code
      )
    `)
    .in('ingredient_id', ingredientIds)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as DbIngredientProductOptionRow[];
  const map = new Map<string, IngredientProductPreference[]>();
  for (const row of rows) {
    const preference = dbToPreference(row);
    if (!preference) continue;
    const list = map.get(row.ingredient_id) ?? [];
    list.push(preference);
    map.set(row.ingredient_id, list);
  }
  return map;
}

function applyPreferenceOverride(
  catalog: IngredientCatalog,
  preferences: IngredientProductPreference[]
): IngredientCatalog {
  const sorted = [...preferences].sort((a, b) => a.sortOrder - b.sortOrder);
  const fallbackDefault = catalog.defaultStoreProductId
    ? sorted.find(p => p.storeProductId === catalog.defaultStoreProductId) ?? null
    : null;
  const defaultProduct = fallbackDefault ?? null;
  if (!defaultProduct && preferences.length === 0) return catalog;
  return {
    ...catalog,
    defaultStoreProductId: defaultProduct?.storeProductId ?? catalog.defaultStoreProductId,
    defaultStoreProductName: defaultProduct
      ? [defaultProduct.brand, defaultProduct.name].filter(Boolean).join(' ')
      : catalog.defaultStoreProductName,
    defaultStoreProductStore: defaultProduct?.store ?? catalog.defaultStoreProductStore,
    defaultStoreProductUrl: defaultProduct?.productUrl ?? catalog.defaultStoreProductUrl,
    defaultStoreProductSizeValue: defaultProduct?.sizeValue ?? catalog.defaultStoreProductSizeValue,
    defaultStoreProductUnitCode: defaultProduct?.sizeUnitCode ?? catalog.defaultStoreProductUnitCode,
    alternativeStoreProducts: sorted.filter(p => p.storeProductId !== (defaultProduct?.storeProductId ?? catalog.defaultStoreProductId)),
  };
}

export async function getIngredientsCatalog(): Promise<IngredientCatalog[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select(`
      id,
      name,
      optional,
      pantry_staple,
      default_store_product_id,
      created_at,
      store_products:default_store_product_id ( name, brand, store, product_url, size_label, size_value, size_unit_code )
    `)
    .order('name', { ascending: true });

  if (error) throw error;
  const base = (data as unknown as DbRow[]).map(dbToCatalog).map(item => ({
    ...item,
    alternativeStoreProducts: [] as IngredientProductPreference[],
  }));
  const preferenceMap = await getIngredientPreferencesMapByIds(base.map(i => i.id));
  return base.map(item => applyPreferenceOverride(item, preferenceMap.get(item.id) ?? []));
}

export async function createIngredient(payload: {
  name: string;
  optional?: boolean;
  pantryStaple?: boolean;
  defaultStoreProductId?: string | null;
}): Promise<IngredientCatalog> {
  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      name: payload.name.trim(),
      optional: payload.optional ?? false,
      pantry_staple: payload.pantryStaple ?? false,
      default_store_product_id: payload.defaultStoreProductId ?? null,
    })
    .select(`
      id,
      name,
      optional,
      pantry_staple,
      default_store_product_id,
      created_at,
      store_products:default_store_product_id ( name, brand, store, product_url, size_label, size_value, size_unit_code )
    `)
    .single();

  if (error) throw error;
  return {
    ...dbToCatalog(data as unknown as DbRow),
    alternativeStoreProducts: [],
  };
}

export async function updateIngredient(payload: {
  id: string;
  name: string;
  optional?: boolean;
  pantryStaple?: boolean;
  defaultStoreProductId?: string | null;
}): Promise<IngredientCatalog> {
  const { data, error } = await supabase
    .from('ingredients')
    .update({
      name: payload.name.trim(),
      optional: payload.optional ?? false,
      pantry_staple: payload.pantryStaple ?? false,
      default_store_product_id: payload.defaultStoreProductId ?? null,
    })
    .eq('id', payload.id)
    .select(`
      id,
      name,
      optional,
      pantry_staple,
      default_store_product_id,
      created_at,
      store_products:default_store_product_id ( name, brand, store, product_url, size_label, size_value, size_unit_code )
    `)
    .single();

  if (error) throw error;
  return {
    ...dbToCatalog(data as unknown as DbRow),
    alternativeStoreProducts: [],
  };
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) throw error;
}

export async function saveIngredientProductPreferences(payload: {
  ingredientId: string;
  defaultStoreProductId: string | null;
  alternativeStoreProductIds: string[];
}): Promise<void> {
  const uniqueAlternatives = Array.from(new Set(payload.alternativeStoreProductIds))
    .filter(id => id !== payload.defaultStoreProductId);

  const { error: deleteError } = await supabase
    .from('ingredient_store_product_options')
    .delete()
    .eq('ingredient_id', payload.ingredientId);
  if (deleteError) throw deleteError;

  const rows: Array<{
    ingredient_id: string;
    store_product_id: string;
    sort_order: number;
  }> = [];

  uniqueAlternatives.forEach((storeProductId, index) => {
    rows.push({
      ingredient_id: payload.ingredientId,
      store_product_id: storeProductId,
      sort_order: index,
    });
  });

  if (rows.length === 0) return;

  const { error: insertError } = await supabase
    .from('ingredient_store_product_options')
    .insert(rows);
  if (insertError) throw insertError;
}

export async function getIngredientProductPreferences(ingredientId: string): Promise<IngredientProductPreference[]> {
  const map = await getIngredientPreferencesMapByIds([ingredientId]);
  return map.get(ingredientId) ?? [];
}

export interface IngredientPreferredProduct {
  ingredientId: string;
  ingredientName: string;
  product: IngredientProductPreference | null;
  alternatives: IngredientProductPreference[];
}

function toBaseUnit(
  sizeValue: number,
  sizeUnitCode: string
): { qty: number; unit: MeasurementUnitCode } | null {
  if (sizeUnitCode === 'kg') return { qty: sizeValue * 1000, unit: 'g' };
  if (sizeUnitCode === 'g') return { qty: sizeValue, unit: 'g' };
  if (sizeUnitCode === 'l') return { qty: sizeValue * 1000, unit: 'ml' };
  if (sizeUnitCode === 'ml') return { qty: sizeValue, unit: 'ml' };
  if (sizeUnitCode === 'units') return { qty: sizeValue, unit: 'units' };
  return null;
}

export async function resolvePreferredProductsForIngredientNames(
  ingredientNames: string[]
): Promise<Map<string, IngredientPreferredProduct>> {
  const normalized = Array.from(
    new Set(ingredientNames.map(n => n.trim().toLowerCase()).filter(Boolean))
  );
  if (normalized.length === 0) return new Map();

  const { data, error } = await supabase
    .from('ingredients')
    .select(`
      id,
      name,
      default_store_product_id,
      store_products:default_store_product_id (
        name, brand, store, product_url, size_label, size_value, size_unit_code
      )
    `);
  if (error) throw error;

  const allRows = (data ?? []) as Array<{
    id: string;
    name: string;
    default_store_product_id: string | null;
    store_products: StoreProductRef | StoreProductRef[] | null;
  }>;
  const ingredientRows = allRows.filter(row => normalized.includes(row.name.trim().toLowerCase()));

  const byId = await getIngredientPreferencesMapByIds(ingredientRows.map(r => r.id));
  const result = new Map<string, IngredientPreferredProduct>();

  for (const row of ingredientRows) {
    const preferences = byId.get(row.id) ?? [];
    const sorted = [...preferences].sort((a, b) => a.sortOrder - b.sortOrder);
    let product = row.default_store_product_id
      ? sorted.find(p => p.storeProductId === row.default_store_product_id) ?? null
      : null;
    let alternatives = sorted.filter(p => product == null || p.storeProductId !== product.storeProductId);

    if (!product && row.default_store_product_id) {
      const fallbackRef = Array.isArray(row.store_products) ? row.store_products[0] ?? null : row.store_products;
      if (fallbackRef) {
        product = {
          storeProductId: row.default_store_product_id,
          isDefault: true,
          sortOrder: 0,
          name: fallbackRef.name,
          brand: fallbackRef.brand ?? null,
          store: fallbackRef.store,
          productUrl: fallbackRef.product_url,
          sizeLabel: fallbackRef.size_label ?? null,
          sizeValue: fallbackRef.size_value ?? null,
          sizeUnitCode: fallbackRef.size_unit_code ?? null,
        };
      }
      // Keep existing option rows as alternatives when default comes from ingredient fallback.
      alternatives = sorted.filter(p => !product || p.storeProductId !== product.storeProductId);
    }

    if (product?.sizeValue != null && product.sizeUnitCode) {
      const base = toBaseUnit(product.sizeValue, product.sizeUnitCode);
      if (base) {
        product = {
          ...product,
          sizeValue: base.qty,
          sizeUnitCode: base.unit,
        };
      }
    }

    result.set(row.name.toLowerCase(), {
      ingredientId: row.id,
      ingredientName: row.name,
      product,
      alternatives,
    });
  }

  return result;
}

export async function resolvePreferredProductsForIngredientIds(
  ingredientIds: string[]
): Promise<Map<string, IngredientPreferredProduct>> {
  const normalizedIds = Array.from(new Set(ingredientIds.filter(Boolean)));
  if (normalizedIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('ingredients')
    .select(`
      id,
      name,
      default_store_product_id,
      store_products:default_store_product_id (
        name, brand, store, product_url, size_label, size_value, size_unit_code
      )
    `)
    .in('id', normalizedIds);
  if (error) throw error;

  const ingredientRows = (data ?? []) as Array<{
    id: string;
    name: string;
    default_store_product_id: string | null;
    store_products: StoreProductRef | StoreProductRef[] | null;
  }>;

  const byId = await getIngredientPreferencesMapByIds(ingredientRows.map(r => r.id));
  const result = new Map<string, IngredientPreferredProduct>();

  for (const row of ingredientRows) {
    const preferences = byId.get(row.id) ?? [];
    const sorted = [...preferences].sort((a, b) => a.sortOrder - b.sortOrder);
    let product = row.default_store_product_id
      ? sorted.find(p => p.storeProductId === row.default_store_product_id) ?? null
      : null;
    let alternatives = sorted.filter(p => product == null || p.storeProductId !== product.storeProductId);

    if (!product && row.default_store_product_id) {
      const fallbackRef = Array.isArray(row.store_products) ? row.store_products[0] ?? null : row.store_products;
      if (fallbackRef) {
        product = {
          storeProductId: row.default_store_product_id,
          isDefault: true,
          sortOrder: 0,
          name: fallbackRef.name,
          brand: fallbackRef.brand ?? null,
          store: fallbackRef.store,
          productUrl: fallbackRef.product_url,
          sizeLabel: fallbackRef.size_label ?? null,
          sizeValue: fallbackRef.size_value ?? null,
          sizeUnitCode: fallbackRef.size_unit_code ?? null,
        };
      }
      // Keep existing option rows as alternatives when default comes from ingredient fallback.
      alternatives = sorted.filter(p => !product || p.storeProductId !== product.storeProductId);
    }

    if (product?.sizeValue != null && product.sizeUnitCode) {
      const base = toBaseUnit(product.sizeValue, product.sizeUnitCode);
      if (base) {
        product = {
          ...product,
          sizeValue: base.qty,
          sizeUnitCode: base.unit,
        };
      }
    }

    result.set(row.id, {
      ingredientId: row.id,
      ingredientName: row.name,
      product,
      alternatives,
    });
  }

  return result;
}

