import { useEffect, useRef, useState } from "react";
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
  const formRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const productRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  useEffect(() => {
    if (!isEditing) return;
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isEditing, selected?.id]);

  const scrollToProduct = (id?: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (id && productRefs.current[id]) {
          productRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
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
      productUrl: product.productUrl ?? "",
      imageUrl: product.imageUrl ?? "",
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert("Please enter a product name");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        brand: formData.brand?.trim() || undefined,
        sizeLabel: formData.sizeLabel?.trim() || undefined,
        store: formData.store,
        productUrl: formData.productUrl?.trim() || null,
        imageUrl: formData.imageUrl?.trim() || undefined,
      };

      const savedProduct = selected
        ? await updateStoreProduct({ ...payload, id: selected.id, createdAt: selected.createdAt })
        : await createStoreProduct(payload);

      const list = await getStoreProducts();
      setProducts(list);
      setSelected(savedProduct);
      setIsEditing(false);
      scrollToProduct(savedProduct.id);
    } catch (err) {
      console.error(err);
      alert("Failed to save product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    const selectedId = selected?.id;
    setIsEditing(false);
    scrollToProduct(selectedId);
  };

  const handleDelete = async () => {
    if (!selected || !confirm("Are you sure you want to delete this product?")) return;

    try {
      await deleteStoreProduct(selected.id);
      const list = await getStoreProducts();
      setProducts(list);
      setSelected(null);
      setIsEditing(false);
      scrollToProduct();
    } catch (err) {
      console.error(err);
      alert("Failed to delete product. Please try again.");
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredProducts = query
    ? products.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query) ||
          p.store.toLowerCase().includes(query)
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

      <div ref={listRef}>
        <div style={{ position: "relative", marginBottom: "0.875rem" }}>
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
            fontSize: "0.7rem",
            color: "var(--text-subtle)",
            fontFamily: "DM Sans, sans-serif",
            marginBottom: "0.625rem",
            letterSpacing: "0.05em",
          }}>
            {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "items"}
            {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
          </div>
        )}

        {loading ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontFamily: "DM Sans, sans-serif" }}>
            Loading products…
          </p>
        ) : filteredProducts.length === 0 ? (
          <div className="app-card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", fontFamily: "DM Sans, sans-serif", margin: 0 }}>
              {searchQuery ? "No products match your search." : "No products yet. Add your first one!"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {filteredProducts.map(product => {
              const isSelected = selected?.id === product.id;
              return (
                <button
                  key={product.id}
                  ref={element => { productRefs.current[product.id] = element; }}
                  onClick={() => handleEdit(product)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <div className="app-card" style={{
                    padding: "0.875rem 1rem",
                    borderLeft: isSelected ? "3px solid var(--gold)" : "3px solid transparent",
                    background: isSelected ? "rgba(185,90,16,0.04)" : "var(--app-surface)",
                    transition: "all 0.15s",
                  }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "1.4rem", lineHeight: 1, flexShrink: 0 }}>🏷️</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "DM Sans, sans-serif",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          color: "var(--parchment)",
                          marginBottom: "0.2rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {product.name}
                        </div>
                        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
                          {product.brand && (
                            <span style={{
                              fontSize: "0.7rem",
                              fontFamily: "DM Sans, monospace",
                              fontWeight: 600,
                              background: "var(--app-bg)",
                              color: "var(--text-muted)",
                              padding: "0.15rem 0.4rem",
                              borderRadius: 4,
                            }}>
                              {product.brand}
                            </span>
                          )}
                          {product.sizeLabel && (
                            <span style={{
                              fontSize: "0.7rem",
                              fontFamily: "DM Sans, monospace",
                              fontWeight: 600,
                              background: "var(--app-bg)",
                              color: "var(--text-muted)",
                              padding: "0.15rem 0.4rem",
                              borderRadius: 4,
                            }}>
                              {product.sizeLabel}
                            </span>
                          )}
                          <span style={{
                            fontSize: "0.7rem",
                            fontFamily: "DM Sans, monospace",
                            fontWeight: 700,
                            background: "var(--app-border)",
                            color: "var(--text-subtle)",
                            padding: "0.15rem 0.5rem",
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

      {isEditing && (
        <div ref={formRef} style={{ marginTop: "1.25rem", scrollMarginTop: "1rem" }}>
          <ProductForm
            formData={formData}
            onChange={setFormData}
            onSave={handleSave}
            onBack={handleBack}
            onDelete={selected ? handleDelete : undefined}
            saving={saving}
            isNew={!selected}
            selectedName={selected?.name}
          />
        </div>
      )}
    </div>
  );
}

interface ProductFormProps {
  formData: Omit<StoreProduct, "id" | "createdAt">;
  onChange: (data: Omit<StoreProduct, "id" | "createdAt">) => void;
  onSave: () => void;
  onBack: () => void;
  onDelete?: () => void;
  saving?: boolean;
  isNew: boolean;
  selectedName?: string;
}

function ProductForm({
  formData,
  onChange,
  onSave,
  onBack,
  onDelete,
  saving,
  isNew,
  selectedName,
}: ProductFormProps) {
  const parsedSize = (() => {
    const raw = formData.sizeLabel?.trim();
    if (!raw) return { value: "", unit: "units" as "g" | "ml" | "kg" | "units" };
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
    if (!match) return { value: "", unit: "units" as "g" | "ml" | "kg" | "units" };
    const value = match[1];
    const unit = (match[2] || "units").toLowerCase();
    const allowed: ("g" | "ml" | "kg" | "units")[] = ["g", "ml", "kg", "units"];
    return { value, unit: allowed.includes(unit as any) ? (unit as any) : "units" };
  })();

  const handleSizeChange = (value: string, unit: string) => {
    const trimmed = value.trim();
    const label = trimmed ? `${trimmed}${unit === "units" ? "" : unit}` : "";
    onChange({ ...formData, sizeLabel: label });
  };

  return (
    <div className="app-card" style={{ padding: "1.25rem 1.5rem 1.5rem" }}>
      <button
        type="button"
        className="btn-app-ghost"
        onClick={onBack}
        style={{ marginBottom: "1rem", paddingLeft: 0 }}
      >
        ← {isNew ? "Back to product list" : `Back to ${selectedName ?? "selected product"}`}
      </button>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        marginBottom: "1rem",
      }}>
        <h2 style={{
          margin: 0,
          fontFamily: "'Cinzel', serif",
          fontSize: "1.25rem",
          color: "var(--parchment)",
        }}>
          {isNew ? "New Product" : "Edit Product"}
        </h2>
        {onDelete && (
          <button className="btn-app-secondary btn-danger" onClick={onDelete} disabled={saving}>
            Delete
          </button>
        )}
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
            {STORES.map(store => (
              <option key={store} value={store}>{store}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="app-label">Product URL</label>
        <input
          className="app-input"
          type="url"
          value={formData.productUrl ?? ""}
          onChange={e => onChange({ ...formData, productUrl: e.target.value })}
          placeholder="https://www.coles.com.au/product/…"
        />
        <p className="form-hint">Optional: use the full URL when the store has an online product page.</p>
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
        <button className="btn-app-ghost" onClick={onBack} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}
