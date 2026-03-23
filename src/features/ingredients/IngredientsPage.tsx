import { useEffect, useState } from "react";
import type { IngredientCatalog } from "./api";
import {
  getIngredientsCatalog,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from "./api";
import { getStoreProducts } from "../store-products/api";
import { ProductCombobox } from "../ingredient-products/IngredientProductsPage";
import type { StoreProduct } from "../../domain/types";
import ListPage, { type PanelMode } from "../../components/ui/ListPage";

const EMPTY_FORM = {
  name: "",
  optional: false,
  pantryStaple: false,
  defaultStoreProductId: null as string | null,
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
          defaultStoreProductId: data.defaultStoreProductId,
        });
      } else {
        await createIngredient({
          name: data.name.trim(),
          optional: data.optional,
          pantryStaple: data.pantryStaple,
          defaultStoreProductId: data.defaultStoreProductId,
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
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving?: boolean;
  isNew: boolean;
}

function IngredientForm({
  initialItem,
  products,
  onSave,
  onCancel,
  saving,
  isNew,
}: IngredientFormProps) {
  const [localData, setLocalData] = useState<typeof EMPTY_FORM>(() => ({
    name: initialItem?.name ?? "",
    optional: initialItem?.optional ?? false,
    pantryStaple: initialItem?.pantryStaple ?? false,
    defaultStoreProductId: initialItem?.defaultStoreProductId ?? null,
  }));

  const selectedProduct = localData.defaultStoreProductId
    ? products.find((p) => p.id === localData.defaultStoreProductId)
    : null;

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
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontFamily: "DM Sans, sans-serif", color: "var(--parchment)" }}>
          <input
            type="checkbox"
            checked={localData.optional}
            onChange={(e) => setLocalData({ ...localData, optional: e.target.checked })}
            style={{ accentColor: "var(--gold)" }}
          />
          Optional (in recipes)
        </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontFamily: "DM Sans, sans-serif", color: "var(--parchment)" }}>
          <input
            type="checkbox"
            checked={localData.pantryStaple}
            onChange={(e) => setLocalData({ ...localData, pantryStaple: e.target.checked })}
            style={{ accentColor: "var(--protein-color)" }}
          />
          Pantry staple (excluded from shopping list)
        </label>
        </div>
      </div>

      <div className="form-group">
        <label className="app-label">Default store product</label>
        <div style={{ marginTop: "0.25rem" }}>
          {selectedProduct ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
              border: "1px solid var(--app-border)", borderRadius: 14, padding: "0.75rem 0.875rem",
              background: "rgba(253, 248, 242, 0.6)",
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
            <ProductCombobox
              placeholder="Search for a default product…"
              storeProducts={products}
              onSelect={(p) =>
                setLocalData({ ...localData, defaultStoreProductId: p.id })
              }
            />
          )}
        </div>
        <p className="form-hint">Link this ingredient to a preferred product for shopping and meal planning.</p>
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
          {!item.pantryStaple && !item.optional && (
            <span style={{ fontSize: "0.65rem", background: "var(--app-bg)", color: "var(--text-muted)", padding: "0.2rem 0.5rem", borderRadius: 999, fontFamily: "DM Sans, monospace", fontWeight: 700 }}>
              Standard
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

function IngredientCard({ item, isSelected, onSelect }: {
  item: IngredientCatalog;
  isSelected: boolean;
  onSelect: (i: IngredientCatalog) => void;
}) {
  const badges: Array<{ label: string; bg: string; fg: string }> = [];
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
