import { useEffect, useMemo, useState } from 'react';
import { addStockByIngredientProduct, getPantryItems, setAutoReorder, type PantryItem, type PurchaseBreakdown } from './api';
import {
  getIngredientsCatalog,
  resolvePreferredProductsForIngredientNames,
  saveIngredientProductPreferences,
  updateIngredient,
  type IngredientCatalog,
  type IngredientProductPreference,
} from '../ingredients/api';
import { getStoreProducts } from '../store-products/api';
import { ProductCombobox } from '../ingredient-products/IngredientProductsPage';
import type { StoreProduct } from '../../domain/types';
import Combobox from '../../components/ui/Combobox';

function daysSince(dateStr?: string): string {
  if (!dateStr) return 'never';
  const d = new Date(dateStr);
  const today = new Date();
  const ms = today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatTripDate(tripDate: string): string {
  const d = new Date(tripDate);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPurchaseBreakdown(b: PurchaseBreakdown): string {
  return `${b.quantity}${b.product_name ? ` ${b.product_name}` : ''} from ${b.store} ${formatTripDate(b.trip_date)}`;
}

interface AddStockModalProps {
  ingredientName?: string;
  onClose: () => void;
  onAdded: () => void;
}

function AddStockModal({ ingredientName, onClose, onAdded }: AddStockModalProps) {
  const [name, setName] = useState(ingredientName ?? '');
  const [ingredients, setIngredients] = useState<IngredientCatalog[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [packs, setPacks] = useState<number>(1);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productMap, setProductMap] = useState<Map<string, { product: IngredientProductPreference | null; alternatives: IngredientProductPreference[] }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load ingredient catalog for searchable dropdown
  useEffect(() => {
    let cancelled = false;
    setIngredientsLoading(true);
    getIngredientsCatalog()
      .then(list => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        setIngredients(sorted);
        // If a prefilled ingredient name is provided, ensure casing matches catalog
        if (ingredientName) {
          const match = sorted.find(i => i.name.toLowerCase() === ingredientName.toLowerCase());
          if (match) setName(match.name);
        }
      })
      .finally(() => { if (!cancelled) setIngredientsLoading(false); });
    return () => { cancelled = true; };
  }, [ingredientName]);

  const selectedIngredient = useMemo(
    () => ingredients.find(i => i.name.toLowerCase() === name.trim().toLowerCase()) ?? null,
    [ingredients, name]
  );

  useEffect(() => {
    let active = true;
    async function loadProductPreferences() {
      if (!name.trim()) return;
      try {
        const map = await resolvePreferredProductsForIngredientNames([name.trim()]);
        if (!active) return;
        const resolved = map.get(name.trim().toLowerCase());
        if (!resolved) {
          setProductMap(new Map());
          setSelectedProductId(null);
          return;
        }
        const next = new Map(productMap);
        next.set(name.trim().toLowerCase(), {
          product: resolved.product,
          alternatives: resolved.alternatives,
        });
        setProductMap(next);
        setSelectedProductId(resolved.product?.storeProductId ?? null);
      } catch (err) {
        console.error(err);
        if (active) {
          setProductMap(new Map());
          setSelectedProductId(null);
        }
      }
    }
    loadProductPreferences();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const selectedProduct = useMemo(() => {
    if (!name.trim()) return null;
    const resolved = productMap.get(name.trim().toLowerCase());
    if (!resolved) return null;
    const all = [resolved.product, ...resolved.alternatives].filter((p): p is IngredientProductPreference => Boolean(p));
    return all.find(p => p.storeProductId === selectedProductId) ?? null;
  }, [name, productMap, selectedProductId]);

  const alternatives = useMemo(() => {
    if (!name.trim()) return [];
    const resolved = productMap.get(name.trim().toLowerCase());
    if (!resolved) return [];
    const all = [resolved.product, ...resolved.alternatives].filter((p): p is IngredientProductPreference => Boolean(p));
    return all;
  }, [name, productMap]);

  const handleAdd = async () => {
    if (!name.trim()) { setError('Ingredient name is required.'); return; }
    setError('');
    setLoading(true);
    try {
      if (!selectedProductId) {
        setError('No default product available for this ingredient.');
        setLoading(false);
        return;
      }
      if (!(packs > 0)) {
        setError('Enter a valid pack count.');
        setLoading(false);
        return;
      }
      await addStockByIngredientProduct(name.trim(), selectedProductId, packs);
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message || 'Failed to add stock.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Stock</h2>
        {error && <p className="form-error">{error}</p>}
        <div className="form-group">
          <label className="app-label">Ingredient</label>
          <Combobox<IngredientCatalog>
            items={ingredients}
            selectedKey={name}
            getKey={(i) => i.name}
            getLabel={(i) => i.kind === 'household' ? `${i.name} (household)` : i.name}
            onSelectKey={(key) => {
              setName(key);
              setSelectedProductId(null);
              setPacks(1);
            }}
            placeholder={ingredientsLoading ? 'Loading ingredients…' : 'Search ingredients…'}
            wrapperClassName="ip-combobox"
            listClassName="ip-combobox-list"
            optionClassName="ip-combobox-item"
          />
        </div>

        {name.trim() && (
          <div className="form-group">
            <label className="app-label">Product</label>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {alternatives.map((option) => (
                <button
                  key={option.storeProductId}
                  type="button"
                  onClick={() => setSelectedProductId(option.storeProductId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 1rem', borderRadius: 12, cursor: 'pointer',
                    border: selectedProductId === option.storeProductId ? '1.5px solid var(--gold)' : '1.5px solid var(--app-border)',
                    background: selectedProductId === option.storeProductId ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                    textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: selectedProductId === option.storeProductId ? '2px solid var(--gold)' : '2px solid var(--app-border)',
                    background: selectedProductId === option.storeProductId ? 'var(--gold)' : 'transparent',
                    boxShadow: selectedProductId === option.storeProductId ? '0 0 0 3px rgba(201,168,76,0.2)' : 'none',
                    transition: 'all 0.15s',
                  }} />
                  <div>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: 'var(--parchment)' }}>
                      {[option.brand, option.name].filter(Boolean).join(' ')}
                      {option.sizeLabel && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>· {option.sizeLabel}</span>}
                    </div>
                    <div style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      {option.isDefault ? 'Default product' : 'Alternative product'}
                    </div>
                  </div>
                </button>
              ))}
              {alternatives.length === 0 && selectedIngredient && (
                <p className="form-hint" style={{ margin: 0 }}>
                  No product preferences found. Add a default product for this ingredient first.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="app-label">How many packs did you buy?</label>
          <input
            type="number"
            min={1}
            step={1}
            value={packs}
            onChange={e => setPacks(parseInt(e.target.value || '0', 10))}
            className="app-input"
          />
          {selectedProduct?.sizeLabel && (
            <p className="form-hint">Pack size: {selectedProduct.sizeLabel}</p>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-app-primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding…' : 'Add Stock'}
          </button>
          <button className="btn-app-ghost" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [ingredientsCatalog, setIngredientsCatalog] = useState<IngredientCatalog[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingProductsFor, setEditingProductsFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, catalogRows, products] = await Promise.all([
        getPantryItems(),
        getIngredientsCatalog(),
        getStoreProducts(),
      ]);
      setItems(Array.isArray(rows) ? rows : []);
      setIngredientsCatalog(Array.isArray(catalogRows) ? catalogRows : []);
      setStoreProducts(Array.isArray(products) ? products : []);
    } catch (err) {
      console.error(err);
      const msg = (err as Error)?.message;
      setError(msg === 'Not authenticated' ? msg : 'Failed to load pantry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (item: PantryItem) => {
    try {
      await setAutoReorder(item.ingredientName, item.unit, !item.autoReorder);
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, autoReorder: !i.autoReorder } : i)));
    } catch (err) {
      console.error(err);
    }
  };

  const hasItems = items.length > 0;
  const foodItems = useMemo(() => items.filter((i) => i.kind !== 'household'), [items]);
  const householdItems = useMemo(() => items.filter((i) => i.kind === 'household'), [items]);

  const renderPantryCard = (item: PantryItem) => {
    const remaining = Math.max(0, item.remainingQty);
    const totalPurchased = Math.max(0, item.totalPurchased);
    const pct =
      totalPurchased > 0
        ? Math.max(0, Math.min(100, Math.round((remaining / totalPurchased) * 100)))
        : 100;

    return (
      <div key={item.id} className="app-card pantry-item-card">
        <div className="pantry-item-inner">
          <div className="pantry-item-header">
            <div className="pantry-item-name" title={item.ingredientName}>
              {item.ingredientName}
            </div>
            <div className="pantry-item-badge">bought {daysSince(item.lastPurchaseDate)}</div>
          </div>

          <div className="pantry-item-progress">
            <div className="pantry-progress-track" aria-hidden="true">
              <div className="pantry-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="pantry-item-qty">
              {remaining}{item.unit} remaining of {totalPurchased}{item.unit} purchased
            </div>
          </div>

          {item.purchaseBreakdowns.length > 0 && (
            <div className="pantry-item-breakdown">
              <span className="pantry-breakdown-label">Purchased from:</span>{' '}
              {item.purchaseBreakdowns.map((b, idx) => (
                <span key={idx} className="pantry-breakdown-item">
                  {formatPurchaseBreakdown(b)}{idx < item.purchaseBreakdowns.length - 1 ? '; ' : ''}
                </span>
              ))}
            </div>
          )}

          <div className="pantry-item-actions">
            <button className="btn-app-ghost" onClick={() => setAddingFor(item.ingredientName)}>
              + Add stock
            </button>
            <button className="btn-app-ghost" onClick={() => setEditingProductsFor(item.ingredientName)}>
              Edit products
            </button>
            <label className="pantry-auto-toggle">
              <input
                type="checkbox"
                checked={item.autoReorder}
                onChange={() => handleToggle(item)}
                style={{ accentColor: 'var(--protein-color)' }}
              />
              <span>Auto-reorder</span>
            </label>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Stock on hand</div>
          <h1 className="page-title">🥫 Pantry</h1>
        </div>
        <button className="btn-app-primary" onClick={() => setAddingFor('')}>
          + Add Stock
        </button>
      </div>

      {loading ? (
        <div className="app-card" style={{ padding: '1.25rem' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>Loading…</p>
        </div>
      ) : error ? (
        <div className="app-card" style={{ padding: '1.25rem', borderColor: 'rgba(220,38,38,0.25)', background: 'rgba(220,38,38,0.08)' }}>
          <p style={{ margin: 0, color: '#b91c1c', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
            {error}
          </p>
        </div>
      ) : !hasItems ? (
        <div className="app-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🥫</div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: '0.95rem' }}>
            Add your first item (or link a product) to start tracking stock.
          </p>
          <div style={{ marginTop: '1rem' }}>
            <button className="btn-app-primary" onClick={() => setAddingFor('')}>
              + Add Stock
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.75rem' }}>
          {foodItems.length > 0 && (
            <section>
              <h2 className="pantry-section-title">Food</h2>
              <div className="pantry-grid">
                {foodItems.map(renderPantryCard)}
              </div>
            </section>
          )}
          {householdItems.length > 0 && (
            <section>
              <h2 className="pantry-section-title">Household</h2>
              <div className="pantry-grid">
                {householdItems.map(renderPantryCard)}
              </div>
            </section>
          )}
        </div>
      )}

      {addingFor !== null && (
        <AddStockModal
          ingredientName={addingFor || undefined}
          onClose={() => setAddingFor(null)}
          onAdded={load}
        />
      )}

      {editingProductsFor !== null && (
        <EditIngredientProductsModal
          ingredientName={editingProductsFor}
          ingredients={ingredientsCatalog}
          storeProducts={storeProducts}
          onClose={() => setEditingProductsFor(null)}
          onSaved={load}
        />
      )}

      <style>{`
        .pantry-section-title {
          margin: 0 0 0.75rem;
          font-family: 'DM Sans, monospace';
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-subtle);
        }

        .pantry-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
          align-items: stretch;
        }

        .pantry-item-card {
          overflow: hidden;
        }

        .pantry-item-inner {
          padding: 1rem 1.125rem 1.125rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .pantry-item-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .pantry-item-name {
          font-family: 'DM Sans, sans-serif';
          font-size: 1.05rem;
          font-weight: 650;
          color: var(--parchment);
          line-height: 1.2;
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pantry-item-badge {
          flex-shrink: 0;
          font-family: 'DM Sans, monospace';
          font-size: 0.7rem;
          font-weight: 650;
          color: var(--text-subtle);
          background: var(--app-border);
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
        }

        .pantry-item-progress {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .pantry-progress-track {
          height: 9px;
          border-radius: 999px;
          background: var(--app-border);
          overflow: hidden;
        }

        .pantry-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: var(--protein-color);
          transition: width 0.3s ease;
        }

        .pantry-item-qty {
          font-family: 'DM Sans, monospace';
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .pantry-item-breakdown {
          font-family: 'DM Sans, sans-serif';
          font-size: 0.8rem;
          color: var(--text-muted);
          line-height: 1.35;
        }

        .pantry-breakdown-label {
          font-family: 'DM Sans, monospace';
          font-size: 0.7rem;
          font-weight: 650;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-subtle);
        }

        .pantry-item-actions {
          margin-top: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .pantry-auto-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-family: 'DM Sans, sans-serif';
          font-size: 0.8rem;
          color: var(--text-muted);
          user-select: none;
        }

        .pantry-auto-toggle input {
          transform: translateY(0.5px);
        }

        @media (max-width: 640px) {
          .page-header-bar { flex-direction: column; align-items: flex-start; }
          .pantry-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

interface EditIngredientProductsModalProps {
  ingredientName: string;
  ingredients: IngredientCatalog[];
  storeProducts: StoreProduct[];
  onClose: () => void;
  onSaved: () => void;
}

function EditIngredientProductsModal({
  ingredientName,
  ingredients,
  storeProducts,
  onClose,
  onSaved,
}: EditIngredientProductsModalProps) {
  const ingredient = ingredients.find(
    (i) => i.name.trim().toLowerCase() === ingredientName.trim().toLowerCase()
  ) ?? null;
  const [saving, setSaving] = useState(false);
  const [defaultStoreProductId, setDefaultStoreProductId] = useState<string | null>(ingredient?.defaultStoreProductId ?? null);
  const [alternativeStoreProductIds, setAlternativeStoreProductIds] = useState<string[]>(
    ingredient?.alternativeStoreProducts.map((p) => p.storeProductId) ?? []
  );

  if (!ingredient) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Edit Products</h2>
          <p className="form-error">Ingredient not found in catalog.</p>
          <div className="modal-actions">
            <button className="btn-app-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const selectedDefault = defaultStoreProductId
    ? storeProducts.find((p) => p.id === defaultStoreProductId) ?? null
    : null;
  const alternatives = alternativeStoreProductIds
    .map((id) => storeProducts.find((p) => p.id === id))
    .filter((p): p is StoreProduct => Boolean(p));
  const usedProductIds = [
    ...(defaultStoreProductId ? [defaultStoreProductId] : []),
    ...alternativeStoreProductIds,
  ];

  const save = async () => {
    setSaving(true);
    try {
      await updateIngredient({
        id: ingredient.id,
        name: ingredient.name,
        optional: ingredient.optional,
        pantryStaple: ingredient.pantryStaple,
        kind: ingredient.kind,
        defaultStoreProductId,
      });
      await saveIngredientProductPreferences({
        ingredientId: ingredient.id,
        defaultStoreProductId,
        alternativeStoreProductIds,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to save product links.');
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    if (!confirm(`Remove all linked products for ${ingredient.name}?`)) return;
    setSaving(true);
    try {
      await updateIngredient({
        id: ingredient.id,
        name: ingredient.name,
        optional: ingredient.optional,
        pantryStaple: ingredient.pantryStaple,
        kind: ingredient.kind,
        defaultStoreProductId: null,
      });
      await saveIngredientProductPreferences({
        ingredientId: ingredient.id,
        defaultStoreProductId: null,
        alternativeStoreProductIds: [],
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to clear product links.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Products</h2>
        <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
          <strong>{ingredient.name}</strong>
        </p>

        <div className="form-group">
          <label className="app-label">Default product</label>
          {selectedDefault ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              border: '1px solid var(--app-border)',
              borderRadius: 14,
              padding: '0.75rem 0.875rem',
              background: 'var(--app-surface)',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: 650,
                  color: 'var(--parchment)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {[selectedDefault.brand, selectedDefault.name].filter(Boolean).join(' ')}
                </div>
                {selectedDefault.sizeLabel && (
                  <div style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    {selectedDefault.sizeLabel}
                  </div>
                )}
              </div>
              <button
                className="btn-app-ghost"
                onClick={() => setDefaultStoreProductId(null)}
                disabled={saving}
                style={{ padding: '0.25rem 0.5rem', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ) : (
            <ProductCombobox
              placeholder="Search for a default product…"
              storeProducts={storeProducts}
              excludeIds={alternativeStoreProductIds}
              onSelect={(p) => setDefaultStoreProductId(p.id)}
            />
          )}
        </div>

        <div className="form-group">
          <label className="app-label">Alternative products</label>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {alternatives.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  border: '1px solid var(--app-border)',
                  borderRadius: 14,
                  padding: '0.65rem 0.75rem',
                  background: 'var(--app-surface)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontWeight: 600,
                    color: 'var(--parchment)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {[p.brand, p.name].filter(Boolean).join(' ')}
                  </div>
                  {p.sizeLabel && (
                    <div style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      {p.sizeLabel}
                    </div>
                  )}
                </div>
                <button
                  className="btn-app-ghost"
                  onClick={() => setAlternativeStoreProductIds((prev) => prev.filter((id) => id !== p.id))}
                  disabled={saving}
                  style={{ padding: '0.25rem 0.5rem', flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ))}

            <ProductCombobox
              placeholder="Add alternative product…"
              storeProducts={storeProducts}
              excludeIds={usedProductIds}
              onSelect={(p) => setAlternativeStoreProductIds((prev) => [...prev, p.id])}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-app-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-app-secondary btn-danger" onClick={clearAll} disabled={saving}>
            Delete Product Links
          </button>
          <button className="btn-app-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
