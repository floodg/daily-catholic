import { useEffect, useState } from 'react';
import type { MealIngredientProduct, StoreProduct } from '../../domain/types';
import { getStoreProducts } from '../store-products/api';
import type { StarterMealWithIngredients, StarterIngredient } from './api';
import {
  getStarterMealsWithIngredients,
  setIngredientPrimaryProduct,
  addIngredientProductOption,
  removeIngredientProductOption,
} from './api';
import Combobox from '../../components/ui/Combobox';
import ListPage, { type PanelMode } from '../../components/ui/ListPage';
// ─── Product Combobox (exported for use on Ingredients page) ───────────────────

export interface ProductComboboxProps {
  placeholder: string;
  storeProducts: StoreProduct[];
  excludeIds?: string[];
  onSelect: (product: StoreProduct) => void;
}

export function ProductCombobox({ placeholder, storeProducts, excludeIds = [], onSelect }: ProductComboboxProps) {
  const [selectedKey, setSelectedKey] = useState<string>('');

  return (
    <Combobox<StoreProduct>
      items={storeProducts.filter(p => !excludeIds.includes(p.id))}
      selectedKey={selectedKey}
      getKey={(p) => p.id}
      getLabel={(p) => [p.brand, p.name].filter(Boolean).join(' ')}
      onSelectKey={(key) => {
        setSelectedKey(key);
        const picked = storeProducts.find(p => p.id === key);
        if (picked) onSelect(picked);
        // Reset so the box behaves like a picker (not a persistent selected value).
        setSelectedKey('');
      }}
      placeholder={placeholder}
      wrapperClassName="ip-combobox"
      listClassName="ip-combobox-list"
      optionClassName="ip-combobox-item"
      filter={(p, q) => {
        const qLower = q.toLowerCase();
        return (
          p.name.toLowerCase().includes(qLower) ||
          (p.brand?.toLowerCase().includes(qLower) ?? false)
        );
      }}
      renderOption={(p) => (
        <>
          <span className="ip-combo-name">{[p.brand, p.name].filter(Boolean).join(' ')}</span>
          {p.sizeLabel && <span className="ip-combo-meta">{p.sizeLabel}</span>}
          <span className="ip-combo-store">{p.store}</span>
        </>
      )}
    />
  );
}

// ─── Ingredient Row ───────────────────────────────────────────────────────────

interface IngredientRowProps {
  ingredient: StarterIngredient;
  storeProducts: StoreProduct[];
  onIngredientUpdated: (updated: StarterIngredient) => void;
}

