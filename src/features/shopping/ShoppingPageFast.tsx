import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { ShoppingItem, ShoppingTrip, ShoppingTripItem } from '../../domain/types';
import { v4 as uuidv4 } from '../../storage/uuid';
import { supabase } from '../../lib/supabase';
import { formatQuantity, isUnmeasuredQuantity, toBaseUnit } from './quantityUtils';
import {
  checkOffPendingShoppingListItem,
  clearDoneShoppingListItems,
  deletePendingShoppingListItem,
  fetchPendingShoppingListItems,
  fetchPurchasedShoppingItems,
  markAggregatedItemPurchased,
  unmarkPurchasedShoppingItem,
  type PendingShoppingListItem,
  type PurchasedShoppingItem,
} from './api';
import {
  deleteShoppingTripItem,
  getShoppingTrips,
  updateShoppingTripItem,
} from '../shopping-trips/api';
import {
  resolvePreferredProductsForIngredientIds,
  resolvePreferredProductsForIngredientNames,
  type IngredientProductPreference,
} from '../ingredients/api';

type SectionKey = 'trip' | 'tasks' | 'manual' | 'done';
type TripListItem = ShoppingItem & {
  store?: string;
  storeProductId?: string;
  ingredientName?: string;
  packQuantity?: number;
  packUnit?: string;
  quantityPurchased?: number;
  unit?: 'g' | 'ml' | 'units';
  netQtyNeeded?: number;
};

function selectShoppingTripsForList(trips: ShoppingTrip[]): ShoppingTrip[] {
  if (!trips.length) return [];
  const open = trips.filter((trip) => !trip.completedAt);
  const openWithItems = open.filter((trip) => (trip.items?.length ?? 0) > 0);
  if (openWithItems.length) return openWithItems;
  if (open.length) return [open[0]];
  const withItems = trips.filter((trip) => (trip.items?.length ?? 0) > 0);
  return withItems.length ? [withItems[0]] : [trips[0]];
}

function tripItemToListItem(item: ShoppingTripItem, store: string): TripListItem | null {
  const hasPack = item.packQuantity != null && item.packUnit;
  const base = hasPack ? toBaseUnit(Number(item.packQuantity), String(item.packUnit)) : null;
  const packLabel = base ? formatQuantity(base.amount, base.unit) : null;
  const quantityLabel = packLabel ? `${packLabel} × ${item.quantityPurchased}` : `×${item.quantityPurchased}`;
  if (isUnmeasuredQuantity(quantityLabel)) return null;

  const allowedUnits = new Set(['g', 'ml', 'units']);
  const unit = base && allowedUnits.has(base.unit)
    ? (base.unit as 'g' | 'ml' | 'units')
    : (hasPack ? undefined : 'units');
  const netQtyNeeded = unit === 'g' || unit === 'ml'
    ? (base ? base.amount : 0) * Number(item.quantityPurchased)
    : unit === 'units'
      ? Number(hasPack ? item.packQuantity : item.quantityPurchased) * Number(item.quantityPurchased)
      : undefined;

  return {
    id: item.id,
    name: item.productName,
    store,
    quantity: quantityLabel,
    checked: false,
    manual: false,
    storeProductId: item.storeProductId,
    ingredientName: item.ingredientName,
    packQuantity: item.packQuantity,
    packUnit: item.packUnit,
    quantityPurchased: item.quantityPurchased,
    unit,
    netQtyNeeded,
  } as TripListItem;
}

function itemKey(name: string, unit?: string) {
  return `${(name ?? '').toLowerCase()}|${unit ?? ''}`;
}

function ProductLabel({ name, quantity, style }: { name: string; quantity?: string | null; style?: CSSProperties }) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {name}
      </div>
      {quantity && (
        <span style={{ display: 'inline-block', marginTop: '0.3rem', fontSize: '0.7rem', fontWeight: 700, background: 'var(--app-border)', color: 'var(--text-subtle)', padding: '0.15rem 0.5rem', borderRadius: 999 }}>
          {quantity}
        </span>
      )}
    </div>
  );
}

