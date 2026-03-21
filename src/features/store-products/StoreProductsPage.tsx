import { useEffect, useState } from "react";
import type { StoreProduct } from "../../domain/types";
import {
  getStoreProducts,
  createStoreProduct,
  updateStoreProduct,
  deleteStoreProduct,
} from "./api";
const STORES = ["Coles", "Woolworths", "Aldi", "IGA", "Other"];

const EMPTY_FORM: Omit<StoreProduct, "id" | "createdAt"> = {
  name: "",
  brand: "",
  sizeLabel: "",
  store: "Coles",
  productUrl: "",
  imageUrl: "",
};

export default function StoreProductsPage() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Omit<StoreProduct, "id" | "createdAt">>(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getStoreProducts();
        if (cancelled) return;
        setProducts(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadProducts = async () => {
    const list = await getStoreProducts();
    setProducts(list);
    const currentId = selected?.id;
    if (currentId) {
      const next = list.find((p) => p.id === currentId);
      setSelected(next ?? null);
    }
  };

  const handleAddNew = () => {
    setSelected(null);
    setFormData({ ...EMPTY_FORM });
    setIsEditing(true);
  };

  const handleEdit = (product: StoreProduct) => {
    setSelected(product);
    setFormData({
      name: product.name,
      brand: product.brand ?? "",
      sizeLabel: product.sizeLabel ?? "",
      store: product.store,
      productUrl: product.productUrl,
      imageUrl: product.imageUrl ?? "",
    });
    setIsEditing(true);
  };

  const handleViewDetails = (product: StoreProduct) => {
    setSelected(product);
    setFormData({
      name: product.name,
      brand: product.brand ?? "",
      sizeLabel: product.sizeLabel ?? "",
      store: product.store,
      productUrl: product.productUrl,
      imageUrl: product.imageUrl ?? "",
    });
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert("Please enter a product name");
      return;
    }
    if (!formData.productUrl.trim()) {
      alert("Please enter a product URL");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        brand: formData.brand?.trim() || undefined,
        sizeLabel: formData.sizeLabel?.trim() || undefined,
        store: formData.store,
        productUrl: formData.productUrl.trim(),
        imageUrl: formData.imageUrl?.trim() || undefined,
      };

      if (selected) {
        await updateStoreProduct({ ...payload, id: selected.id, createdAt: selected.createdAt });
      } else {
        await createStoreProduct(payload);
      }
      await loadProducts();
      setIsEditing(false);
      setSelected(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelected(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteStoreProduct(id);
      await loadProducts();
      if (selected?.id === id) {
        setSelected(null);
        setIsEditing(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete product. Please try again.");
    }
  };

  const filteredProducts = searchQuery.trim()
    ? products.filter(
        p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.store.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : products;

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Admin</div>
          <h1 className="page-title">🛒 Store <em>Products</em></h1>
        </div>
        <button className="btn-app-primary" onClick={handleAddNew}>
          + Add Product
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: '1.25rem',
        alignItems: 'start',
      }}>
        {/* List column */}
        <div>
          <div style={{ position: 'relative', marginBottom: '0.875rem' }}>
            <input
              className="app-input"
              type="search"
              placeholder="Search by name, brand or store…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {!loading && (
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--text-subtle)',
              fontFamily: 'DM Sans, sans-serif',
              marginBottom: '0.625rem',
              letterSpacing: '0.05em',
            }}>
              {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'}
              {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
            </div>
          )}

          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: 'DM Sans, sans-serif' }}>
              Loading products…
            </p>
          ) : filteredProducts.length === 0 ? (
            <div className="app-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: 'DM Sans, sans-serif', margin: 0 }}>
                {searchQuery ? "No products match your search." : "No products yet. Add your first one!"}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredProducts.map(product => {
                const isSelected = selected?.id === product.id;
                return (
                  <button
                    key={product.id}
                    onClick={() => handleViewDetails(product)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <div className="app-card" style={{
                      padding: '0.875rem 1rem',
                      borderLeft: isSelected ? '3px solid var(--gold)' : '3px solid transparent',
                      background: isSelected ? 'rgba(185,90,16,0.04)' : 'var(--app-surface)',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>🏷️</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: 'var(--parchment)',
                            marginBottom: '0.2rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {product.name}
                          </div>
                          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {product.brand && (
                              <span style={{
                                fontSize: '0.7rem',
                                fontFamily: 'DM Sans, monospace',
                                fontWeight: 600,
                                background: 'var(--app-bg)',
                                color: 'var(--text-muted)',
                                padding: '0.15rem 0.4rem',
                                borderRadius: 4,
                              }}>
                                {product.brand}
                              </span>
                            )}
                            <span style={{
                              fontSize: '0.7rem',
                              fontFamily: 'DM Sans, monospace',
                              fontWeight: 700,
                              background: 'var(--app-border)',
                              color: 'var(--text-subtle)',
                              padding: '0.15rem 0.5rem',
                              borderRadius: 999,
                            }}>
                              {product.store}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {isEditing ? (
            <ProductForm
              formData={formData}
              onChange={setFormData}
              onSave={handleSave}
              onCancel={handleCancel}
              saving={saving}
              isNew={!selected}
            />
          ) : selected ? (
            <ProductView
              product={selected}
              onEdit={() => handleEdit(selected)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : (
            <div className="app-card" style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                Select a product to view details, or tap “Add Product” to create a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Product Form ─────────────────────────────────────────────────────────────

interface ProductFormProps {
  formData: Omit<StoreProduct, "id" | "createdAt">;
  onChange: (data: Omit<StoreProduct, "id" | "createdAt">) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  isNew: boolean;
}

function ProductForm({ formData, onChange, onSave, onCancel, saving, isNew }: ProductFormProps) {
  const parsedSize = (() => {
    const raw = formData.sizeLabel?.trim();
    if (!raw) return { value: '', unit: 'units' as 'g' | 'ml' | 'kg' | 'units' };
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
    if (!match) return { value: '', unit: 'units' as 'g' | 'ml' | 'kg' | 'units' };
    const value = match[1];
    const u = (match[2] || 'units').toLowerCase();
    const allowed: ('g' | 'ml' | 'kg' | 'units')[] = ['g', 'ml', 'kg', 'units'];
    return { value, unit: (allowed.includes(u as any) ? (u as any) : 'units') };
  })();

  const handleSizeChange = (value: string, unit: string) => {
    const trimmed = value.trim();
    const label = trimmed ? `${trimmed}${unit === 'units' ? '' : unit}` : '';
    onChange({ ...formData, sizeLabel: label });
  };

  return (
    <div className="app-card" style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        <h2 style={{
          margin: 0,
          fontFamily: "'Cinzel', serif",
          fontSize: '1.25rem',
          color: 'var(--parchment)',
        }}>
          {isNew ? "New Product" : "Edit Product"}
        </h2>
        <button className="btn-app-ghost" onClick={onCancel}>
          Close
        </button>
      </div>

      <div className="form-group">
        <label className="app-label">Name *</label>
        <input
          className="app-input"
          type="text"
          value={formData.name}
          onChange={e => onChange({ ...formData, name: e.target.value })}
          placeholder="e.g. Chicken Breast"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="app-label">Brand</label>
        <input
          className="app-input"
          type="text"
          value={formData.brand ?? ""}
          onChange={e => onChange({ ...formData, brand: e.target.value })}
          placeholder="e.g. Lilydale"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="app-label">Size</label>
          <input
            className="app-input"
            type="number"
            min={0.01}
            step={0.01}
            value={parsedSize.value}
            onChange={e => handleSizeChange(e.target.value, parsedSize.unit)}
            placeholder="e.g. 500"
          />
        </div>
        <div className="form-group">
          <label className="app-label">Unit</label>
          <select
            className="app-input"
            value={parsedSize.unit}
            onChange={e => handleSizeChange(parsedSize.value, e.target.value)}
          >
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">ml</option>
            <option value="units">units</option>
          </select>
        </div>
        <div className="form-group">
          <label className="app-label">Store *</label>
          <select
            className="app-input"
            value={formData.store}
            onChange={e => onChange({ ...formData, store: e.target.value })}
          >
            {STORES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="app-label">Product URL *</label>
        <input
          className="app-input"
          type="url"
          value={formData.productUrl}
          onChange={e => onChange({ ...formData, productUrl: e.target.value })}
          placeholder="https://www.coles.com.au/product/…"
        />
        <p className="form-hint">Use the full URL to the product on the store website.</p>
      </div>

      <div className="form-group">
        <label className="app-label">Image URL</label>
        <input
          className="app-input"
          type="url"
          value={formData.imageUrl ?? ""}
          onChange={e => onChange({ ...formData, imageUrl: e.target.value })}
          placeholder="https://…"
        />
      </div>

      <div className="form-actions">
        <button className="btn-app-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save Product"}
        </button>
        <button className="btn-app-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Product View ─────────────────────────────────────────────────────────────

interface ProductViewProps {
  product: StoreProduct;
  onEdit: () => void;
  onDelete: () => void;
}

function ProductView({ product, onEdit, onDelete }: ProductViewProps) {
  return (
    <div className="app-card" style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', justifyContent: 'space-between' }}>
        <button className="btn-app-primary" style={{ flex: 1 }} onClick={onEdit}>
          Edit
        </button>
        <button className="btn-app-secondary btn-danger" onClick={onDelete}>
          Delete
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏷️</div>
        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '1.25rem',
          color: 'var(--parchment)',
          margin: 0,
        }}>
          {product.name}
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {product.brand && (
            <span style={{
              fontSize: '0.65rem',
              background: 'var(--app-bg)',
              color: 'var(--text-muted)',
              padding: '0.2rem 0.5rem',
              borderRadius: 4,
              fontFamily: 'DM Sans, monospace',
              fontWeight: 600,
            }}>
              {product.brand}
            </span>
          )}
          {product.sizeLabel && (
            <span style={{
              fontSize: '0.65rem',
              background: '#fef3e8',
              color: 'var(--fat-color)',
              padding: '0.2rem 0.5rem',
              borderRadius: 4,
              fontFamily: 'DM Sans, monospace',
              fontWeight: 600,
            }}>
              {product.sizeLabel}
            </span>
          )}
          <span style={{
            fontSize: '0.65rem',
            background: 'var(--app-border)',
            color: 'var(--text-subtle)',
            padding: '0.2rem 0.5rem',
            borderRadius: 999,
            fontFamily: 'DM Sans, monospace',
            fontWeight: 700,
          }}>
            {product.store}
          </span>
        </div>
      </div>

      {product.imageUrl && (
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{
              maxWidth: '100%',
              maxHeight: 180,
              borderRadius: 12,
              objectFit: 'contain',
              border: '1px solid var(--app-border)',
              background: 'white',
            }}
          />
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--text-subtle)' }}>Store</span>
          <span style={{ color: 'var(--parchment)', fontWeight: 500 }}>{product.store}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Sans, sans-serif', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--text-subtle)' }}>Product URL</span>
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}
          >
            Open product ↗
          </a>
        </div>
      </div>
    </div>
  );
}
