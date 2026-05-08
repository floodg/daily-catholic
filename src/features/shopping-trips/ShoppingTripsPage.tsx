import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ShoppingBag, ChevronDown, ChevronRight, Trash2, Calendar, Package } from 'lucide-react';
import type { Meal, MealIngredientProduct, ShoppingTrip, ShoppingTripItem, StoreProduct } from '../../domain/types';
import {
  getShoppingTrips,
  createShoppingTrip,
  updateShoppingTrip,
  deleteShoppingTrip,
  addShoppingTripItem,
  updateShoppingTripItem,
  deleteShoppingTripItem,
} from './api';
import { getMealsForUser } from '../meals/api';
import { getStoreProducts } from '../store-products/api';
import { normalizeUnit, parseQuantity } from '../shopping/quantityUtils';
import { resolvePreferredProductsForIngredientNames } from '../ingredients/api';
import Combobox from '../../components/ui/Combobox';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORES = ['Coles', 'Woolworths', 'ALDI', 'IGA', 'Harris Farm', 'Other'];
const DROPDOWN_CLOSE_DELAY_MS = 150;

const UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'units', label: 'units' },
];

/** Map any unit string to a dropdown value (g, kg, ml, units). */
function unitForDropdown(raw: string): string {
  const u = normalizeUnit(raw);
  if (u === 'l') return 'ml';
  if (['g', 'kg', 'ml', 'units'].includes(u)) return u;
  return 'units';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayLocalISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatRelative(iso: string): string {
  const diffDays = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  return `${Math.round(diffDays / 7)} weeks ago`;
}

function buildProductAlternativesMap(meals: Meal[]): Map<string, MealIngredientProduct[]> {
  const map = new Map<string, MealIngredientProduct[]>();
  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      if (ing.primaryProduct && ing.productOptions && ing.productOptions.length > 0) {
        if (!map.has(ing.primaryProduct.id)) {
          map.set(ing.primaryProduct.id, ing.productOptions);
        }
      }
    }
  }
  return map;
}

function parseSizeLabel(sizeLabel: string): { packQuantity: string; packUnit: string } | null {
  const match = sizeLabel.trim().match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  if (match) return { packQuantity: match[1], packUnit: match[2].trim() };
  return null;
}

