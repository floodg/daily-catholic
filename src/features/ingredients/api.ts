import { supabase } from '../../lib/supabase';

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
  createdAt: string;
}

/** Supabase may return the FK relation as a single object or a one-element array */
type StoreProductRef = { name: string; store: string; product_url: string | null };

interface DbRow {
  id: string;
  name: string;
  optional: boolean;
  pantry_staple: boolean;
  default_store_product_id: string | null;
  created_at: string;
  store_products?: StoreProductRef | StoreProductRef[] | null;
}

function getStoreProductRef(row: DbRow): StoreProductRef | null {
  const sp = row.store_products;
  if (!sp) return null;
  return Array.isArray(sp) ? sp[0] ?? null : sp;
}

function dbToCatalog(row: DbRow): IngredientCatalog {
  const ref = getStoreProductRef(row);
  return {
    id: row.id,
    name: row.name,
    optional: row.optional,
    pantryStaple: row.pantry_staple,
    defaultStoreProductId: row.default_store_product_id,
    defaultStoreProductName: ref?.name ?? null,
    defaultStoreProductStore: ref?.store ?? null,
    defaultStoreProductUrl: ref?.product_url ?? null,
    createdAt: row.created_at,
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
      store_products:default_store_product_id ( name, store, product_url )
    `)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data as unknown as DbRow[]).map(dbToCatalog);
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
      store_products:default_store_product_id ( name, store, product_url )
    `)
    .single();

  if (error) throw error;
  return dbToCatalog(data as unknown as DbRow);
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
      store_products:default_store_product_id ( name, store, product_url )
    `)
    .single();

  if (error) throw error;
  return dbToCatalog(data as unknown as DbRow);
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) throw error;
}

