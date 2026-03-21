import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, CheckCircle2, Circle, ShoppingCart, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import type { ShoppingItem, StoreProduct } from "../../domain/types";
import { formatQuantity, isUnmeasuredQuantity, toBaseUnit } from "./quantityUtils";
import { v4 as uuidv4 } from "../../storage/uuid";
import { formatDateLocal, getMondayLocal } from "../../lib/dateUtils";
import {
  getLinkedProductsForIngredients,
  upsertLinkedProductForIngredient,
  unlinkProductForIngredient,
  type LinkedProduct,
} from "../product-linking/api";
import {
  markAggregatedItemPurchased,
  fetchPurchasedShoppingItems,
  type PurchasedShoppingItem,
} from "./api";
import { unmarkPurchasedShoppingItem } from "./api";
import { getStoreProducts } from "../store-products/api";
import { getShoppingTrips } from "../shopping-trips/api";
import { supabase } from "../../lib/supabase";

// ── Helpers ────────────────────────────────────────────────────────────────────

const DROPDOWN_CLOSE_DELAY_MS = 150;

function parseSizeLabelForLink(sizeLabel: string): { packSize: number; unit: 'g' | 'ml' | 'units' } | null {
  const match = sizeLabel.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/i);
  if (!match) return null;
  const qty = parseFloat(match[1]);
  if (isNaN(qty) || qty <= 0) return null;
  const u = match[2].trim().toLowerCase();
  if (u === 'kg') return { packSize: qty * 1000, unit: 'g' };
  if (u === 'g') return { packSize: qty, unit: 'g' };
  if (u === 'l') return { packSize: qty * 1000, unit: 'ml' };
  if (u === 'ml') return { packSize: qty, unit: 'ml' };
  return { packSize: qty, unit: 'units' };
}