function MealCombobox({
  meals,
  selectedMealId,
  onSelect,
  disabled,
  placeholder = 'Select a meal…',
}: {
  meals: Meal[];
  selectedMealId: string;
  onSelect: (mealId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Combobox<Meal>
      items={meals}
      selectedKey={selectedMealId}
      getKey={(m) => m.id}
      getLabel={(m) => m.name}
      onSelectKey={onSelect}
      disabled={disabled}
      placeholder={placeholder}
      wrapperClassName="link-product-combobox"
      listClassName="link-product-suggestions"
      optionClassName="link-product-suggestion-item"
      renderOption={(meal) => (
        <>
          <span className="suggestion-name">{meal.name}</span>
          <span className="suggestion-store">Meal</span>
        </>
      )}
    />
  );
}

// ─── Alternatives Modal ────────────────────────────────────────────────────────

interface AlternativesModalProps {
  ingredientName: string;
  primaryProduct?: StoreProduct;
  alternatives: MealIngredientProduct[];
  onClose: () => void;
}

function AlternativesModal({ ingredientName, primaryProduct, alternatives, onClose }: AlternativesModalProps) {
  const allProducts: MealIngredientProduct[] = [
    ...(primaryProduct ? [primaryProduct as MealIngredientProduct] : []),
    ...alternatives,
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{ingredientName}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="modal-subtitle">AVAILABLE PRODUCTS</p>
        <div className="modal-products">
          {allProducts.map(p => (
            <div key={p.id} className="modal-product-card">
              <div className="modal-product-info">
                <span className="modal-product-name">{p.name}</span>
                <span className="modal-product-meta">
                  {[p.brand, p.sizeLabel].filter(Boolean).join(' · ')}
                </span>
                {p.productUrl && (
                  <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className="modal-product-store-link">
                    {p.store}
                  </a>
                )}
              </div>
              {p.productUrl && (
                <a href={p.productUrl} target="_blank" rel="noopener noreferrer" className="btn-app-primary">
                  Open Product ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Product Name Combobox ─────────────────────────────────────────────────────

interface ProductComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (product: StoreProduct) => void;
  storeProducts: StoreProduct[];
}

function ProductCombobox({ value, onChange, onSelect, storeProducts }: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = storeProducts.filter(p => {
    if (!value.trim()) return true;
    const q = value.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand?.toLowerCase().includes(q) ?? false);
  });

  const handleSelect = (product: StoreProduct) => {
    onSelect(product);
    setOpen(false);
  };

  return (
    <div className="product-name-combobox" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), DROPDOWN_CLOSE_DELAY_MS)}
        placeholder="Product name"
        className="app-input"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="product-suggestions" role="listbox">
          {filtered.map(product => (
            <li key={product.id} className="product-suggestion-item" onMouseDown={() => handleSelect(product)} role="option">
              <span className="suggestion-name">
                {product.brand ? `${product.brand} ` : ''}{product.name}
              </span>
              {product.sizeLabel && <span className="suggestion-meta">{product.sizeLabel}</span>}
              <span className="suggestion-store">{product.store}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Add Item Form ─────────────────────────────────────────────────────────────

interface AddItemFormProps {
  tripId: string;
  onSave: (item: ShoppingTripItem) => void;
  storeProducts: StoreProduct[];
}

function AddItemForm({ tripId, onSave, storeProducts }: AddItemFormProps) {
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [packQuantity, setPackQuantity] = useState('');
  const [packUnit, setPackUnit] = useState('units');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleProductSelect = (product: StoreProduct) => {
    setProductName(product.brand ? `${product.brand} ${product.name}` : product.name);
    if (product.sizeLabel) {
      const parsed = parseSizeLabel(product.sizeLabel);
      if (parsed) {
        setPackQuantity(parsed.packQuantity);
        setPackUnit(unitForDropdown(parsed.packUnit));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) { setError('Product name is required.'); return; }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number.'); return; }
    setSaving(true);
    setError('');
    try {
      const item = await addShoppingTripItem({
        shoppingTripId: tripId,
        productName: productName.trim(),
        quantityPurchased: qty,
        packQuantity: packQuantity ? parseFloat(packQuantity) : undefined,
        packUnit: packUnit.trim() || undefined,
      });
      onSave(item);
      setProductName('');
      setQuantity('1');
      setPackQuantity('');
      setPackUnit('units');
    } catch (err) {
      setError('Failed to add item.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 90px', gap: '0.625rem', marginBottom: '0.75rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="app-label">Product name</label>
          <ProductCombobox value={productName} onChange={setProductName} onSelect={handleProductSelect} storeProducts={storeProducts} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="app-label">Qty</label>
          <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="0.01" step="0.01" className="app-input" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="app-label">Pack size</label>
          <input type="number" value={packQuantity} onChange={e => setPackQuantity(e.target.value)} placeholder="e.g. 500" min="0.01" step="0.01" className="app-input" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="app-label">Unit</label>
          <select
            className="app-input"
            value={packUnit}
            onChange={e => setPackUnit(e.target.value)}
          >
            {UNIT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn-app-primary" style={{ fontSize: '0.875rem' }} disabled={saving}>
          {saving ? '…' : '+ Add'}
        </button>
      </div>
    </form>
  );
}

// ─── Trip Item Row ─────────────────────────────────────────────────────────────

interface TripItemRowProps {
  item: ShoppingTripItem;
  onUpdate: (item: ShoppingTripItem) => void;
  onDelete: (id: string) => void;
  storeProducts: StoreProduct[];
  productAlternativesMap: Map<string, MealIngredientProduct[]>;
}

function TripItemRow({ item, onUpdate, onDelete, storeProducts, productAlternativesMap }: TripItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [productName, setProductName] = useState(item.productName);
  const [quantity, setQuantity] = useState(String(item.quantityPurchased));
  const [packQuantity, setPackQuantity] = useState(item.packQuantity != null ? String(item.packQuantity) : '');
  const [packUnit, setPackUnit] = useState(unitForDropdown(item.packUnit ?? 'units'));
  const [saving, setSaving] = useState(false);

  const linkedProduct = item.storeProductId
    ? storeProducts.find(p => p.id === item.storeProductId)
    : undefined;

  const alternatives = item.storeProductId
    ? (productAlternativesMap.get(item.storeProductId) ?? [])
    : [];

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateShoppingTripItem(item.id, {
        productName: productName.trim(),
        quantityPurchased: parseFloat(quantity) || 1,
        packQuantity: packQuantity ? parseFloat(packQuantity) : null,
        packUnit: packUnit.trim() || null,
      });
      onUpdate(updated);
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove "${item.productName}"?`)) return;
    try {
      await deleteShoppingTripItem(item.id);
      onDelete(item.id);
    } catch (err) {
      console.error(err);
    }
  };

  if (editing) {
    return (
      <div style={{ padding: '0.875rem 1.125rem', borderTop: '1px solid var(--app-border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 90px', gap: '0.625rem', marginBottom: '0.75rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="app-label">Product name</label>
            <input type="text" value={productName} onChange={e => setProductName(e.target.value)} className="app-input" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="app-label">Qty</label>
            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="0.01" step="0.01" className="app-input" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="app-label">Pack size</label>
            <input type="number" value={packQuantity} onChange={e => setPackQuantity(e.target.value)} min="0.01" step="0.01" placeholder="e.g. 500" className="app-input" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="app-label">Unit</label>
            <select
              className="app-input"
              value={packUnit}
              onChange={e => setPackUnit(e.target.value)}
            >
              {UNIT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn-app-ghost" style={{ fontSize: '0.875rem' }} onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn-app-primary" style={{ fontSize: '0.875rem' }} onClick={handleSave} disabled={saving}>
            {saving ? '…' : '✓ Save'}
          </button>
        </div>
      </div>
    );
  }

  const packLabel = item.packQuantity
    ? `${item.packQuantity}${item.packUnit ?? ''}`
    : null;

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.625rem 1.125rem',
        }}
      >
        <Package size={13} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '0.88rem', color: 'var(--parchment)' }}>
            {item.productName}
          </span>
          {linkedProduct?.productUrl && (
            <a
              href={linkedProduct.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: '0.25rem', fontSize: '0.75rem', color: 'var(--gold)' }}
              title="Open product page"
            >
              ↗
            </a>
          )}
        </div>
        {packLabel && (
          <span style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {packLabel}
          </span>
        )}
        <span style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          ×{item.quantityPurchased}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.125rem', flexShrink: 0 }}>
          {alternatives.length > 0 && (
            <button
              onClick={() => setShowAlternatives(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.8rem' }}
              title="View alternatives"
            >
              🔄
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.8rem' }}
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', fontSize: '0.8rem', color: 'var(--text-subtle)', opacity: 0.5, transition: 'opacity 0.15s' }}
            title="Remove"
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {showAlternatives && (
        <AlternativesModal
          ingredientName={item.productName}
          primaryProduct={linkedProduct}
          alternatives={alternatives}
          onClose={() => setShowAlternatives(false)}
        />
      )}
    </>
  );
}

// ─── Trip Card ─────────────────────────────────────────────────────────────────

interface TripCardProps {
  trip: ShoppingTrip;
  onUpdate: (trip: ShoppingTrip) => void;
  onDelete: (id: string) => void;
  storeProducts: StoreProduct[];
  meals: Meal[];
  productAlternativesMap: Map<string, MealIngredientProduct[]>;
}

function TripCard({ trip, onUpdate, onDelete, storeProducts, meals, productAlternativesMap }: TripCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [store, setStore] = useState(trip.store);
  const [purchasedAt, setPurchasedAt] = useState(trip.purchasedAt.slice(0, 16));
  const [notes, setNotes] = useState(trip.notes ?? '');
  const [savingTrip, setSavingTrip] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState('');
  const [addingFromMeal, setAddingFromMeal] = useState(false);
  const [addFromMealError, setAddFromMealError] = useState('');

  const storeIconBg = trip.store === 'Coles' ? 'rgba(168,196,224,0.15)'
    : trip.store === 'Woolworths' ? 'rgba(138,180,160,0.15)'
    : 'var(--gold-light)';

  const handleTripSave = async () => {
    setSavingTrip(true);
    try {
      const updated = await updateShoppingTrip(trip.id, {
        store: store.trim(),
        purchasedAt: new Date(purchasedAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      onUpdate(updated);
      setEditingTrip(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTrip(false);
    }
  };

  const handleTripDelete = async () => {
    if (!confirm(`Delete trip at ${trip.store} on ${formatDate(trip.purchasedAt)}?`)) return;
    try {
      await deleteShoppingTrip(trip.id);
      onDelete(trip.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemAdded = (item: ShoppingTripItem) => {
    onUpdate({ ...trip, items: [...trip.items, item] });
  };

  const handleItemUpdated = (updated: ShoppingTripItem) => {
    onUpdate({ ...trip, items: trip.items.map(i => i.id === updated.id ? updated : i) });
  };

  const handleItemDeleted = (id: string) => {
    onUpdate({ ...trip, items: trip.items.filter(i => i.id !== id) });
  };

  const handleAddFromMeal = async () => {
    const meal = meals.find(m => m.id === selectedMealId);
    if (!meal || meal.ingredients.length === 0) return;
    setAddingFromMeal(true);
    setAddFromMealError('');
    try {
      const preferenceMap = await resolvePreferredProductsForIngredientNames(
        meal.ingredients.map(ing => ing.name)
      );
      const newItems = await Promise.all(
        meal.ingredients.map(ing => {
          const preferred = preferenceMap.get(ing.name.toLowerCase());
          const product = preferred?.product
            ? {
                id: preferred.product.storeProductId,
                name: preferred.product.name,
                brand: preferred.product.brand ?? undefined,
                sizeLabel: preferred.product.sizeLabel ?? undefined,
                store: preferred.product.store,
                productUrl: preferred.product.productUrl ?? null,
              }
            : ing.primaryProduct;
          let productName: string;
          let packQuantity: number | undefined;
          let packUnit: string | undefined;
          const ingredientName: string | undefined = ing.name.toLowerCase();

          if (product) {
            productName = [product.brand, product.name].filter(Boolean).join(' ');
            if (product.sizeLabel) {
              const parsed = parseSizeLabel(product.sizeLabel);
              if (parsed) {
                packQuantity = parseFloat(parsed.packQuantity) || undefined;
                packUnit = parsed.packUnit ? normalizeUnit(parsed.packUnit) : undefined;
              }
            }
          } else {
            productName = ing.name;
            if (ing.quantityNum != null && ing.unit) {
              packQuantity = ing.quantityNum;
              packUnit = normalizeUnit(ing.unit);
            } else {
              const parsed = ing.quantity ? parseQuantity(ing.quantity) : null;
              if (parsed) {
                packQuantity = parsed.amount;
                packUnit = normalizeUnit(parsed.unit);
              }
            }
            if (packUnit && !['g', 'kg', 'ml', 'l', 'units', 'tbsp', 'tsp', 'cup'].includes(packUnit)) {
              packUnit = 'units';
            }
          }

          return addShoppingTripItem({
            shoppingTripId: trip.id,
            productName,
            quantityPurchased: 1,
            packQuantity,
            packUnit,
            storeProductId: product?.id,
            ingredientName,
          });
        })
      );
      onUpdate({ ...trip, items: [...trip.items, ...newItems] });
      setSelectedMealId('');
    } catch (err) {
      setAddFromMealError('Failed to add meal ingredients.');
      console.error(err);
    } finally {
      setAddingFromMeal(false);
    }
  };

  return (
    <div className={`app-card${expanded ? ' trip-card-expanded' : ''}`} style={{ marginBottom: '0.75rem' }}>

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <button
        onClick={() => !editingTrip && setExpanded(e => !e)}
        style={{
          width: '100%', background: 'none', border: 'none',
          cursor: editingTrip ? 'default' : 'pointer',
          padding: '1rem 1.125rem', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: '0.875rem',
        }}
      >
        {/* Store icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: storeIconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.25rem',
        }}>
          🛒
        </div>

        {/* Details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
            fontSize: '0.95rem', color: 'var(--parchment)',
            display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
          }}>
            {trip.store}
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', background: 'var(--app-border)',
              color: 'var(--text-muted)', padding: '0.15rem 0.5rem', borderRadius: 100,
            }}>
              {trip.items.length} item{trip.items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.875rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: '0.78rem',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem',
            }}>
              <Calendar size={11} />
              {formatRelative(trip.purchasedAt)} · {formatDate(trip.purchasedAt)}
            </span>
            {trip.notes && (
              <span style={{
                fontFamily: 'DM Sans, sans-serif', fontSize: '0.78rem',
                color: 'var(--text-muted)', fontStyle: 'italic',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
              }}>
                {trip.notes}
              </span>
            )}
          </div>
        </div>

        {/* Actions + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setEditingTrip(true); setExpanded(true); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.85rem', borderRadius: 6, color: 'var(--text-muted)' }}
            title="Edit trip"
          >
            ✏️
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleTripDelete(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.85rem', borderRadius: 6, color: 'var(--text-muted)' }}
            title="Delete trip"
          >
            🗑️
          </button>
          {expanded
            ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
          }
        </div>
      </button>

      {/* ── Edit form ───────────────────────────────────────────────────── */}
      {editingTrip && (
        <div style={{ borderTop: '1px solid var(--app-border)', padding: '1rem 1.125rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="app-label">Store</label>
              <select className="app-input" value={store} onChange={e => setStore(e.target.value)}>
                {STORES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="app-label">Date &amp; Time</label>
              <input type="datetime-local" className="app-input" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="app-label">Notes</label>
            <input className="app-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn-app-secondary" style={{ fontSize: '0.875rem' }} onClick={() => setEditingTrip(false)}>
              Cancel
            </button>
            <button className="btn-app-primary" style={{ fontSize: '0.875rem' }} onClick={handleTripSave} disabled={savingTrip}>
              {savingTrip ? 'Saving…' : '✓ Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── Expanded body ───────────────────────────────────────────────── */}
      {expanded && !editingTrip && (
        <div style={{ borderTop: '1px solid var(--app-border)' }}>

          {/* Items list */}
          {trip.items.length === 0 ? (
            <div style={{ padding: '1.5rem 1.125rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No items yet. Add the first one below.
              </p>
            </div>
          ) : (
            <div>
              {trip.items.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    borderBottom: idx < trip.items.length - 1 ? '1px solid var(--app-border)' : 'none',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                  }}
                >
                  <TripItemRow
                    item={item}
                    onUpdate={handleItemUpdated}
                    onDelete={handleItemDeleted}
                    storeProducts={storeProducts}
                    productAlternativesMap={productAlternativesMap}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add from Meal */}
          {meals.length > 0 && (
            <div style={{ borderTop: '1px solid var(--app-border)', padding: '0.875rem 1.125rem' }}>
              <label className="app-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Add from Meal</label>
              {addFromMealError && <p className="form-error">{addFromMealError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <MealCombobox
                  meals={meals}
                  selectedMealId={selectedMealId}
                  onSelect={setSelectedMealId}
                  disabled={addingFromMeal}
                />
                <button
                  className="btn-app-primary"
                  onClick={handleAddFromMeal}
                  disabled={!selectedMealId || addingFromMeal}
                  style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                >
                  {addingFromMeal ? 'Adding…' : '+ Add ingredients'}
                </button>
              </div>
            </div>
          )}

          {/* Add Item */}
          <div style={{ borderTop: '1px solid var(--app-border)', padding: '0.875rem 1.125rem' }}>
            <label className="app-label" style={{ display: 'block', marginBottom: '0.625rem' }}>Add Item</label>
            <AddItemForm tripId={trip.id} onSave={handleItemAdded} storeProducts={storeProducts} />
          </div>

          {/* Footer */}
          <div style={{
            borderTop: '1px solid var(--app-border)',
            padding: '0.75rem 1.125rem',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button onClick={handleTripDelete} className="btn-app-ghost btn-danger" style={{ fontSize: '0.75rem' }}>
              <Trash2 size={12} /> Delete trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ShoppingTripsPage() {
  const [trips, setTrips] = useState<ShoppingTrip[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  // New trip form state
  const [newStore, setNewStore] = useState('Coles');
  const [newPurchasedAt, setNewPurchasedAt] = useState(todayLocalISO());
  const [newNotes, setNewNotes] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [newError, setNewError] = useState('');

  useEffect(() => {
    Promise.all([getShoppingTrips(), getStoreProducts()])
      .then(([fetchedTrips, fetchedProducts]) => {
        setTrips(fetchedTrips);
        setStoreProducts(fetchedProducts);
      })
      .catch(err => {
        setError('Failed to load shopping trips.');
        console.error(err);
      })
      .finally(() => setLoading(false));

    getMealsForUser()
      .then(setMeals)
      .catch(err => console.error('Failed to load meals:', err));
  }, []);

  const productAlternativesMap = buildProductAlternativesMap(meals);
  const totalItems = trips.reduce((sum, t) => sum + t.items.length, 0);
  const openTrips = trips.filter(t => !t.completedAt);
  const completedTrips = trips.filter(t => !!t.completedAt);

  const handleNewTripSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStore.trim()) { setNewError('Store is required.'); return; }
    setSavingNew(true);
    setNewError('');
    try {
      const trip = await createShoppingTrip({
        store: newStore.trim(),
        purchasedAt: new Date(newPurchasedAt).toISOString(),
        notes: newNotes.trim() || undefined,
      });
      setTrips(prev => [trip, ...prev]);
      setShowNewForm(false);
      setNewStore('Coles');
      setNewPurchasedAt(todayLocalISO());
      setNewNotes('');
    } catch (err) {
      setNewError('Failed to create shopping trip.');
      console.error(err);
    } finally {
      setSavingNew(false);
    }
  };

  const handleTripUpdated = (updated: ShoppingTrip) => {
    setTrips(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const handleTripDeleted = (id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div>

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">History</div>
          <h1 className="page-title">🧾 Shopping <em>Trips</em></h1>
        </div>
        <button
          onClick={() => setShowNewForm(s => !s)}
          className="btn-app-primary"
          style={{ fontSize: '0.875rem' }}
        >
          <Plus size={15} /> Log trip
        </button>
      </div>

      {/* ── Summary stats ──────────────────────────────────────────────── */}
      {!loading && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem', marginBottom: '1.5rem',
        }}>
          {[
            { icon: <ShoppingBag size={16} />, label: 'Total trips',  value: trips.length.toString(),                                          color: 'var(--gold)' },
            { icon: <Package size={16} />,     label: 'Total items',  value: totalItems.toString(),                                            color: 'var(--protein-color)' },
            { icon: <Calendar size={16} />,    label: 'Last shop',    value: trips[0] ? formatRelative(trips[0].purchasedAt) : '—',            color: 'var(--fat-color)' },
          ].map(card => (
            <div key={card.label} className="app-card" style={{ padding: '0.875rem 1rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                color: card.color, marginBottom: '0.25rem',
              }}>
                {card.icon}
                <span style={{
                  fontFamily: 'DM Sans, sans-serif', fontSize: '0.65rem',
                  fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {card.label}
                </span>
              </div>
              <div style={{
                fontFamily: 'DM Sans, monospace', fontWeight: 800,
                fontSize: '1.25rem', color: 'var(--parchment)',
              }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Log trip form ───────────────────────────────────────────────── */}
      {showNewForm && (
        <div className="app-card" style={{ marginBottom: '1.5rem' }}>
          <div className="app-card-header">
            <span className="app-card-title">Log a trip</span>
          </div>
          <div className="app-card-body">
            <form onSubmit={handleNewTripSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label">Store</label>
                  <select className="app-input" value={newStore} onChange={e => setNewStore(e.target.value)}>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="app-label">Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    className="app-input"
                    value={newPurchasedAt}
                    onChange={e => setNewPurchasedAt(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="app-label">Notes (optional)</label>
                <input
                  className="app-input"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="e.g. Weekly keto shop"
                />
              </div>
              {newError && <p className="form-error">{newError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="btn-app-secondary"
                  style={{ fontSize: '0.875rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-app-primary"
                  style={{ fontSize: '0.875rem' }}
                  disabled={savingNew}
                >
                  <ShoppingBag size={14} /> {savingNew ? 'Saving…' : 'Save trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Loading / error / empty ─────────────────────────────────────── */}
      {loading ? (
        <div className="app-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading trips…</p>
        </div>
      ) : error ? (
        <div className="app-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{error}</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="app-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <ShoppingBag size={40} style={{ color: 'var(--text-subtle)', margin: '0 auto 1rem' }} />
          <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            No trips logged yet. Tap "Log trip" after your next Coles run.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 700,
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
              padding: '0 0.25rem',
            }}>
              Open Trips ({openTrips.length})
            </div>
            {openTrips.length === 0 ? (
              <div className="app-card" style={{ padding: '1rem 1.125rem', marginBottom: '1rem' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No open trips.
                </p>
              </div>
            ) : (
              openTrips.map(trip => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onUpdate={handleTripUpdated}
                  onDelete={handleTripDeleted}
                  storeProducts={storeProducts}
                  meals={meals}
                  productAlternativesMap={productAlternativesMap}
                />
              ))
            )}
          </div>

          <div>
            <div style={{
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 700,
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
              padding: '0 0.25rem',
            }}>
              Completed Trips ({completedTrips.length})
            </div>
            {completedTrips.length === 0 ? (
              <div className="app-card" style={{ padding: '1rem 1.125rem' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No completed trips yet.
                </p>
              </div>
            ) : (
              completedTrips.map(trip => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onUpdate={handleTripUpdated}
                  onDelete={handleTripDeleted}
                  storeProducts={storeProducts}
                  meals={meals}
                  productAlternativesMap={productAlternativesMap}
                />
              ))
            )}
          </div>
        </div>
      )}

      <div style={{ height: '2rem' }} />

      {/* ── Related links ───────────────────────────────────────────────── */}
      <section className="shopping-trips-links">
        <h2>Plan and inventory</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <Link to="/app/shopping" className="btn-app-ghost">Open Shopping List</Link>
          <Link to="/app/inventory" className="btn-app-ghost">View Inventory</Link>
          <Link to="/app/plan" className="btn-app-secondary">Weekly Plan</Link>
        </div>
      </section>

      <style>{`
        @media (max-width: 640px) {
          .page-header-bar { flex-direction: column; align-items: flex-start; }
        }
        @media (max-width: 480px) {
          .trips-summary { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
