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
  /** When set, links to trip line item for product name / brand resolution */
  shoppingTripItemId?: string | null;
  /** Set when the linked trip has `completed_at` — hidden from Done; still counted for suppressing trip lines */
  tripCompletedAt?: string | null;
  /** Set when the user clears Done — hidden from Done; purchase ledger rows are kept */
  doneClearedAt?: string | null;
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
    .select('id, ingredient_name, unit, requested_quantity, source, created_at, shopping_trip_item_id')
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
    shoppingTripItemId: (row.shopping_trip_item_id as string | null) ?? null,
    tripCompletedAt: null,
  };
}

export async function fetchPurchasedShoppingItems(): Promise<PurchasedShoppingItem[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('shopping_list')
    .select(`
      id,
      ingredient_name,
      unit,
      requested_quantity,
      source,
      created_at,
      done_cleared_at,
      shopping_trip_item_id,
      shopping_trip_items (
        shopping_trips (
          completed_at
        )
      )
    `)
    .eq('user_id', user.id)
    .eq('is_checked', true)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data as any[]).map((row) => {
    const sti = row.shopping_trip_items as
      | { shopping_trips: { completed_at: string | null } | null }
      | null
      | undefined;
    const tripCompletedAt = sti?.shopping_trips?.completed_at ?? null;
    return {
      id: row.id as string,
      displayName: row.ingredient_name as string,
      unit: (row.unit as MeasurementUnitCode | null) ?? undefined,
      netQtyNeeded: (row.requested_quantity as number | null) ?? undefined,
      source: row.source as string,
      createdAt: row.created_at as string,
      shoppingTripItemId: (row.shopping_trip_item_id as string | null) ?? null,
      tripCompletedAt,
      doneClearedAt: (row.done_cleared_at as string | null) ?? null,
    };
  });
}

/** Hides checked items from the Done section without undoing pantry purchases. */
export async function clearDoneShoppingListItems(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not authenticated');

  const items = await fetchPurchasedShoppingItems();
  const ids = items
    .filter((item) => !item.tripCompletedAt && !item.doneClearedAt)
    .map((item) => item.id);
  if (ids.length === 0) return 0;

  const clearedAt = new Date().toISOString();
  const { error } = await supabase
    .from('shopping_list')
    .update({ done_cleared_at: clearedAt })
    .eq('user_id', user.id)
    .in('id', ids);
  if (error) throw error;
  return ids.length;
}

// ─── Pending (Google Tasks) items ─────────────────────────────────────────────

export interface PendingShoppingListItem {
  id: string;
  ingredientName: string;
  source: string;
  createdAt: string;
}

/**
 * Reads unchecked standalone items from shopping_list (e.g. Google Tasks rows
 * that are not already represented by a shopping-trip product card).
 */
export async function fetchPendingShoppingListItems(): Promise<PendingShoppingListItem[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('shopping_list')
    .select('id, ingredient_name, source, created_at')
    .eq('user_id', user.id)
    .eq('is_checked', false)
    .is('shopping_trip_item_id', null)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data as any[]).map(row => ({
    id: row.id as string,
    ingredientName: row.ingredient_name as string,
    source: row.source as string,
    createdAt: row.created_at as string,
  }));
}

/** Marks a pending shopping_list item as purchased (is_checked → true). */
export async function checkOffPendingShoppingListItem(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('shopping_list')
    .update({ is_checked: true })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
}

/** Removes a pending shopping_list item without purchasing it. */
export async function deletePendingShoppingListItem(id: string): Promise<void> {
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