export default function ShoppingPageFast() {
  const [tripItems, setTripItems] = useState<TripListItem[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<PurchasedShoppingItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingShoppingListItem[]>([]);
  const [manualItems, setManualItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [hideChecked, setHideChecked] = useState(false);
  const [swappingItem, setSwappingItem] = useState<TripListItem | null>(null);
  const [swapOptions, setSwapOptions] = useState<IngredientProductPreference[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapSaving, setSwapSaving] = useState(false);

  const load = useCallback(async (initial = false) => {
    initial ? setLoading(true) : setRefreshing(true);
    setError(null);
    try {
      // These requests are independent. Running them together is the biggest mobile latency win.
      const [trips, purchased, pending] = await Promise.all([
        getShoppingTrips(),
        fetchPurchasedShoppingItems(),
        fetchPendingShoppingListItems(),
      ]);
      const selectedTrips = selectShoppingTripsForList(trips);
      const nextItems = selectedTrips.flatMap((trip) =>
        (trip.items ?? [])
          .map((item) => tripItemToListItem(item, trip.store))
          .filter((item): item is TripListItem => item !== null),
      );
      setTripItems(nextItems);
      setPurchasedItems(purchased);
      setPendingItems(pending);
    } catch (err) {
      console.error(err);
      setError('Could not load the shopping list.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(true); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('shopping_list_fast_planned_meals_watch')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'planned_meals' }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (oldStatus !== newStatus && (newStatus === 'completed' || newStatus === 'skipped')) void load(false);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const purchasedKeySet = useMemo(
    () => new Set(purchasedItems.map((item) => itemKey(item.displayName, item.unit))),
    [purchasedItems],
  );
  const visibleTripItems = useMemo(
    () => tripItems.filter((item) => !purchasedKeySet.has(itemKey(item.name, item.unit))),
    [tripItems, purchasedKeySet],
  );
  const purchasedForDone = useMemo(
    () => purchasedItems.filter((item) => !item.tripCompletedAt && !item.doneClearedAt),
    [purchasedItems],
  );
  const itemsByStore = useMemo(() => {
    const map = new Map<string, TripListItem[]>();
    for (const item of visibleTripItems) {
      const store = item.store || 'Other';
      const list = map.get(store) ?? [];
      list.push(item);
      map.set(store, list);
    }
    return map;
  }, [visibleTripItems]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 640) return;
    const stores = Array.from(itemsByStore.keys());
    setCollapsedStores(stores.length > 1 ? new Set(stores.slice(1)) : new Set());
  }, [itemsByStore]);

  const checkedManual = manualItems.filter((item) => item.checked).length;
  const totalItems = visibleTripItems.length + pendingItems.length + manualItems.length + purchasedForDone.length;
  const doneCount = purchasedForDone.length + checkedManual;
  const pct = totalItems ? Math.round((doneCount / totalItems) * 100) : 0;

  function toggleSection(key: SectionKey) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleStore(store: string) {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      next.has(store) ? next.delete(store) : next.add(store);
      return next;
    });
  }

  async function markPurchased(item: TripListItem) {
    try {
      const purchased = await markAggregatedItemPurchased({
        ingredientId: item.ingredientName ?? item.id,
        displayName: item.name,
        unit: item.unit!,
        netQtyNeeded: item.netQtyNeeded!,
        shoppingTripItemId: item.id,
      });
      setPurchasedItems((prev) => [purchased, ...prev]);
    } catch (err) {
      console.error(err);
      alert('Failed to mark as purchased.');
    }
  }

  async function unmarkPurchased(id: string) {
    try {
      await unmarkPurchasedShoppingItem(id);
      setPurchasedItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to unmark item.');
    }
  }

  async function removeTripItem(item: TripListItem) {
    if (!confirm(`Remove "${item.name}" from your shopping trip?`)) return;
    try {
      await deleteShoppingTripItem(item.id);
      setTripItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      console.error(err);
      alert('Failed to remove item.');
    }
  }

  async function checkPending(id: string) {
    try {
      await checkOffPendingShoppingListItem(id);
      const item = pendingItems.find((row) => row.id === id);
      setPendingItems((prev) => prev.filter((row) => row.id !== id));
      if (item) await load(false);
    } catch (err) {
      console.error(err);
      alert('Failed to mark item as purchased.');
    }
  }

  async function deletePending(id: string) {
    try {
      await deletePendingShoppingListItem(id);
      setPendingItems((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      console.error(err);
      alert('Failed to remove item.');
    }
  }

  async function clearDone() {
    try {
      await clearDoneShoppingListItems();
      setPurchasedItems((prev) => prev.map((item) => item.tripCompletedAt || item.doneClearedAt ? item : { ...item, doneClearedAt: new Date().toISOString() }));
      setManualItems((prev) => prev.filter((item) => !item.checked));
    } catch (err) {
      console.error(err);
      alert('Failed to clear done items.');
    }
  }

  function addManualItem() {
    const name = newItemName.trim();
    if (!name) return;
    setManualItems((prev) => [...prev, { id: uuidv4(), name, quantity: '', checked: false, manual: true } as ShoppingItem]);
    setNewItemName('');
    setShowAddForm(false);
  }

  async function openSwap(item: TripListItem) {
    setSwappingItem(item);
    setSwapOptions([]);
    setSwapLoading(true);
    try {
      let ingredientId: string | null = null;
      if (item.storeProductId) {
        const { data, error: lookupError } = await supabase
          .from('store_products')
          .select('ingredient_id')
          .eq('id', item.storeProductId)
          .maybeSingle();
        if (lookupError) throw lookupError;
        ingredientId = (data?.ingredient_id as string | null) ?? null;
      }
      if (ingredientId) {
        const byId = await resolvePreferredProductsForIngredientIds([ingredientId]);
        const resolved = byId.get(ingredientId);
        setSwapOptions(resolved ? [resolved.product, ...resolved.alternatives].filter((p): p is IngredientProductPreference => Boolean(p)) : []);
      } else {
        const label = (item.ingredientName || item.name).trim();
        const byName = await resolvePreferredProductsForIngredientNames([label]);
        const resolved = byName.get(label.toLowerCase());
        setSwapOptions(resolved ? [resolved.product, ...resolved.alternatives].filter((p): p is IngredientProductPreference => Boolean(p)) : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSwapLoading(false);
    }
  }

  async function saveSwap(product: IngredientProductPreference) {
    if (!swappingItem) return;
    setSwapSaving(true);
    try {
      await updateShoppingTripItem(swappingItem.id, {
        productName: [product.brand, product.name].filter(Boolean).join(' '),
        packQuantity: product.sizeValue,
        packUnit: product.sizeUnitCode,
        storeProductId: product.storeProductId,
      });
      await load(false);
      setSwappingItem(null);
    } catch (err) {
      console.error(err);
      alert('Failed to swap product.');
    } finally {
      setSwapSaving(false);
    }
  }

  if (loading) {
    return <div className="app-card" style={{ maxWidth: 600, margin: '0 auto', padding: '1.25rem' }}>Loading shopping list…</div>;
  }

  return (
    <div style={{ maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box', minWidth: 0 }}>
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">🛒 Shopping <em>List</em></h1>
          {refreshing && <div className="page-eyebrow">Refreshing…</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-app-secondary" onClick={() => setHideChecked((value) => !value)}>{hideChecked ? 'Show done' : 'Hide done'}</button>
          <button className="btn-app-primary" onClick={() => setShowAddForm((value) => !value)}><Plus size={14} /> Add item</button>
        </div>
      </div>

      {error && <div className="app-card" style={{ padding: '0.875rem 1rem', marginBottom: '1rem' }}>{error}</div>}

      <div className="app-card" style={{ marginBottom: '1rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700 }}>
          <span>{doneCount} of {totalItems} items</span><span>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 100, background: 'var(--app-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gold)', transition: 'width 0.2s ease' }} />
        </div>
      </div>

      {showAddForm && (
        <div className="app-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <form onSubmit={(event) => { event.preventDefault(); addManualItem(); }}>
            <input className="app-input" value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="e.g. Almond milk" autoFocus />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn-app-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-app-primary" disabled={!newItemName.trim()}>Add</button>
            </div>
          </form>
        </div>
      )}

      {totalItems === 0 && (
        <div className="app-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <ShoppingCart size={40} style={{ margin: '0 auto 1rem' }} />
          <p>No items yet. Plan some meals or tap “Add item”.</p>
        </div>
      )}

      {visibleTripItems.length > 0 && (
        <section style={{ marginBottom: '0.75rem' }}>
          <SectionHeader label={itemsByStore.size > 1 ? 'Shopping Trips' : (visibleTripItems[0]?.store ?? 'Shopping Trip')} count={visibleTripItems.length} collapsed={collapsedSections.has('trip')} onClick={() => toggleSection('trip')} icon="🛒" />
          {!collapsedSections.has('trip') && (
            <div className="app-card" style={{ overflow: 'hidden' }}>
              {Array.from(itemsByStore.entries()).map(([store, items], storeIndex) => (
                <div key={store}>
                  {itemsByStore.size > 1 && (
                    <button onClick={() => toggleStore(store)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', border: 0, borderTop: storeIndex ? '1px solid var(--app-border)' : 'none', background: 'rgba(255,255,255,0.02)', color: 'inherit' }}>
                      <strong>{store}</strong><span>{items.length} {collapsedStores.has(store) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                    </button>
                  )}
                  {!collapsedStores.has(store) && items.map((item, index) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1rem', borderTop: index || itemsByStore.size === 1 ? '1px solid var(--app-border)' : 'none' }}>
                      <button onClick={() => void markPurchased(item)} style={iconButtonStyle} aria-label="Mark as purchased"><Circle size={26} /></button>
                      <div style={{ flex: 1, minWidth: 0 }}><ProductLabel name={item.name} quantity={item.quantity} /></div>
                      <button onClick={() => void openSwap(item)} className="btn-app-ghost" style={{ padding: '0.2rem 0.45rem' }} title="Swap product">🔄</button>
                      <button onClick={() => void removeTripItem(item)} style={iconButtonStyle} aria-label="Remove item"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {pendingItems.length > 0 && (
        <section style={{ marginBottom: '0.75rem' }}>
          <SectionHeader label="Google Tasks" count={pendingItems.length} collapsed={collapsedSections.has('tasks')} onClick={() => toggleSection('tasks')} icon="📋" />
          {!collapsedSections.has('tasks') && <div className="app-card">{pendingItems.map((item) => <Row key={item.id} name={item.ingredientName} onCheck={() => void checkPending(item.id)} onDelete={() => void deletePending(item.id)} />)}</div>}
        </section>
      )}

      {manualItems.length > 0 && (
        <section style={{ marginBottom: '0.75rem' }}>
          <SectionHeader label="My Extras" count={manualItems.length} collapsed={collapsedSections.has('manual')} onClick={() => toggleSection('manual')} icon="✏️" />
          {!collapsedSections.has('manual') && <div className="app-card">{manualItems.map((item) => <Row key={item.id} name={item.name} checked={item.checked} onCheck={() => setManualItems((prev) => prev.map((row) => row.id === item.id ? { ...row, checked: !row.checked } : row))} onDelete={() => setManualItems((prev) => prev.filter((row) => row.id !== item.id))} />)}</div>}
        </section>
      )}

      {!hideChecked && purchasedForDone.length > 0 && (
        <section style={{ marginBottom: '0.75rem' }}>
          <SectionHeader label="Done" count={purchasedForDone.length} collapsed={collapsedSections.has('done')} onClick={() => toggleSection('done')} icon="✅" action={<button className="btn-app-ghost" onClick={(event) => { event.stopPropagation(); void clearDone(); }}><Trash2 size={12} /> Clear</button>} />
          {!collapsedSections.has('done') && <div className="app-card">{purchasedForDone.map((item) => <div key={item.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--app-border)' }}><CheckCircle2 size={26} /><div style={{ flex: 1, minWidth: 0 }}><ProductLabel name={item.displayName} quantity={item.unit && item.netQtyNeeded != null ? formatQuantity(item.netQtyNeeded, item.unit) : null} style={{ textDecoration: 'line-through', color: 'var(--text-subtle)' }} /></div><button className="btn-app-ghost" onClick={() => void unmarkPurchased(item.id)}>Unmark</button></div>)}</div>}
        </section>
      )}

      <section className="shopping-links" style={{ marginTop: '2rem' }}>
        <h2>Related views</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link to="/app/plan" className="btn-app-ghost">Back to Weekly Plan</Link>
          <Link to="/app/shopping-trips" className="btn-app-ghost">Record Shopping Trip</Link>
          <Link to="/app/inventory" className="btn-app-ghost">View Inventory</Link>
        </div>
      </section>

      {swappingItem && (
        <div className="modal-overlay" onClick={() => setSwappingItem(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Swap Product</h2>
            <p><strong>{swappingItem.ingredientName || swappingItem.name}</strong></p>
            {swapLoading && <p className="form-hint">Loading products…</p>}
            {!swapLoading && swapOptions.length === 0 && <p className="form-hint">No alternatives configured.</p>}
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {swapOptions.map((product) => <button key={product.storeProductId} className="btn-app-ghost" disabled={swapSaving} onClick={() => void saveSwap(product)} style={{ textAlign: 'left' }}>{[product.brand, product.name].filter(Boolean).join(' ')}{product.sizeLabel ? ` (${product.sizeLabel})` : ''}</button>)}
            </div>
            <div className="modal-actions"><button className="btn-app-secondary" onClick={() => setSwappingItem(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconButtonStyle: CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--text-subtle)' };

function SectionHeader({ label, count, collapsed, onClick, icon, action }: { label: string; count: number; collapsed: boolean; onClick: () => void; icon: string; action?: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'transparent', border: 'none', color: 'inherit' }}><span>{icon}</span><strong style={{ flex: 1, textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase' }}>{label}</strong><span>{count}</span>{action}{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>;
}

function Row({ name, checked = false, onCheck, onDelete }: { name: string; checked?: boolean; onCheck: () => void; onDelete: () => void }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--app-border)' }}><button onClick={onCheck} style={iconButtonStyle}>{checked ? <CheckCircle2 size={26} /> : <Circle size={26} />}</button><div style={{ flex: 1, minWidth: 0, textDecoration: checked ? 'line-through' : 'none' }}>{name}</div><button onClick={onDelete} style={iconButtonStyle}><Trash2 size={16} /></button></div>;
}