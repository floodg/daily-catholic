import { supabase } from '../../lib/supabase';
import type { ShoppingTrip, ShoppingTripItem } from '../../domain/types';

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface DbShoppingTripItem {
  id: string;
  shopping_trip_id: string;
  product_name: string;
  ingredient_name: string | null;
  quantity_purchased: number;
  pack_quantity: number | null;
  pack_unit: string | null;
  store_product_id: string | null;
  created_at: string;
}

interface DbShoppingTrip {
  id: string;
  user_id: string;
  store: string;
  purchased_at: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  shopping_trip_items: DbShoppingTripItem[];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function dbItemToDomain(row: DbShoppingTripItem): ShoppingTripItem {
  return {
    id: row.id,
    shoppingTripId: row.shopping_trip_id,
    productName: row.product_name,
    quantityPurchased: row.quantity_purchased,
    packQuantity: row.pack_quantity ?? undefined,
    packUnit: row.pack_unit ?? undefined,
    storeProductId: row.store_product_id ?? undefined,
    ingredientName: row.ingredient_name ?? undefined,
    createdAt: row.created_at,
  };
}

function dbTripToDomain(row: DbShoppingTrip): ShoppingTrip {
  return {
    id: row.id,
    userId: row.user_id,
    store: row.store,
    purchasedAt: row.purchased_at,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    items: (row.shopping_trip_items ?? []).map(dbItemToDomain),
  };
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getShoppingTrips(): Promise<ShoppingTrip[]> {
  const { data, error } = await supabase
    .from('shopping_trips')
    .select('*, shopping_trip_items(*)')
    .order('purchased_at', { ascending: false });

  if (error) throw error;
  return (data as DbShoppingTrip[]).map(dbTripToDomain);
}

export async function createShoppingTrip(params: {
  store: string;
  purchasedAt: string;
  notes?: string;
}): Promise<ShoppingTrip> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('shopping_trips')
    .insert({
      user_id: user.id,
      store: params.store,
      purchased_at: params.purchasedAt,
      notes: params.notes ?? null,
    })
    .select('*, shopping_trip_items(*)')
    .single();

  if (error) throw error;
  return dbTripToDomain(data as DbShoppingTrip);
}

export async function updateShoppingTrip(
  id: string,
  params: { store?: string; purchasedAt?: string; notes?: string }
): Promise<ShoppingTrip> {
  const updates: Record<string, unknown> = {};
  if (params.store !== undefined) updates.store = params.store;
  if (params.purchasedAt !== undefined) updates.purchased_at = params.purchasedAt;
  if (params.notes !== undefined) updates.notes = params.notes || null;

  const { data, error } = await supabase
    .from('shopping_trips')
    .update(updates)
    .eq('id', id)
    .select('*, shopping_trip_items(*)')
    .single();

  if (error) throw error;
  return dbTripToDomain(data as DbShoppingTrip);
}

export async function deleteShoppingTrip(id: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_trips')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function addShoppingTripItem(params: {
  shoppingTripId: string;
  productName: string;
  quantityPurchased: number;
  packQuantity?: number;
  packUnit?: string;
  storeProductId?: string;
  ingredientName?: string;
}): Promise<ShoppingTripItem> {
  const { data, error } = await supabase
    .from('shopping_trip_items')
    .insert({
      shopping_trip_id: params.shoppingTripId,
      product_name: params.productName,
      ingredient_name: params.ingredientName ?? null,
      quantity_purchased: params.quantityPurchased,
      pack_quantity: params.packQuantity ?? null,
      pack_unit: params.packUnit ?? null,
      store_product_id: params.storeProductId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return dbItemToDomain(data as DbShoppingTripItem);
}

export async function updateShoppingTripItem(
  id: string,
  params: {
    productName?: string;
    quantityPurchased?: number;
    packQuantity?: number | null;
    packUnit?: string | null;
    storeProductId?: string | null;
    ingredientName?: string | null;
  }
): Promise<ShoppingTripItem> {
  const updates: Record<string, unknown> = {};
  if (params.productName !== undefined) updates.product_name = params.productName;
  if (params.quantityPurchased !== undefined) updates.quantity_purchased = params.quantityPurchased;
  if ('packQuantity' in params) updates.pack_quantity = params.packQuantity ?? null;
  if ('packUnit' in params) updates.pack_unit = params.packUnit ?? null;
  if ('storeProductId' in params) updates.store_product_id = params.storeProductId ?? null;
  if ('ingredientName' in params) updates.ingredient_name = params.ingredientName ?? null;

  const { data, error } = await supabase
    .from('shopping_trip_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return dbItemToDomain(data as DbShoppingTripItem);
}

export async function deleteShoppingTripItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_trip_items')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