function IngredientRow({ ingredient, storeProducts, onIngredientUpdated }: IngredientRowProps) {
  const [saving, setSaving] = useState<string | null>(null); // tracks which action is in progress

  // IDs to exclude from add-alternatives combobox: primary + existing options
  const usedProductIds = [
    ...(ingredient.primaryProductId ? [ingredient.primaryProductId] : []),
    ...ingredient.productOptions.map(o => o.storeProductId),
  ];

  /** Convert a StoreProduct to a MealIngredientProduct (strips createdAt etc.) */
  const toMealProduct = (p: StoreProduct): MealIngredientProduct => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    sizeLabel: p.sizeLabel,
    store: p.store,
    productUrl: p.productUrl,
    imageUrl: p.imageUrl,
  });

  const handleSetPrimary = async (productId: string | null) => {
    setSaving('primary');
    try {
      await setIngredientPrimaryProduct(ingredient.id, productId);
      const newPrimaryProduct = productId
        ? storeProducts.find(p => p.id === productId)
        : undefined;
      onIngredientUpdated({
        ...ingredient,
        primaryProductId: productId ?? undefined,
        primaryProduct: newPrimaryProduct ? toMealProduct(newPrimaryProduct) : undefined,
      });
    } catch (err) {
      console.error('Failed to set primary product', err);
      alert('Failed to update default product. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const handleAddOption = async (product: StoreProduct) => {
    setSaving(`add-${product.id}`);
    try {
      const nextSort = ingredient.productOptions.length;
      await addIngredientProductOption(ingredient.id, product.id, nextSort);
      // Use storeProductId as key; optionRowId is a temporary display key only –
      // remove operations use storeProductId, not optionRowId, so this is safe.
      onIngredientUpdated({
        ...ingredient,
        productOptions: [
          ...ingredient.productOptions,
          {
            optionRowId: `temp-${product.id}`,
            storeProductId: product.id,
            product: toMealProduct(product),
            sortOrder: nextSort,
          },
        ],
      });
    } catch (err) {
      console.error('Failed to add product option', err);
      alert('Failed to add alternative. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const handleRemoveOption = async (productId: string) => {
    setSaving(`remove-${productId}`);
    try {
      await removeIngredientProductOption(ingredient.id, productId);
      onIngredientUpdated({
        ...ingredient,
        productOptions: ingredient.productOptions.filter(o => o.storeProductId !== productId),
      });
    } catch (err) {
      console.error('Failed to remove product option', err);
      alert('Failed to remove alternative. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const primaryProduct = ingredient.primaryProduct;

  return (
    <div className="app-card" style={{ padding: '1rem 1rem', overflow: 'visible' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{
          fontFamily: 'DM Sans, sans-serif',
          fontWeight: 700,
          fontSize: '0.95rem',
          color: 'var(--parchment)',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {ingredient.name}
        </div>
        {ingredient.quantity && (
          <div style={{
            fontFamily: 'DM Sans, monospace',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}>
            {ingredient.quantity}
          </div>
        )}
      </div>

      <div style={{ height: 10 }} />

      {/* Default product */}
      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
        <label className="app-label">Default product</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {primaryProduct ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              border: '1px solid var(--app-border)',
              borderRadius: 14,
              padding: '0.75rem 0.875rem',
              background: 'rgba(253, 248, 242, 0.6)',
              flex: 1,
              minWidth: 220,
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
                  {[primaryProduct.brand, primaryProduct.name].filter(Boolean).join(' ')}
                </div>
                {primaryProduct.sizeLabel && (
                  <div style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {primaryProduct.sizeLabel}
                  </div>
                )}
              </div>
              <button
                className="btn-app-ghost"
                onClick={() => handleSetPrimary(null)}
                disabled={saving === 'primary'}
                title="Clear default"
                style={{ padding: '0.25rem 0.5rem', flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ) : (
            <ProductCombobox
              placeholder="Search for a default product…"
              storeProducts={storeProducts}
              excludeIds={usedProductIds}
              onSelect={p => handleSetPrimary(p.id)}
            />
          )}

          {saving === 'primary' && (
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Saving…
            </span>
          )}
        </div>
      </div>

      {/* Alternative products */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="app-label">Alternative products</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ingredient.productOptions.map(opt => (
            <div
              key={opt.storeProductId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                border: '1px solid var(--app-border)',
                borderRadius: 14,
                padding: '0.65rem 0.75rem',
                background: 'rgba(253, 248, 242, 0.35)',
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
                  {[opt.product.brand, opt.product.name].filter(Boolean).join(' ')}
                </div>
                {opt.product.sizeLabel && (
                  <div style={{ fontFamily: 'DM Sans, monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    {opt.product.sizeLabel}
                  </div>
                )}
              </div>
              <button
                className="btn-app-ghost"
                onClick={() => handleRemoveOption(opt.storeProductId)}
                disabled={saving === `remove-${opt.storeProductId}`}
                title="Remove alternative"
                style={{ padding: '0.25rem 0.5rem', flexShrink: 0 }}
              >
                {saving === `remove-${opt.storeProductId}` ? '…' : '✕'}
              </button>
            </div>
          ))}

          <ProductCombobox
            placeholder="Add alternative product…"
            storeProducts={storeProducts}
            excludeIds={usedProductIds}
            onSelect={handleAddOption}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Meal Detail Panel ────────────────────────────────────────────────────────

interface MealDetailProps {
  meal: StarterMealWithIngredients;
  storeProducts: StoreProduct[];
  onMealUpdated: (updated: StarterMealWithIngredients) => void;
}

function MealDetail({ meal, storeProducts, onMealUpdated }: MealDetailProps) {
  const handleIngredientUpdated = (updated: StarterIngredient) => {
    onMealUpdated({
      ...meal,
      ingredients: meal.ingredients.map(i => i.id === updated.id ? updated : i),
    });
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🥘</div>
        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '1.25rem',
          color: 'var(--parchment)',
          margin: '0 0 0.5rem',
        }}>
          {meal.name}
        </h2>
        {meal.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {meal.tags.map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: '0.65rem',
                  background: 'var(--app-bg)',
                  color: 'var(--text-muted)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                  fontFamily: 'DM Sans, monospace',
                  fontWeight: 600,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p style={{
          margin: '0.75rem 0 0',
          fontFamily: 'DM Sans, sans-serif',
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
          lineHeight: 1.4,
        }}>
          {meal.ingredients.length} ingredient{meal.ingredients.length !== 1 ? 's' : ''} — assign a default store product and any alternatives.
        </p>
      </div>

      {meal.ingredients.length === 0 ? (
        <div className="app-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)' }}>
            This meal has no ingredients.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {meal.ingredients.map(ing => (
            <IngredientRow
              key={ing.id}
              ingredient={ing}
              storeProducts={storeProducts}
              onIngredientUpdated={handleIngredientUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IngredientProductsPage() {
  const [meals, setMeals] = useState<StarterMealWithIngredients[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<StarterMealWithIngredients | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);

  useEffect(() => {
    Promise.all([getStarterMealsWithIngredients(), getStoreProducts()])
      .then(([fetchedMeals, fetchedProducts]) => {
        const sorted = [...fetchedMeals].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        setMeals(sorted);
        setStoreProducts(fetchedProducts);
      })
      .catch(err => {
        setError('Failed to load data. Please refresh the page.');
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleMealUpdated = (updated: StarterMealWithIngredients) => {
    setMeals(prev => prev.map(m => m.id === updated.id ? updated : m));
    if (selected?.id === updated.id) setSelected(updated);
  };

  if (loading) {
    return (
      <div>
        <p style={{ color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif', padding: '2rem 0' }}>
          Loading ingredient products…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card" style={{ padding: '1.25rem', borderColor: '#fecaca', background: '#fff7f7' }}>
        <p style={{ margin: 0, color: '#b91c1c', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div>
      <ListPage<StarterMealWithIngredients>
        eyebrow="Admin"
        title="Ingredient <em>Products</em>"
        items={meals}
        showAddButton={false}
        alwaysTwoColumn
        emptyDetail={
          <p style={{
            margin: 0,
            fontFamily: 'DM Sans, sans-serif',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
          }}>
            Select a starter meal to manage its ingredient products.
          </p>
        }
        renderListItem={(meal, isSelected, onSelect) => (
          <MealLinkCard key={meal.id} meal={meal} isSelected={isSelected} onSelect={onSelect} />
        )}
        renderDetail={(sel, _onClose, mode) => {
          if (mode !== 'view' || !sel) return null;
          const live = meals.find(m => m.id === sel.id) ?? sel;
          return (
            <div>
              <p style={{
                margin: '0 0 1rem',
                fontFamily: 'DM Sans, sans-serif',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                lineHeight: 1.4,
              }}>
                Manage which store products are linked to each starter meal ingredient.
              </p>
              <MealDetail
                meal={live}
                storeProducts={storeProducts}
                onMealUpdated={handleMealUpdated}
              />
            </div>
          );
        }}
        searchPlaceholder="Search meals…"
        searchFilter={(meal, q) => {
          const qq = q.toLowerCase();
          return (
            meal.name.toLowerCase().includes(qq) ||
            (meal.tags ?? []).some(t => t.toLowerCase().includes(qq))
          );
        }}
        emptyIcon="🥘"
        emptyText="No starter meals found."
        defaultSelected={selected}
        defaultMode={panelMode}
        onStateChange={(sel, mode) => {
          setSelected(sel);
          setPanelMode(mode);
        }}
      />
    </div>
  );
}

function MealLinkCard({ meal, isSelected, onSelect }: {
  meal: StarterMealWithIngredients;
  isSelected: boolean;
  onSelect: (m: StarterMealWithIngredients) => void;
}) {
  const totalCount = meal.ingredients.length;
  const linkedCount = meal.ingredients.filter(i => i.primaryProductId).length;
  const complete = totalCount > 0 && linkedCount === totalCount;

  return (
    <button
      onClick={() => onSelect(meal)}
      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div className="app-card" style={{
        padding: '0.875rem 1rem',
        borderLeft: isSelected ? '3px solid var(--gold)' : '3px solid transparent',
        background: isSelected ? 'rgba(185,90,16,0.04)' : 'var(--app-surface)',
        transition: 'all 0.15s',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>🥘</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'DM Sans, sans-serif',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: 'var(--parchment)',
              marginBottom: '0.35rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {meal.name}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {totalCount > 0 && (
                <span style={{
                  fontFamily: 'DM Sans, monospace',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: complete ? 'var(--protein-color)' : 'var(--text-subtle)',
                  background: complete ? '#e8f5ee' : 'var(--app-border)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 999,
                }}>
                  {linkedCount}/{totalCount} linked
                </span>
              )}
              {meal.tags?.slice(0, 2).map(tag => (
                <span key={tag} style={{
                  fontSize: '0.6rem',
                  fontFamily: 'DM Sans, monospace',
                  fontWeight: 600,
                  background: 'var(--app-bg)',
                  color: 'var(--text-muted)',
                  padding: '0.15rem 0.4rem',
                  borderRadius: 4,
                }}>
                  {tag}
                </span>
              ))}
              {(meal.tags?.length ?? 0) > 2 && (
                <span style={{
                  fontSize: '0.6rem',
                  fontFamily: 'DM Sans, monospace',
                  fontWeight: 600,
                  background: 'var(--app-bg)',
                  color: 'var(--text-muted)',
                  padding: '0.15rem 0.4rem',
                  borderRadius: 4,
                }}>
                  +{(meal.tags?.length ?? 0) - 2}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
