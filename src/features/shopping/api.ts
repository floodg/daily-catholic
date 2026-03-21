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

