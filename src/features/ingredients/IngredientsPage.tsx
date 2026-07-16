import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { IngredientCatalog } from "./api";
import {
  getIngredientsCatalog,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  saveIngredientProductPreferences,
} from "./api";
import { findStoreProducts } from "./findStoreProductsApi";
import { getStoreProducts } from "../store-products/api";
import { ProductCombobox } from "../ingredient-products/IngredientProductsPage";
import type { StoreProduct } from "../../domain/types";
import ListPage, { type PanelMode } from "../../components/ui/ListPage";

const STORES = ["Coles", "Woolworths", "Aldi", "IGA", "Other"] as const;

const EMPTY_FORM = {
  name: "",
  optional: false,
  pantryStaple: false,
  kind: "food" as "food" | "household",
  defaultStoreProductId: null as string | null,
  alternativeStoreProductIds: [] as string[],
};

export default function IngredientsPage() {
  const [items, setItems] = useState<IngredientCatalog[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<IngredientCatalog | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ingredients, storeProducts] = await Promise.all([
          getIngredientsCatalog(),
          getStoreProducts(),
        ]);
        if (cancelled) return;
        const sorted = [...ingredients].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        setItems(sorted);
        setProducts(storeProducts);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = async () => {
    const [ingredients, storeProducts] = await Promise.all([
      getIngredientsCatalog(),
      getStoreProducts(),
    ]);
    const sorted = [...ingredients].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    setItems(sorted);
    setProducts(storeProducts);
    const currentId = selected?.id;
    if (currentId) {
      const next = sorted.find((i) => i.id === currentId);
      setSelected(next ?? null);
    }
  };

  const saveIngredient = async (data: typeof EMPTY_FORM, existing: IngredientCatalog | null) => {
    if (!data.name.trim()) {
      alert("Please enter an ingredient name");
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateIngredient({
          id: existing.id,
          name: data.name.trim(),
          optional: data.optional,
          pantryStaple: data.pantryStaple,
          kind: data.kind,
          defaultStoreProductId: data.defaultStoreProductId,
        });
        await saveIngredientProductPreferences({
          ingredientId: existing.id,
          defaultStoreProductId: data.defaultStoreProductId,
          alternativeStoreProductIds: data.alternativeStoreProductIds,
        });
      } else {
        const created = await createIngredient({
          name: data.name.trim(),
          optional: data.optional,
          pantryStaple: data.pantryStaple,
          kind: data.kind,
          defaultStoreProductId: data.defaultStoreProductId,
        });
        await saveIngredientProductPreferences({
          ingredientId: created.id,
          defaultStoreProductId: data.defaultStoreProductId,
          alternativeStoreProductIds: data.alternativeStoreProductIds,
        });
      }
      await load();
    } catch (err) {
      console.error(err);
      alert("Failed to save ingredient. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this ingredient? It may be used in starter meals.")) return;
    try {
      await deleteIngredient(id);
      await load();
      if (selected?.id === id) {
        setSelected(null);
        setPanelMode(null);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete ingredient. It may be in use.");
    }
  };

  if (loading) {
    return (
      <div>
        <p style={{ color: "var(--text-subtle)", fontFamily: "DM Sans, sans-serif", padding: "2rem 0" }}>
          Loading ingredients…
        </p>
      </div>
    );
  }

  return (
    <div>
      <ListPage<IngredientCatalog>
        eyebrow="Food Library"
        title="Pantry <em>Ingredients</em>"
        items={items}
        alwaysTwoColumn
        emptyDetail={
          <p style={{
            margin: 0,
            fontFamily: 'DM Sans, sans-serif',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
          }}>
            Select an ingredient to view or edit.
          </p>
        }
        renderListItem={(ing, isSelected, onSelect) => (
          <IngredientCard key={ing.id} item={ing} isSelected={isSelected} onSelect={onSelect} />
        )}
        renderDetail={(selectedItem, onClose, mode, setMode) => {
          const isNew = mode === "new" || (selectedItem == null && mode !== "view");
          const live = selectedItem
            ? (items.find(i => i.id === selectedItem.id) ?? selectedItem)
            : null;

          if (mode === "view" && live) {
            return (
              <IngredientView
                item={live}
                onEdit={() => setMode("edit")}
                onDelete={() => handleDelete(live.id)}
              />
            );
          }

          return (
            <IngredientForm
              key={`${live?.id ?? "new"}:${mode ?? "none"}`}
              initialItem={live}
              products={products}
              onProductsFound={(found) => {
                setProducts((prev) => {
                  const byId = new Map(prev.map((p) => [p.id, p]));
                  for (const p of found) byId.set(p.id, p);
                  return [...byId.values()].sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
                  );
                });
              }}
              onSave={async (data) => {
                await saveIngredient(data, live);
                onClose();
              }}
              onCancel={onClose}
              saving={saving}
              isNew={isNew}
            />
          );
        }}
        searchPlaceholder="Search ingredients…"
        searchFilter={(ing, q) =>
          ing.name.toLowerCase().includes(q.toLowerCase()) ||
          (ing.defaultStoreProductName ?? "").toLowerCase().includes(q.toLowerCase())
        }
        addLabel="Add Ingredient"
        emptyIcon="🥗"
        emptyText="No ingredients yet — add your first pantry item!"
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

interface IngredientFormProps {
  initialItem: IngredientCatalog | null;
  products: StoreProduct[];
  onProductsFound: (products: StoreProduct[]) => void;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving?: boolean;
  isNew: boolean;
}

function IngredientForm({
  initialItem,
  products,
  onProductsFound,
  onSave,
  onCancel,
  saving,
  isNew,
}: IngredientFormProps) {
  const [localData, setLocalData] = useState<typeof EMPTY_FORM>(() => ({
    name: initialItem?.name ?? "",
    optional: initialItem?.optional ?? false,
    pantryStaple: initialItem?.pantryStaple ?? false,
    kind: initialItem?.kind ?? "food",
    defaultStoreProductId: initialItem?.defaultStoreProductId ?? null,
    alternativeStoreProductIds: initialItem?.alternativeStoreProducts.map((p) => p.storeProductId) ?? [],
  }));
  const [showFindProduct, setShowFindProduct] = useState(false);

  const selectedProduct = localData.defaultStoreProductId
    ? products.find((p) => p.id === localData.defaultStoreProductId)
    : null;
  const alternatives = localData.alternativeStoreProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is StoreProduct => Boolean(p));
  const usedProductIds = [
    ...(localData.defaultStoreProductId ? [localData.defaultStoreProductId] : []),
    ...localData.alternativeStoreProductIds,
  ];

  return (
    <div>
      <h2 style={{ margin: 0, fontFamily: "'Cinzel', serif", fontSize: "0.9rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--parchment)" }}>
        {isNew ? "New Ingredient" : "Edit Ingredient"}
      </h2>

      <div className="form-group">
        <label className="app-label">Name *</label>
        <input
          className="app-input"
          type="text"
          value={localData.name}
          onChange={(e) => setLocalData({ ...localData, name: e.target.value })}
          placeholder="e.g. Mozzarella cheese"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="app-label">Kind</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          {([
            { value: "food" as const, label: "Food" },
            { value: "household" as const, label: "Household" },
          ]).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocalData({ ...localData, kind: value })}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                padding: "0.625rem 0.875rem", borderRadius: 12, cursor: "pointer",
                border: localData.kind === value ? "1.5px solid var(--gold)" : "1.5px solid var(--app-border)",
                background: localData.kind === value ? "rgba(201,168,76,0.08)" : "rgba(255,255,255,0.02)",
                fontFamily: "DM Sans, sans-serif", fontSize: "0.875rem",
                color: localData.kind === value ? "var(--parchment)" : "var(--text-muted)",
                fontWeight: localData.kind === value ? 650 : 500,
                transition: "border-color 0.15s, background 0.15s, color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="form-hint">
          Food items can appear on meals. Household items stay on pantry and shopping only.
        </p>
      </div>

      <div className="form-group">
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {([
            { key: "optional", label: "Optional (in recipes)", color: "var(--gold)" },
            { key: "pantryStaple", label: "Pantry staple (excluded from shopping list)", color: "var(--protein-color)" },
          ] as const).map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => setLocalData({ ...localData, [key]: !localData[key] })}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.625rem 0.875rem", borderRadius: 12, cursor: "pointer", textAlign: "left",
                border: localData[key] ? `1.5px solid ${color}` : "1.5px solid var(--app-border)",
                background: localData[key] ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.02)",
                transition: "border-color 0.15s, background 0.15s",
                opacity: localData.kind === "household" && key === "optional" ? 0.45 : 1,
              }}
              disabled={localData.kind === "household" && key === "optional"}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                border: localData[key] ? `2px solid ${color}` : "2px solid var(--app-border)",
                background: localData[key] ? color : "transparent",
                transition: "all 0.15s",
              }}>
                {localData[key] && <span style={{ color: "#111520", fontSize: "0.7rem", fontWeight: 900, lineHeight: 1 }}>✓</span>}
              </span>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "0.875rem", color: localData[key] ? "var(--parchment)" : "var(--text-muted)", transition: "color 0.15s" }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="app-label">Default store product</label>
        <div style={{ marginTop: "0.25rem" }}>
          {selectedProduct ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
              border: "1px solid var(--app-border-strong)", borderRadius: 14, padding: "0.75rem 0.875rem",
              background: "var(--app-surface)",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 650, color: "var(--parchment)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[selectedProduct.brand, selectedProduct.name].filter(Boolean).join(" ")}
                </div>
                {selectedProduct.sizeLabel && (
                  <div style={{ fontFamily: "DM Sans, monospace", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    {selectedProduct.sizeLabel}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  setLocalData({ ...localData, defaultStoreProductId: null })
                }
                title="Clear default"
                className="btn-app-ghost"
                style={{ padding: "0.25rem 0.5rem", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <ProductCombobox
                placeholder="Search for a default product…"
                storeProducts={products}
                excludeIds={localData.alternativeStoreProductIds}
                onSelect={(p) =>
                  setLocalData({ ...localData, defaultStoreProductId: p.id })
                }
              />
              <button
                type="button"
                className="btn-app-secondary"
                onClick={() => setShowFindProduct(true)}
                disabled={!localData.name.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  width: "100%",
                }}
              >
                <Sparkles size={14} />
                Find product
              </button>
            </div>
          )}
        </div>
        <p className="form-hint">Link this ingredient to a preferred product for shopping and meal planning.</p>
      </div>

      {showFindProduct && (
        <FindProductModal
          ingredientName={localData.name.trim()}
          onClose={() => setShowFindProduct(false)}
          onSelect={(product) => {
            onProductsFound([product]);
            setLocalData({ ...localData, defaultStoreProductId: product.id });
            setShowFindProduct(false);
          }}
        />
      )}

      <div className="form-group">
        <label className="app-label">Alternative products</label>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {alternatives.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                border: "1px solid var(--app-border)",
                borderRadius: 14,
                padding: "0.65rem 0.75rem",
                background: "var(--app-surface)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 600,
                  color: "var(--parchment)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {[p.brand, p.name].filter(Boolean).join(" ")}
                </div>
                {p.sizeLabel && (
                  <div style={{ fontFamily: "DM Sans, monospace", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                    {p.sizeLabel}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn-app-ghost"
                onClick={() => setLocalData({
                  ...localData,
                  alternativeStoreProductIds: localData.alternativeStoreProductIds.filter((id) => id !== p.id),
                })}
                style={{ padding: "0.25rem 0.5rem", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
          <ProductCombobox
            placeholder="Add alternative product…"
            storeProducts={products}
            excludeIds={usedProductIds}
            onSelect={(p) =>
              setLocalData({
                ...localData,
                alternativeStoreProductIds: [...localData.alternativeStoreProductIds, p.id],
              })
            }
          />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-app-primary" onClick={() => onSave(localData)} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn-app-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

interface IngredientViewProps {
  item: IngredientCatalog;
  onEdit: () => void;
  onDelete: () => void;
}

function IngredientView({ item, onEdit, onDelete }: IngredientViewProps) {
  const hasProduct = item.defaultStoreProductName != null;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <button className="btn-app-primary" style={{ flex: 1 }} onClick={onEdit}>
          Edit Ingredient
        </button>
        <button
          className="btn-app-secondary"
          onClick={onDelete}
          style={{ padding: "0.5rem 0.75rem", color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
          title="Delete"
        >
          Delete
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🥗</div>
        <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "0.9rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--parchment)", margin: 0 }}>
          {item.name}
        </h3>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <span style={{ fontSize: "0.65rem", background: item.kind === "household" ? "#eef2ff" : "#f0fdf4", color: item.kind === "household" ? "#4338ca" : "#166534", padding: "0.2rem 0.5rem", borderRadius: 999, fontFamily: "DM Sans, monospace", fontWeight: 700 }}>
            {item.kind === "household" ? "Household" : "Food"}
          </span>
          {item.pantryStaple && (
            <span style={{ fontSize: "0.65rem", background: "#e8f5ee", color: "var(--protein-color)", padding: "0.2rem 0.5rem", borderRadius: 999, fontFamily: "DM Sans, monospace", fontWeight: 700 }}>
              Staple
            </span>
          )}
          {item.optional && (
            <span style={{ fontSize: "0.65rem", background: "var(--gold-light)", color: "var(--gold)", padding: "0.2rem 0.5rem", borderRadius: 999, fontFamily: "DM Sans, monospace", fontWeight: 700 }}>
              Optional
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div style={{ border: "1px solid var(--app-border)", borderRadius: 14, padding: "0.875rem 1rem", background: "var(--app-surface)" }}>
          <div style={{ fontFamily: "DM Sans, monospace", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-subtle)", marginBottom: "0.25rem" }}>
            Default store product
          </div>
          {hasProduct ? (
            <div style={{ fontFamily: "DM Sans, sans-serif", color: "var(--parchment)" }}>
              {item.defaultStoreProductUrl ? (
                <a href={item.defaultStoreProductUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", fontWeight: 650, textDecoration: "none" }}>
                  {item.defaultStoreProductName}
                </a>
              ) : (
                <span style={{ fontWeight: 650 }}>{item.defaultStoreProductName}</span>
              )}
              {item.defaultStoreProductStore && (
                <span style={{ marginLeft: "0.5rem", fontFamily: "DM Sans, monospace", fontSize: "0.7rem", color: "var(--text-subtle)", background: "var(--app-border)", padding: "0.15rem 0.5rem", borderRadius: 999 }}>
                  {item.defaultStoreProductStore}
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontFamily: "DM Sans, sans-serif", color: "var(--text-muted)" }}>—</div>
          )}
        </div>
      </div>
    </div>
  );
}

interface FindProductModalProps {
  ingredientName: string;
  onClose: () => void;
  onSelect: (product: StoreProduct) => void;
}

function FindProductModal({
  ingredientName,
  onClose,
  onSelect,
}: FindProductModalProps) {
  const [store, setStore] = useState<string>(STORES[0]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSearch = async () => {
    if (!ingredientName) {
      setError("Enter an ingredient name first.");
      return;
    }
    setSearching(true);
    setError(null);
    setSelectedId(null);
    setSearched(false);
    try {
      const found = await findStoreProducts(ingredientName, store);
      setProducts(found);
      setSearched(true);
      if (found.length === 0) {
        setError("No products found for this store. Try another store or search manually.");
      }
    } catch (err) {
      console.error(err);
      setProducts([]);
      setSearched(true);
      setError(err instanceof Error ? err.message : "Failed to find products");
    } finally {
      setSearching(false);
    }
  };

  const selected = selectedId
    ? products.find((p) => p.id === selectedId) ?? null
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-product-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: "min(85vh, 640px)",
          width: "min(560px, 100%)",
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <h2 id="find-product-title">Find product</h2>
        <p className="help-text" style={{ marginTop: 0 }}>
          Search <strong style={{ color: "var(--parchment)" }}>{ingredientName}</strong> at a store,
          then pick a product to link.
        </p>

        <div className="form-group" style={{ marginBottom: "0.75rem" }}>
          <label className="app-label" htmlFor="find-product-store">Store</label>
          <select
            id="find-product-store"
            className="app-input"
            value={store}
            onChange={(e) => {
              setStore(e.target.value);
              setProducts([]);
              setSearched(false);
              setSelectedId(null);
              setError(null);
            }}
            disabled={searching}
          >
            {STORES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn-app-primary"
          onClick={handleSearch}
          disabled={searching || !ingredientName}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.45rem",
            width: "100%",
            marginBottom: "0.75rem",
          }}
        >
          {searching ? (
            <>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Searching {store}…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Search with AI
            </>
          )}
        </button>

        {error && (
          <p className="form-error" style={{ margin: "0 0 0.75rem" }}>{error}</p>
        )}

        <div style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowX: "hidden",
          overflowY: "auto",
          display: "grid",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}>
          {products.map((p) => {
            const isSelected = selectedId === p.id;
            const brand = p.brand?.trim() ?? "";
            const name = p.name.trim();
            const title = brand && !name.toLowerCase().startsWith(brand.toLowerCase())
              ? `${brand} ${name}`
              : name;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                disabled={searching}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  textAlign: "left",
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  padding: "0.75rem 0.875rem",
                  borderRadius: 12,
                  cursor: "pointer",
                  border: isSelected
                    ? "1.5px solid var(--gold)"
                    : "1px solid var(--app-border)",
                  background: isSelected
                    ? "rgba(201,168,76,0.08)"
                    : "rgba(255,255,255,0.03)",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    width={40}
                    height={40}
                    style={{
                      width: 40,
                      height: 40,
                      objectFit: "contain",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.06)",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid var(--app-border)",
                    flexShrink: 0,
                    marginTop: 2,
                  }} />
                )}
                <div style={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}>
                  <div style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontWeight: 650,
                    color: "var(--parchment)",
                    lineHeight: 1.35,
                    whiteSpace: "normal",
                  }}>
                    {title}
                  </div>
                  <div style={{
                    fontFamily: "DM Sans, monospace",
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                    marginTop: "0.2rem",
                    lineHeight: 1.4,
                    whiteSpace: "normal",
                  }}>
                    {[p.store, p.sizeLabel].filter(Boolean).join(" · ")}
                    {p.productUrl && (
                      <>
                        {" · "}
                        <a
                          href={p.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--gold)", textDecoration: "none" }}
                        >
                          Open
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {!searching && searched && products.length === 0 && !error && (
            <p className="form-hint" style={{ margin: 0 }}>No products found.</p>
          )}
          {!searching && !searched && (
            <p className="form-hint" style={{ margin: 0 }}>
              Choose a store and search to see matching products.
            </p>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-app-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-app-primary"
            type="button"
            disabled={!selected}
            onClick={() => selected && onSelect(selected)}
          >
            Use product
          </button>
        </div>
      </div>
    </div>
  );
}

function IngredientCard({ item, isSelected, onSelect }: {
  item: IngredientCatalog;
  isSelected: boolean;
  onSelect: (i: IngredientCatalog) => void;
}) {
  const badges: Array<{ label: string; bg: string; fg: string }> = [];
  if (item.kind === "household") badges.push({ label: "household", bg: "#eef2ff", fg: "#4338ca" });
  if (item.pantryStaple) badges.push({ label: "staple", bg: "#e8f5ee", fg: "var(--protein-color)" });
  if (item.optional) badges.push({ label: "optional", bg: "var(--gold-light)", fg: "var(--gold)" });

  return (
    <button
      onClick={() => onSelect(item)}
      style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      <div className="app-card" style={{
        padding: "0.875rem 1rem",
        borderLeft: isSelected ? "3px solid var(--gold)" : "3px solid transparent",
        background: isSelected ? "rgba(185,90,16,0.04)" : "var(--app-surface)",
        transition: "all 0.15s",
      }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.5rem", lineHeight: 1, flexShrink: 0 }}>🥗</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: "0.9rem",
              color: "var(--parchment)",
              marginBottom: "0.25rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {item.name}
            </div>

            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
              {badges.slice(0, 2).map(b => (
                <span
                  key={b.label}
                  style={{
                    fontSize: "0.6rem",
                    fontFamily: "DM Sans, monospace",
                    fontWeight: 700,
                    background: b.bg,
                    color: b.fg,
                    padding: "0.15rem 0.4rem",
                    borderRadius: 999,
                  }}
                >
                  {b.label}
                </span>
              ))}

              {item.defaultStoreProductName && (
                <span style={{
                  fontSize: "0.6rem",
                  fontFamily: "DM Sans, monospace",
                  fontWeight: 600,
                  background: "var(--app-bg)",
                  color: "var(--text-muted)",
                  padding: "0.15rem 0.4rem",
                  borderRadius: 6,
                  maxWidth: "100%",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {item.defaultStoreProductName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
