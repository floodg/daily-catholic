import { supabase } from '../../lib/supabase';

type Unit = 'g' | 'ml' | 'units';

export interface LinkedProductInput {
  productName: string;
  store: string;
  packSize: number;
  unit: Unit;
  barcode?: string;
}

export interface LinkedProduct {
  id: string;
  ingredientId: string;
  productName: string;
  store?: string;
  packSizeG?: number;
  packSizeMl?: number;
  packSizeUnits?: number;
  barcode?: string;
  createdAt: string;
}

function unitToColumns(input: LinkedProductInput): {
  pack_size_g: number | null;
  pack_size_ml: number | null;
  pack_size_units: number | null;
} {
  return {
    pack_size_g: input.unit === 'g' ? input.packSize : null,
    pack_size_ml: input.unit === 'ml' ? input.packSize : null,
    pack_size_units: input.unit === 'units' ? input.packSize : null,
  };
}

export async function getLinkedProductsForIngredients(
  ingredientNames: string[]
): Promise<Map<string, LinkedProduct>> {
  const result = new Map<string, LinkedProduct>();
  if (ingredientNames.length === 0) return result;

  // Resolve ingredient IDs by unique name
  const { data: ingredients, error: ingErr } = await supabase
    .from('ingredients')
    .select('id, name')
    .in('name', ingredientNames);
  if (ingErr) throw ingErr;

  const byName = new Map(
    (ingredients ?? []).map((r: { id: string; name: string }) => [r.name.toLowerCase(), r.id])
  );
  const ids = Array.from(byName.values());
  if (ids.length === 0) return result;

  // Fetch user-linked store_products rows for these ingredient ids
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return result;

  const { data: links, error: linkErr } = await supabase
    .from('store_products')
    .select('id, ingredient_id, name, store, pack_size_g, pack_size_ml, pack_size_units, barcode, created_at')
    .eq('user_id', user.id)
    .in('ingredient_id', ids);
  if (linkErr) throw linkErr;

  for (const row of links ?? []) {
    const entry: LinkedProduct = {
      id: row.id as string,
      ingredientId: row.ingredient_id as string,
      productName: row.name as string,
      store: row.store ?? undefined,
      packSizeG: row.pack_size_g ?? undefined,
      packSizeMl: row.pack_size_ml ?? undefined,
      packSizeUnits: row.pack_size_units ?? undefined,
      barcode: row.barcode ?? undefined,
      createdAt: row.created_at as string,
    };
    // Map back to the original ingredient name (lowercased)
    const nameEntry = Array.from(byName.entries()).find(([, id]) => id === entry.ingredientId);
    if (nameEntry) {
      result.set(nameEntry[0], entry);
    }
  }
  return result;
}

export async function upsertLinkedProductForIngredient(
  ingredientName: string,
  input: LinkedProductInput
): Promise<LinkedProduct> {
  const trimmedName = ingredientName.trim();
  if (!trimmedName) throw new Error('Ingredient name is required.');
  if (!input.productName.trim()) throw new Error('Product name is required.');
  if (!input.store.trim()) throw new Error('Store is required.');
  if (!(input.packSize > 0)) throw new Error('Pack size must be greater than zero.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Ensure ingredient exists and get its id
  // Try select first
  let ingredientId: string | null = null;
  {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id')
      .eq('name', trimmedName)
      .maybeSingle();
    if (!error && data) {
      ingredientId = (data as { id: string }).id;
    }
  }
  if (!ingredientId) {
    const { data, error } = await supabase
      .from('ingredients')
      .insert({ name: trimmedName, optional: false, pantry_staple: false })
      .select('id')
      .single();
    if (error) throw error;
    ingredientId = (data as { id: string }).id;
  }

  const { pack_size_g, pack_size_ml, pack_size_units } = unitToColumns(input);

  // Upsert into store_products keyed by (user_id, ingredient_id)
  const { data, error } = await supabase
    .from('store_products')
    .upsert(
      [
        {
          user_id: user.id,
          ingredient_id: ingredientId,
          name: input.productName.trim(),
          store: input.store.trim(),
          pack_size_g,
          pack_size_ml,
          pack_size_units,
          barcode: input.barcode ?? null,
        },
      ],
      { onConflict: 'user_id,ingredient_id' }
    )
    .select('id, ingredient_id, name, store, pack_size_g, pack_size_ml, pack_size_units, barcode, created_at')
    .single();
  if (error) throw error;

  const row = data as any;
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    productName: row.name,
    store: row.store ?? undefined,
    packSizeG: row.pack_size_g ?? undefined,
    packSizeMl: row.pack_size_ml ?? undefined,
    packSizeUnits: row.pack_size_units ?? undefined,
    barcode: row.barcode ?? undefined,
    createdAt: row.created_at,
  };
}

export async function unlinkProductForIngredient(ingredientName: string): Promise<void> {
  const trimmedName = ingredientName.trim();
  if (!trimmedName) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error: ingErr } = await supabase
    .from('ingredients')
    .select('id')
    .eq('name', trimmedName)
    .maybeSingle();
  if (ingErr || !data) return;

  await supabase
    .from('store_products')
    .delete()
    .eq('user_id', user.id)
    .eq('ingredient_id', (data as { id: string }).id);
}