type SectionKey = 'trip' | 'manual' | 'done';

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ShoppingPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [aggregatedItems, setAggregatedItems] = useState<ShoppingItem[]>([]);
  const [manualItems, setManualItems] = useState<ShoppingItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [linkedByName, setLinkedByName] = useState<Map<string, LinkedProduct>>(new Map());
  const [linkingIngredient, setLinkingIngredient] = useState<string | null>(null);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<PurchasedShoppingItem[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionKey>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);

  useEffect(() => {
    const today = new Date();
    const monday = getMondayLocal(today);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    setStartDate(formatDateLocal(monday));
    setEndDate(formatDateLocal(sunday));

    getStoreProducts()
      .then(setStoreProducts)
      .catch(err => console.error('Failed to load store products:', err));
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      generateShoppingList();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const refreshPurchased = async () => {
    try {
      const rows = await fetchPurchasedShoppingItems();
      setPurchasedItems(rows);
    } catch (err) {
      console.error(err);
    }
  };

  const purchasedKey = (name: string, unit?: string) =>
    `${(name ?? '').toLowerCase()}|${unit ?? ''}`;

  const purchasedKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchasedItems) {
      set.add(purchasedKey(p.displayName, p.unit));
    }
    return set;
  }, [purchasedItems]);

  const generateShoppingList = async () => {
    setListLoading(true);
    try {
      const trips = await getShoppingTrips();
      const latest = trips[0];
      if (!latest) {
        setAggregatedItems([]);
      } else {
        const items: ShoppingItem[] = latest.items.map((ti: any) => {
          const hasPack = ti.packQuantity != null && ti.packUnit;
          const base = hasPack ? toBaseUnit(Number(ti.packQuantity), String(ti.packUnit)) : null;
          const packLabel = base ? formatQuantity(base.amount, base.unit) : null;
          const quantityLabel = packLabel ? `${packLabel} × ${ti.quantityPurchased}` : `×${ti.quantityPurchased}`;
          const allowedUnits = new Set(['g', 'ml', 'units']);
          const unitForDb = base && allowedUnits.has(base.unit) ? base.unit : (hasPack ? undefined : 'units');
          const qtyForDb =
            unitForDb === 'g' || unitForDb === 'ml'
              ? (base ? base.amount : 0) * Number(ti.quantityPurchased)
              : unitForDb === 'units'
                ? Number(hasPack ? ti.packQuantity : ti.quantityPurchased) * Number(ti.quantityPurchased)
                : undefined;
          return ({
            id: ti.id,
            name: ti.productName,
            store: latest.store,
            quantity: quantityLabel,
            checked: false,
            manual: false,
            ...(ti as any),
            unit: unitForDb,
            netQtyNeeded: qtyForDb,
          } as any);
        })
        .filter((item: ShoppingItem) => !item.quantity || !isUnmeasuredQuantity(item.quantity));
        setAggregatedItems(items);
      }
      await refreshPurchased();
    } catch (err) {
      console.error(err);
    } finally {
      setListLoading(false);
    }
  };

  // Realtime: refresh when planned meals change to completed/skipped
  useEffect(() => {
    const channel = supabase
      .channel('shopping_list_planned_meals_watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'planned_meals' },
        (payload) => {
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          if (oldStatus !== newStatus && (newStatus === 'completed' || newStatus === 'skipped')) {
            generateShoppingList();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayItems = useMemo(() => aggregatedItems, [aggregatedItems]);

  const filteredAggregatedItems = useMemo(() => {
    return displayItems.filter(item => {
      if (item.manual) return false;
      const unit = (item as any).unit as string | undefined;
      return !purchasedKeySet.has(purchasedKey(item.name, unit));
    });
  }, [displayItems, purchasedKeySet]);

  const handleAddManualItem = () => {
    if (!newItemName.trim()) return;
    const newItem: ShoppingItem = {
      id: uuidv4(),
      name: newItemName,
      store: "Coles",
      checked: false,
      manual: true,
    };
    setManualItems(prev => [...prev, newItem]);
    setNewItemName("");
  };

  const handleDeleteManualItem = (id: string) => {
    setManualItems(prev => prev.filter(i => i.id !== id));
  };

  const handleToggleCheck = (id: string) => {
    setManualItems(prev =>
      prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i)
    );
  };

  const handleMarkPurchased = async (item: any) => {
    try {
      await markAggregatedItemPurchased({
        ingredientId: item.ingredientId,
        productId: item.productId,
        displayName: item.name,
        unit: item.unit,
        netQtyNeeded: item.netQtyNeeded,
        shoppingTripItemId: item.id,
      });
      await generateShoppingList();
      await refreshPurchased();
    } catch (err) {
      console.error(err);
      alert('Failed to mark as purchased.');
    }
  };

  const handleUnmarkPurchased = async (id: string) => {
    try {
      await unmarkPurchasedShoppingItem(id);
      await refreshPurchased();
      await generateShoppingList();
    } catch (err) {
      console.error(err);
      alert('Failed to unmark item.');
    }
  };

  function toggleSection(key: SectionKey) {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const tripStore = filteredAggregatedItems[0]?.store ?? aggregatedItems[0]?.store;
  const checkedManual = manualItems.filter(i => i.checked).length;
  const allManualDone = manualItems.length > 0 && checkedManual === manualItems.length;
  const totalItems = filteredAggregatedItems.length + manualItems.length + purchasedItems.length;
  const doneCount = purchasedItems.length + checkedManual;
  const pct = totalItems === 0 ? 0 : Math.round((doneCount / totalItems) * 100);
  const isTripCollapsed = collapsedSections.has('trip');
  const isManualCollapsed = collapsedSections.has('manual');
  const isDoneCollapsed = collapsedSections.has('done');

  // ── Link Product Modal ────────────────────────────────────────────────────────

  function LinkProductModal({ ingredientName, onClose }: { ingredientName: string; onClose: () => void }) {
    const existing = linkedByName.get(ingredientName.toLowerCase());
    const [productName, setProductName] = useState(existing?.productName ?? "");
    const [store, setStore] = useState(existing?.store ?? "Coles");
    const [unit, setUnit] = useState<'g' | 'ml' | 'units'>(
      existing?.packSizeG ? 'g' : existing?.packSizeMl ? 'ml' : 'units'
    );
    const [packSize, setPackSize] = useState(
      existing?.packSizeG ?? existing?.packSizeMl ?? existing?.packSizeUnits ?? 0
    );
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const comboboxRef = useRef<HTMLDivElement>(null);

    const suggestions = storeProducts.filter(p => {
      if (!productName.trim()) return true;
      const q = productName.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false)
      );
    });

    const handleSelectProduct = (product: StoreProduct) => {
      const displayName = [product.brand, product.name].filter(Boolean).join(' ');
      setProductName(displayName);
      setStore(product.store ?? 'Coles');
      if (product.sizeLabel) {
        const parsed = parseSizeLabelForLink(product.sizeLabel);
        if (parsed) {
          setPackSize(parsed.packSize);
          setUnit(parsed.unit);
        }
      }
      setShowSuggestions(false);
    };

    const handleSave = async () => {
      if (!productName.trim()) { setError('Product name is required.'); return; }
      if (!(packSize > 0)) { setError('Pack size must be greater than zero.'); return; }
      setSaving(true);
      setError('');
      try {
        await upsertLinkedProductForIngredient(ingredientName, {
          productName: productName.trim(),
          store: store.trim(),
          packSize: Number(packSize),
          unit,
        });
        const links = await getLinkedProductsForIngredients([ingredientName]);
        const updated = new Map(linkedByName);
        for (const [k, v] of links) updated.set(k, v);
        setLinkedByName(updated);
        onClose();
      } catch (err) {
        console.error(err);
        setError('Failed to save link.');
      } finally {
        setSaving(false);
      }
    };

    const handleUnlink = async () => {
      setSaving(true);
      setError('');
      try {
        await unlinkProductForIngredient(ingredientName);
        const updated = new Map(linkedByName);
        updated.delete(ingredientName.toLowerCase());
        setLinkedByName(updated);
        onClose();
      } catch (err) {
        console.error(err);
        setError('Failed to unlink product.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Link Product</h2>
          <p><strong>{ingredientName}</strong></p>
          {error && <p className="form-error">{error}</p>}
          <div className="form-group">
            <label className="app-label">Product name</label>
            <div className="link-product-combobox" ref={comboboxRef}>
              <input
                type="text"
                className="app-input"
                value={productName}
                onChange={e => { setProductName(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), DROPDOWN_CLOSE_DELAY_MS)}
                placeholder='Search or type a product name…'
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="link-product-suggestions" role="listbox">
                  {suggestions.map(product => (
                    <li
                      key={product.id}
                      className="link-product-suggestion-item"
                      onMouseDown={() => handleSelectProduct(product)}
                      role="option"
                    >
                      <span className="suggestion-name">
                        {product.brand ? `${product.brand} ` : ''}{product.name}
                      </span>
                      {product.sizeLabel && (
                        <span className="suggestion-meta">{product.sizeLabel}</span>
                      )}
                      <span className="suggestion-store">{product.store}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="app-label">Store</label>
            <select className="app-input" value={store} onChange={e => setStore(e.target.value)}>
              <option value="Coles">Coles</option>
              <option value="Woolworths">Woolworths</option>
              <option value="IGA">IGA</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group inline">
            <div>
              <label className="app-label">Pack size</label>
              <input
                type="number"
                className="app-input"
                min={0.01}
                step={0.01}
                value={packSize}
                onChange={e => setPackSize(parseFloat(e.target.value))}
              />
            </div>
            <div>
              <label className="app-label">Unit</label>
              <select className="app-input" value={unit} onChange={e => setUnit(e.target.value as 'g' | 'ml' | 'units')}>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="units">units</option>
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-app-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {existing && (
              <button className="btn-app-secondary btn-danger" onClick={handleUnlink} disabled={saving}>
                Unlink
              </button>
            )}
            <button className="btn-app-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>

      {/* Page header */}
      <div className="page-header-bar">
        <div>
          {tripStore && <div className="page-eyebrow">{tripStore} Run</div>}
          <h1 className="page-title">🛒 Shopping <em>List</em></h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setHideChecked(h => !h)}
            className="btn-app-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
          >
            {hideChecked ? 'Show done' : 'Hide done'}
          </button>
          <button
            onClick={() => setShowAddForm(s => !s)}
            className="btn-app-primary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
          >
            <Plus size={14} /> Add item
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="app-card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ padding: '1rem 1.25rem' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: '0.5rem',
          }}>
            <span style={{
              fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
              fontSize: '0.85rem', color: 'var(--parchment)',
            }}>
              {listLoading ? 'Loading…' : `${doneCount} of ${totalItems} items`}
            </span>
            <span style={{
              fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', fontWeight: 700,
              color: doneCount === totalItems && totalItems > 0 ? 'var(--protein-color)' : 'var(--gold)',
            }}>
              {pct}%
            </span>
          </div>
          <div style={{
            height: 8, borderRadius: 100, background: 'var(--app-border)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 100,
              width: `${pct}%`,
              background: doneCount === totalItems && totalItems > 0
                ? 'var(--protein-color)'
                : 'var(--gold)',
              transition: 'width 0.3s ease',
            }} />
          </div>
          {doneCount === totalItems && totalItems > 0 && (
            <p style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: '0.8rem',
              color: 'var(--protein-color)', fontWeight: 600,
              marginTop: '0.5rem', textAlign: 'center',
            }}>
              ✅ All done — great shop!
            </p>
          )}
        </div>
        {checkedManual > 0 && (
          <div style={{
            borderTop: '1px solid var(--app-border)',
            padding: '0.625rem 1.25rem',
            display: 'flex', gap: '0.5rem',
          }}>
            <button
              onClick={() => setManualItems(prev => prev.filter(i => !i.checked))}
              className="btn-app-ghost"
              style={{ fontSize: '0.75rem' }}
            >
              <Trash2 size={12} /> Clear {checkedManual} done
            </button>
            <button
              onClick={() => setManualItems(prev => prev.map(i => ({ ...i, checked: false })))}
              className="btn-app-ghost"
              style={{ fontSize: '0.75rem' }}
            >
              <RotateCcw size={12} /> Uncheck all
            </button>
          </div>
        )}
      </div>

      {/* Add item form */}
      {showAddForm && (
        <div className="app-card" style={{ marginBottom: '1.25rem' }}>
          <div className="app-card-header">
            <span className="app-card-title">New item</span>
          </div>
          <div className="app-card-body">
            <form onSubmit={e => { e.preventDefault(); handleAddManualItem(); setShowAddForm(false); }}>
              <div className="form-group">
                <label className="app-label">Item name</label>
                <input
                  className="app-input"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="e.g. Almond milk"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="btn-app-secondary"
                  style={{ fontSize: '0.875rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-app-primary"
                  style={{ fontSize: '0.875rem' }}
                  disabled={!newItemName.trim()}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!listLoading && totalItems === 0 && (
        <div className="app-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <ShoppingCart size={40} style={{ color: 'var(--text-subtle)', margin: '0 auto 1rem' }} />
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            No items yet. Plan some meals or tap "Add item".
          </p>
        </div>
      )}

      {/* ── Shopping Trip section ─────────────────────────────────────────── */}
      {!listLoading && filteredAggregatedItems.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            onClick={() => toggleSection('trip')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.75rem', background: 'transparent', border: 'none',
              cursor: 'pointer', borderRadius: 8,
              marginBottom: isTripCollapsed ? 0 : '0.25rem',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>🛒</span>
            <span style={{
              fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
              fontSize: '0.8rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              flex: 1, textAlign: 'left',
            }}>
              {tripStore ?? 'Shopping Trip'}
            </span>
            <span style={{
              fontFamily: 'DM Sans, monospace', fontSize: '0.7rem', fontWeight: 600,
              color: 'var(--text-subtle)', background: 'var(--app-border)',
              padding: '0.15rem 0.5rem', borderRadius: 100,
            }}>
              {filteredAggregatedItems.length}
            </span>
            {isTripCollapsed
              ? <ChevronRight size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
            }
          </button>

          {!isTripCollapsed && (
            <div className="app-card" style={{ overflow: 'hidden' }}>
              {filteredAggregatedItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    borderBottom: idx < filteredAggregatedItems.length - 1
                      ? '1px solid var(--app-border)'
                      : 'none',
                  }}
                >
                  <button
                    onClick={() => handleMarkPurchased(item as any)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center',
                      color: 'var(--app-border-strong)', transition: 'color 0.15s',
                    }}
                    aria-label="Mark as purchased"
                  >
                    <Circle size={26} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'DM Sans, sans-serif', fontSize: '1rem', fontWeight: 500,
                      color: 'var(--parchment)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {item.name}
                    </div>
                    {item.quantity && (
                      <div style={{
                        fontFamily: 'DM Sans, monospace', fontSize: '0.75rem',
                        color: 'var(--text-muted)', marginTop: '0.1rem',
                      }}>
                        {item.quantity}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setLinkingIngredient(item.name)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0.25rem', flexShrink: 0, display: 'flex', alignItems: 'center',
                      opacity: linkedByName.has(item.name.toLowerCase()) ? 1 : 0.35,
                      transition: 'opacity 0.15s', fontSize: '0.85rem',
                    }}
                    aria-label="Link product"
                    title={linkedByName.has(item.name.toLowerCase()) ? 'Edit product link' : 'Link a product'}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = linkedByName.has(item.name.toLowerCase()) ? '1' : '0.35')}
                  >
                    🔗
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── My Extras (manual items) section ─────────────────────────────── */}
      {!listLoading && manualItems.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            onClick={() => toggleSection('manual')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.75rem', background: 'transparent', border: 'none',
              cursor: 'pointer', borderRadius: 8,
              marginBottom: isManualCollapsed ? 0 : '0.25rem',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>✏️</span>
            <span style={{
              fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
              fontSize: '0.8rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              flex: 1, textAlign: 'left',
            }}>
              My Extras
            </span>
            <span style={{
              fontFamily: 'DM Sans, monospace', fontSize: '0.7rem', fontWeight: 600,
              color: allManualDone ? 'var(--protein-color)' : 'var(--text-subtle)',
              background: allManualDone ? 'rgba(138,180,160,0.12)' : 'var(--app-border)',
              padding: '0.15rem 0.5rem', borderRadius: 100,
            }}>
              {checkedManual}/{manualItems.length}
            </span>
            {isManualCollapsed
              ? <ChevronRight size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
            }
          </button>

          {!isManualCollapsed && (
            <div className="app-card" style={{ overflow: 'hidden' }}>
              {manualItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    borderBottom: idx < manualItems.length - 1 ? '1px solid var(--app-border)' : 'none',
                    background: item.checked ? 'rgba(255,255,255,0.02)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <button
                    onClick={() => handleToggleCheck(item.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center',
                      color: item.checked ? 'var(--protein-color)' : 'var(--app-border-strong)',
                      transition: 'color 0.15s',
                    }}
                    aria-label={item.checked ? 'Uncheck' : 'Check'}
                  >
                    {item.checked ? <CheckCircle2 size={26} /> : <Circle size={26} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'DM Sans, sans-serif', fontSize: '1rem', fontWeight: 500,
                      color: item.checked ? 'var(--text-subtle)' : 'var(--parchment)',
                      textDecoration: item.checked ? 'line-through' : 'none',
                      transition: 'all 0.15s',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {item.name}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteManualItem(item.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0.25rem', flexShrink: 0, display: 'flex',
                      alignItems: 'center', color: 'var(--text-subtle)',
                      opacity: 0.5, transition: 'opacity 0.15s',
                    }}
                    aria-label="Remove item"
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Done section ──────────────────────────────────────────────────── */}
      {!listLoading && !hideChecked && purchasedItems.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            onClick={() => toggleSection('done')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.75rem', background: 'transparent', border: 'none',
              cursor: 'pointer', borderRadius: 8,
              marginBottom: isDoneCollapsed ? 0 : '0.25rem',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>✅</span>
            <span style={{
              fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
              fontSize: '0.8rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              flex: 1, textAlign: 'left',
            }}>
              Done
            </span>
            <span style={{
              fontFamily: 'DM Sans, monospace', fontSize: '0.7rem', fontWeight: 600,
              color: 'var(--protein-color)', background: 'rgba(138,180,160,0.12)',
              padding: '0.15rem 0.5rem', borderRadius: 100,
            }}>
              {purchasedItems.length}
            </span>
            {isDoneCollapsed
              ? <ChevronRight size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
            }
          </button>

          {!isDoneCollapsed && (
            <div className="app-card" style={{ overflow: 'hidden' }}>
              {purchasedItems.map((p, idx) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    borderBottom: idx < purchasedItems.length - 1 ? '1px solid var(--app-border)' : 'none',
                    background: 'rgba(138,180,160,0.05)',
                  }}
                >
                  <span style={{
                    display: 'flex', alignItems: 'center',
                    color: 'var(--protein-color)', flexShrink: 0,
                  }}>
                    <CheckCircle2 size={26} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'DM Sans, sans-serif', fontSize: '1rem', fontWeight: 500,
                      color: 'var(--text-subtle)', textDecoration: 'line-through',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {p.displayName}
                    </div>
                    {p.unit && p.netQtyNeeded != null && (
                      <div style={{
                        fontFamily: 'DM Sans, monospace', fontSize: '0.75rem',
                        color: 'var(--text-muted)', marginTop: '0.1rem',
                      }}>
                        {formatQuantity(p.netQtyNeeded, p.unit)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnmarkPurchased(p.id)}
                    className="btn-app-ghost"
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', flexShrink: 0 }}
                  >
                    Unmark
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom spacer for mobile */}
      <div style={{ height: '3rem' }} />

      {/* Related links */}
      <section className="shopping-links">
        <h2>Related views</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link to="/app/plan" className="btn-app-ghost">
            Back to Weekly Plan
          </Link>
          <Link to="/app/shopping-trips" className="btn-app-ghost">
            Record Shopping Trip
          </Link>
          <Link to="/app/inventory" className="btn-app-ghost">
            View Inventory
          </Link>
          <Link to="/app/dashboard" className="btn-app-secondary">
            Dashboard
          </Link>
        </div>
      </section>

      {linkingIngredient && (
        <LinkProductModal
          ingredientName={linkingIngredient}
          onClose={() => setLinkingIngredient(null)}
        />
      )}

      <style>{`
        @media (max-width: 640px) {
          .page-header-bar { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
