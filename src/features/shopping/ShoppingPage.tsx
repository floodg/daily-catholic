import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, CheckCircle2, Circle, ShoppingCart, RotateCcw, ChevronDown, ChevronRight, Camera } from 'lucide-react';
import type { ShoppingItem } from "../../domain/types";
import { formatQuantity, isUnmeasuredQuantity, toBaseUnit } from "./quantityUtils";
import { v4 as uuidv4 } from "../../storage/uuid";
import { formatDateLocal, getMondayLocal } from "../../lib/dateUtils";
import {
  markAggregatedItemPurchased,
  fetchPurchasedShoppingItems,
  fetchOpenShoppingListItems,
  removeOpenShoppingListItem,
  scanKitchenAnalyze,
  scanKitchenApply,
  type KitchenScanAnalyzeResult,
  type OpenShoppingListItem,
  type PurchasedShoppingItem,
} from "./api";
import { unmarkPurchasedShoppingItem } from "./api";
import { getShoppingTrips, updateShoppingTripItem } from "../shopping-trips/api";
import { supabase } from "../../lib/supabase";
import {
  resolvePreferredProductsForIngredientNames,
  resolvePreferredProductsForIngredientIds,
  type IngredientProductPreference,
} from "../ingredients/api";
import CameraCapture from "./CameraCapture";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseProductBaseSize(product: IngredientProductPreference): { qty: number; unit: 'g' | 'ml' | 'units' } | null {
  const size = Number(product.sizeValue ?? 0);
  const unit = String(product.sizeUnitCode ?? '').toLowerCase();
  if (!(size > 0) || !unit) return null;
  if (unit === 'kg') return { qty: size * 1000, unit: 'g' };
  if (unit === 'g') return { qty: size, unit: 'g' };
  if (unit === 'l') return { qty: size * 1000, unit: 'ml' };
  if (unit === 'ml') return { qty: size, unit: 'ml' };
  if (unit === 'units') return { qty: size, unit: 'units' };
  return null;
}

