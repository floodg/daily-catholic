import { supabase } from '../../lib/supabase';
import type { MeasurementUnitCode } from '../../domain/types';

export interface AggregatedShoppingItem {
  ingredientId: string;
  productId?: string;
  displayName: string;
  unit: MeasurementUnitCode;
  netQtyNeeded: number;
}

export interface PurchasedShoppingItem {
  id: string;
  displayName: string;
  unit?: MeasurementUnitCode;
  netQtyNeeded?: number;
  source: string;
  createdAt: string;
}

export interface OpenShoppingListItem {
  id: string;
  ingredientName: string;
  source: string;
  createdAt: string;
}

export interface KitchenScanAnalyzeResult {
  missing: string[];
  low: string[];
  sufficient: string[];
  unknown: string[];
  unknownCount: number;
  message?: string;
}

export interface KitchenScanApplyResult {
  added: number;
  skipped: number;
  insertedNames: string[];
}

export async function fetchAggregatedShoppingListForThisWeek(): Promise<AggregatedShoppingItem[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data, error } = await supabase.rpc('shopping_list_aggregate_week', {
    p_user_id: user.id,
  });
  if (error) throw error;

  const rows = (data ?? []) as {
    ingredient_id: string;
    product_id: string | null;
    display_name: string;
    unit: MeasurementUnitCode;
    net_qty_needed: number;
  }[];

  return rows.map(r => ({
    ingredientId: r.ingredient_id,
    productId: r.product_id ?? undefined,
    displayName: r.display_name,
    unit: r.unit,
    netQtyNeeded: Number(r.net_qty_needed),
  }));
}

export async function markAggregatedItemPurchased(
  item: AggregatedShoppingItem & { shoppingTripItemId?: string | null }
): Promise<PurchasedShoppingItem> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('shopping_list')
    .insert([
      {
        user_id: user.id,
        ingredient_name: item.displayName,
        shopping_trip_item_id: item.shoppingTripItemId ?? null,
        unit: item.unit ?? null,
        requested_quantity: item.netQtyNeeded ?? null,
        is_checked: true,
        source: 'meal_plan',
      },
    ])
    .select('id, ingredient_name, unit, requested_quantity, source, created_at')
    .single();
  if (error) throw error;

  const row = data as any;
  return {
    id: row.id as string,
    displayName: row.ingredient_name as string,
    unit: (row.unit as MeasurementUnitCode | null) ?? undefined,
    netQtyNeeded: (row.requested_quantity as number | null) ?? undefined,
    source: row.source as string,
    createdAt: row.created_at as string,
  };
}

export async function fetchPurchasedShoppingItems(): Promise<PurchasedShoppingItem[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('shopping_list')
    .select('id, ingredient_name, unit, requested_quantity, source, created_at')
    .eq('user_id', user.id)
    .eq('is_checked', true)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data as any[]).map(row => ({
    id: row.id as string,
    displayName: row.ingredient_name as string,
    unit: (row.unit as MeasurementUnitCode | null) ?? undefined,
    netQtyNeeded: (row.requested_quantity as number | null) ?? undefined,
    source: row.source as string,
    createdAt: row.created_at as string,
  }));
}

export async function fetchOpenShoppingListItems(): Promise<OpenShoppingListItem[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('shopping_list')
    .select('id, ingredient_name, source, created_at')
    .eq('user_id', user.id)
    .eq('is_checked', false)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data as any[]).map(row => ({
    id: row.id as string,
    ingredientName: row.ingredient_name as string,
    source: (row.source as string) ?? 'manual',
    createdAt: row.created_at as string,
  }));
}

export async function scanKitchenAnalyze(
  images: Array<{ mimeType: string; base64: string }>
): Promise<KitchenScanAnalyzeResult> {
  const { data, error } = await supabase.functions.invoke('scan-kitchen', {
    body: {
      action: 'analyze',
      images,
    },
  });
  if (error) throw error;

  const result = (data ?? {}) as Partial<KitchenScanAnalyzeResult>;
  return {
    missing: Array.isArray(result.missing) ? result.missing : [],
    low: Array.isArray(result.low) ? result.low : [],
    sufficient: Array.isArray(result.sufficient) ? result.sufficient : [],
    unknown: Array.isArray(result.unknown) ? result.unknown : [],
    unknownCount: Number(result.unknownCount ?? 0),
    message: typeof result.message === 'string' ? result.message : undefined,
  };
}

export async function scanKitchenApply(names: string[]): Promise<KitchenScanApplyResult> {
  const { data, error } = await supabase.functions.invoke('scan-kitchen', {
    body: {
      action: 'apply',
      names,
    },
  });
  if (error) throw error;

  const result = (data ?? {}) as Partial<KitchenScanApplyResult>;
  return {
    added: Number(result.added ?? 0),
    skipped: Number(result.skipped ?? 0),
    insertedNames: Array.isArray(result.insertedNames) ? result.insertedNames : [],
  };
}

/**
 * Unmark a purchased shopping item by deleting it from the shopping_list.
 * This effectively moves it back into the "to buy" list in the UI.
 */
export async function unmarkPurchasedShoppingItem(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('shopping_list')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
}

export async function removeOpenShoppingListItem(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('shopping_list')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_checked', false);
  if (error) throw error;
}