type SectionKey = 'trip' | 'scan' | 'manual' | 'done';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ShoppingPage() {
  const scanFileInputRef = useRef<HTMLInputElement | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [aggregatedItems, setAggregatedItems] = useState<ShoppingItem[]>([]);
  const [manualItems, setManualItems] = useState<ShoppingItem[]>([]);
  const [openScanItems, setOpenScanItems] = useState<OpenShoppingListItem[]>([]);
  const [highlightedOpenItemIds, setHighlightedOpenItemIds] = useState<Set<string>>(new Set());
  const [newItemName, setNewItemName] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanApplying, setScanApplying] = useState(false);
  const [scanSummary, setScanSummary] = useState<string | null>(null);
  const [scanReview, setScanReview] = useState<KitchenScanAnalyzeResult | null>(null);
  const [scanSelectedNames, setScanSelectedNames] = useState<Set<string>>(new Set());
  const [alternativesByItemId, setAlternativesByItemId] = useState<Map<string, IngredientProductPreference[]>>(new Map());
  const [ingredientLabelByItemId, setIngredientLabelByItemId] = useState<Map<string, string>>(new Map());
  const [ingredientIdByItemId, setIngredientIdByItemId] = useState<Map<string, string>>(new Map());
  const [swappingItem, setSwappingItem] = useState<any | null>(null);
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

  const refreshOpenScanItems = async () => {
    try {
      const rows = await fetchOpenShoppingListItems();
      setOpenScanItems(rows);
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
        const itemRows = latest.items as Array<any>;
        const storeProductIds = Array.from(
          new Set(
            itemRows
              .map((ti) => ti.storeProductId)
              .filter(Boolean)
          )
        );

        let productToIngredientId = new Map<string, string>();
        if (storeProductIds.length > 0) {
          const { data: spRows, error: spErr } = await supabase
            .from('store_products')
            .select('id, ingredient_id')
            .in('id', storeProductIds);
          if (spErr) throw spErr;
          productToIngredientId = new Map(
            ((spRows ?? []) as Array<{ id: string; ingredient_id: string | null }>)
              .filter((r) => Boolean(r.ingredient_id))
              .map((r) => [r.id, r.ingredient_id as string])
          );
        }

        const fallbackIngredientNames = Array.from(
          new Set(
            itemRows
              .filter((ti) => !ti.storeProductId || !productToIngredientId.has(ti.storeProductId))
              .map((ti) => (ti.ingredientName || ti.productName || '').trim())
              .filter(Boolean)
          )
        );

        const resolvedByName = await resolvePreferredProductsForIngredientNames(fallbackIngredientNames);
        const ingredientIds = new Set<string>();
        for (const row of itemRows) {
          const byProduct = row.storeProductId ? productToIngredientId.get(row.storeProductId) : null;
          if (byProduct) {
            ingredientIds.add(byProduct);
            continue;
          }
          const fallback = resolvedByName.get(String(row.ingredientName || row.productName || '').trim().toLowerCase());
          if (fallback?.ingredientId) ingredientIds.add(fallback.ingredientId);
        }

        const resolvedById = await resolvePreferredProductsForIngredientIds(Array.from(ingredientIds));
        const nextByItemId = new Map<string, IngredientProductPreference[]>();
        const nextLabelByItemId = new Map<string, string>();
        const nextIngredientIdByItemId = new Map<string, string>();
        for (const row of itemRows) {
          const byProduct = row.storeProductId ? productToIngredientId.get(row.storeProductId) : null;
          const fallback = resolvedByName.get(String(row.ingredientName || row.productName || '').trim().toLowerCase());
          const ingredientId = byProduct ?? fallback?.ingredientId ?? null;
          if (!ingredientId) continue;
          const resolved = resolvedById.get(ingredientId);
          if (!resolved) continue;
          const list = [resolved.product, ...resolved.alternatives].filter((p): p is IngredientProductPreference => Boolean(p));
          nextByItemId.set(row.id, list);
          nextLabelByItemId.set(row.id, resolved.ingredientName);
          nextIngredientIdByItemId.set(row.id, ingredientId);
        }
        setAlternativesByItemId(nextByItemId);
        setIngredientLabelByItemId(nextLabelByItemId);
        setIngredientIdByItemId(nextIngredientIdByItemId);
      }
      await Promise.all([refreshPurchased(), refreshOpenScanItems()]);
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

  const handleScanFilesPicked = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 3);
    setScanLoading(true);
    setScanSummary(null);
    try {
      const images = await Promise.all(
        files.map(async (file) => ({
          mimeType: file.type || 'image/jpeg',
          base64: await fileToBase64(file),
        }))
      );
      const result = await scanKitchenAnalyze(images);
      setScanReview(result);
      setScanSelectedNames(new Set([...result.missing, ...result.low]));
      if (result.message) {
        setScanSummary(result.message);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to analyse kitchen photos.');
    } finally {
      setScanLoading(false);
      if (scanFileInputRef.current) {
        scanFileInputRef.current.value = '';
      }
    }
  };

  const handleApplyScan = async () => {
    if (!scanReview) return;
    const names = Array.from(scanSelectedNames);
    setScanApplying(true);
    try {
      const result = await scanKitchenApply(names);
      await refreshOpenScanItems();
      const insertedSet = new Set(result.insertedNames.map((n) => n.toLowerCase()));
      const rows = await fetchOpenShoppingListItems();
      const newIds = rows
        .filter((row) => insertedSet.has(row.ingredientName.toLowerCase()))
        .map((row) => row.id);
      setHighlightedOpenItemIds(new Set(newIds));
      window.setTimeout(() => setHighlightedOpenItemIds(new Set()), 12000);

      setScanReview(null);
      setScanSummary(
        `Added ${result.added} item${result.added === 1 ? '' : 's'} · ` +
        `${result.skipped} already on list · ` +
        `couldn't assess ${scanReview.unknownCount}`
      );
    } catch (err) {
      console.error(err);
      alert('Failed to add scan suggestions.');
    } finally {
      setScanApplying(false);
    }
  };

  const handleRemoveOpenItem = async (id: string) => {
    try {
      await removeOpenShoppingListItem(id);
      await refreshOpenScanItems();
    } catch (err) {
      console.error(err);
      alert('Failed to remove item.');
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
  const totalItems = filteredAggregatedItems.length + openScanItems.length + manualItems.length + purchasedItems.length;
  const doneCount = purchasedItems.length + checkedManual;
  const pct = totalItems === 0 ? 0 : Math.round((doneCount / totalItems) * 100);
  const isTripCollapsed = collapsedSections.has('trip');
  const isScanCollapsed = collapsedSections.has('scan');
  const isManualCollapsed = collapsedSections.has('manual');
  const isDoneCollapsed = collapsedSections.has('done');

  function SwapProductModal({ item, onClose }: { item: any; onClose: () => void }) {
    const [options, setOptions] = useState<IngredientProductPreference[]>(alternativesByItemId.get(item.id) ?? []);
    const ingredientLabel = ingredientLabelByItemId.get(item.id) ?? item.ingredientName ?? item.name;
    const ingredientId = ingredientIdByItemId.get(item.id) ?? null;
    const [saving, setSaving] = useState(false);
    const [loadingOptions, setLoadingOptions] = useState(false);

    useEffect(() => {
      let active = true;
      async function loadLiveOptions() {
        if (!ingredientId && !ingredientLabel) return;
        setLoadingOptions(true);
        try {
          const byId = ingredientId
            ? await resolvePreferredProductsForIngredientIds([ingredientId])
            : new Map();
          const byName = ingredientLabel
            ? await resolvePreferredProductsForIngredientNames([ingredientLabel])
            : new Map();
          if (!active) return;

          const fromId = ingredientId
            ? byId.get(ingredientId)
            : undefined;
          const fromName = byName.get(String(ingredientLabel).trim().toLowerCase());

          const listFromId = fromId
            ? [fromId.product, ...fromId.alternatives].filter((p): p is IngredientProductPreference => Boolean(p))
            : [];
          const listFromName = fromName
            ? [fromName.product, ...fromName.alternatives].filter((p): p is IngredientProductPreference => Boolean(p))
            : [];

          // Prefer the richer set; this guards against edge cases where item-level mapping is incomplete.
          const nextOptions = listFromName.length > listFromId.length ? listFromName : listFromId;
          setOptions(nextOptions);
        } catch (err) {
          console.error(err);
        } finally {
          if (active) setLoadingOptions(false);
        }
      }
      loadLiveOptions();
      return () => { active = false; };
    }, [ingredientId, ingredientLabel]);

    const handleSwap = async (product: IngredientProductPreference) => {
      setSaving(true);
      try {
        const base = parseProductBaseSize(product);
        await updateShoppingTripItem(item.id, {
          productName: [product.brand, product.name].filter(Boolean).join(' '),
          packQuantity: base?.qty ?? null,
          packUnit: base?.unit ?? null,
          storeProductId: product.storeProductId,
        });
        await generateShoppingList();
        onClose();
      } catch (err) {
        console.error(err);
        alert('Failed to swap product.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Swap Product</h2>
          <p><strong>{ingredientLabel}</strong></p>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {options.map((product) => (
              <button
                key={product.storeProductId}
                className="btn-app-ghost"
                disabled={saving}
                onClick={() => handleSwap(product)}
                style={{ textAlign: 'left' }}
              >
                <span>
                  {product.brand && (
                    <span style={{ color: 'var(--text-subtle)', fontStyle: 'italic', marginRight: '0.35rem' }}>
                      {product.brand}
                    </span>
                  )}
                  <span>{product.name}{product.sizeLabel ? ` (${product.sizeLabel})` : ''}</span>
                </span>
              </button>
            ))}
            {loadingOptions && (
              <p className="form-hint">Loading products…</p>
            )}
            {!loadingOptions && options.length === 0 && (
              <p className="form-hint">No alternatives configured for this ingredient.</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn-app-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  function ScanReviewModal({
    review,
    selected,
    applying,
    onToggle,
    onApply,
    onClose,
  }: {
    review: KitchenScanAnalyzeResult;
    selected: Set<string>;
    applying: boolean;
    onToggle: (name: string) => void;
    onApply: () => void;
    onClose: () => void;
  }) {
    const candidates = [...review.missing, ...review.low];
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Kitchen Scan Results</h2>
          <p>Select items to add to your shopping list.</p>
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
            {candidates.map((name) => (
              <label
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontFamily: 'DM Sans, sans-serif',
                  color: 'var(--parchment)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(name)}
                  onChange={() => onToggle(name)}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
          {review.unknownCount > 0 && (
            <p className="form-hint" style={{ marginTop: '0.75rem' }}>
              Couldn&apos;t assess {review.unknownCount} ingredient{review.unknownCount === 1 ? '' : 's'}.
            </p>
          )}
          <div className="modal-actions">
            <button className="btn-app-secondary" onClick={onClose} disabled={applying}>Cancel</button>
            <button className="btn-app-primary" onClick={onApply} disabled={applying || selected.size === 0}>
              {applying ? 'Adding...' : `Add ${selected.size} item${selected.size === 1 ? '' : 's'}`}
            </button>
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
            onClick={() => scanFileInputRef.current?.click()}
            className="btn-app-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
            disabled={scanLoading || scanApplying}
          >
            <Camera size={14} /> {scanLoading ? 'Analysing...' : 'Scan Kitchen'}
          </button>
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
      <CameraCapture
        ref={scanFileInputRef}
        onFilesSelected={(files) => void handleScanFilesPicked(files)}
      />
      {scanSummary && (
        <div className="app-card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {scanSummary}
          </p>
        </div>
      )}

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
                    onClick={() => setSwappingItem(item)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0.25rem', flexShrink: 0, display: 'flex', alignItems: 'center',
                      opacity: 0.8,
                      transition: 'opacity 0.15s', fontSize: '0.85rem',
                    }}
                    aria-label="Swap product"
                    title="Swap product"
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
                  >
                    🔄
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── From scans & reorder section ─────────────────────────────── */}
      {!listLoading && openScanItems.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            onClick={() => toggleSection('scan')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.75rem', background: 'transparent', border: 'none',
              cursor: 'pointer', borderRadius: 8,
              marginBottom: isScanCollapsed ? 0 : '0.25rem',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>📸</span>
            <span style={{
              fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
              fontSize: '0.8rem', letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              flex: 1, textAlign: 'left',
            }}>
              From Scans & Reorder
            </span>
            <span style={{
              fontFamily: 'DM Sans, monospace', fontSize: '0.7rem', fontWeight: 600,
              color: 'var(--text-subtle)', background: 'var(--app-border)',
              padding: '0.15rem 0.5rem', borderRadius: 100,
            }}>
              {openScanItems.length}
            </span>
            {isScanCollapsed
              ? <ChevronRight size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
            }
          </button>

          {!isScanCollapsed && (
            <div className="app-card" style={{ overflow: 'hidden' }}>
              {openScanItems.map((row, idx) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.875rem 1rem',
                    borderBottom: idx < openScanItems.length - 1 ? '1px solid var(--app-border)' : 'none',
                    background: highlightedOpenItemIds.has(row.id) ? 'rgba(226,186,84,0.1)' : 'transparent',
                    transition: 'background 0.4s ease',
                  }}
                >
                  <span style={{ color: 'var(--app-border-strong)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Circle size={26} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'DM Sans, sans-serif', fontSize: '1rem', fontWeight: 500,
                      color: 'var(--parchment)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {row.ingredientName}
                    </div>
                    <div style={{
                      fontFamily: 'DM Sans, monospace', fontSize: '0.72rem',
                      color: 'var(--text-muted)', marginTop: '0.1rem',
                    }}>
                      {row.source === 'kitchen_scan' ? 'Kitchen scan' : row.source}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleRemoveOpenItem(row.id)}
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

      {swappingItem && (
        <SwapProductModal
          item={swappingItem}
          onClose={() => setSwappingItem(null)}
        />
      )}

      {scanReview && (
        <ScanReviewModal
          review={scanReview}
          selected={scanSelectedNames}
          applying={scanApplying}
          onToggle={(name) => {
            setScanSelectedNames(prev => {
              const next = new Set(prev);
              if (next.has(name)) next.delete(name);
              else next.add(name);
              return next;
            });
          }}
          onApply={() => void handleApplyScan()}
          onClose={() => setScanReview(null)}
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
