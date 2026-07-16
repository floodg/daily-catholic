import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Clock, Flame, Plus, Trash2 } from "lucide-react";
import type { Meal, Ingredient, MealIngredientProduct } from "../../domain/types";
import { getMealsForUser, createMeal, updateMeal, deleteMeal } from "./api";
import { upsertIngredientFlags, getIngredientsCatalog, resolvePreferredProductsForIngredientNames } from "../ingredients/api";
import { useAuth } from "../../context/AuthProvider";
import { v4 as uuidv4 } from "../../storage/uuid";
import ListPage from "../../components/ui/ListPage";

export default function MealsPage() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [pantryIngredientNames, setPantryIngredientNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [raw, list] = await Promise.all([getMealsForUser(), getIngredientsCatalog()]);
        if (cancelled) return;
        const sorted = [...raw].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        setMeals(sorted);
        setPantryIngredientNames(
          list.filter((i) => i.kind === 'food').map((i) => i.name)
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadMeals = async () => {
    const raw = await getMealsForUser();
    const sorted = [...raw].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    setMeals(sorted);
  };

  const handleSave = async (meal: Meal, onClose: () => void) => {
    if (!meal.name.trim()) { alert("Please enter a meal name"); return; }
    if (!user) return;
    setSaving(true);
    try {
      const flags = meal.ingredients
        .filter(i => i.name?.trim())
        .map(i => ({ name: i.name.trim(), optional: i.optional ?? false }));
      if (flags.length > 0) await upsertIngredientFlags(flags);

      const existing = meals.find(m => m.id === meal.id);
      if (existing) {
        await updateMeal(meal);
      } else {
        await createMeal({ ...meal, userId: user.id });
      }
      await loadMeals();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save meal. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, onClose: () => void) => {
    if (!confirm("Are you sure you want to delete this meal?")) return;
    try {
      await deleteMeal(id);
      await loadMeals();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to delete meal. Please try again.");
    }
  };

  if (loading) {
    return (
      <div>
        <p style={{ color: "var(--text-subtle)", fontFamily: "DM Sans, sans-serif", padding: "2rem 0" }}>
          Loading meals…
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <ListPage<Meal>
        eyebrow="Food Library"
        title="My <em>Meals</em>"
        items={meals}
        renderListItem={(meal, isSelected, onSelect) => (
          <MealCard key={meal.id} meal={meal} isSelected={isSelected} onSelect={onSelect} />
        )}
        renderDetail={(selected, onClose, mode, setMode) => {
          if (mode === "view" && selected) {
            const live = meals.find(m => m.id === selected.id) ?? selected;
            return (
              <MealDetail
                meal={live}
                onEdit={() => setMode("edit")}
                onDelete={() => handleDelete(live.id, onClose)}
              />
            );
          }
          const editMeal: Meal = selected ?? {
            id: uuidv4(), name: "", tags: [], ingredients: [], instructions: [],
          };
          return (
            <MealForm
              meal={editMeal}
              pantryIngredientNames={pantryIngredientNames}
              saving={saving}
              onSave={(m) => handleSave(m, onClose)}
              onCancel={onClose}
            />
          );
        }}
        searchPlaceholder="Search meals…"
        searchFilter={(meal, q) =>
          meal.name.toLowerCase().includes(q.toLowerCase()) ||
          (meal.tags ?? []).some(t => t.toLowerCase().includes(q.toLowerCase()))
        }
        addLabel="Add Meal"
        headerActions={
          <Link
            to="/app/meals/create-ai"
            className="btn-app-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            Create with AI
          </Link>
        }
        emptyIcon="🍽️"
        emptyText="No meals yet — add your first keto recipe!"
      />

      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link to="/app/plan" className="btn-app-ghost">Weekly Plan</Link>
          <Link to="/app/shopping" className="btn-app-ghost">Shopping List</Link>
          <Link to="/app/dashboard" className="btn-app-ghost">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}

/* ── Meal List Card ──────────────────────────────────────────────────────────── */

/** Puts a trailing "( … )" variant on its own line for cards (e.g. pizza style). */
function splitMealDisplayName(name: string): { primary: string; subtitle: string | null } {
  const trimmed = name.trim();
  const m = trimmed.match(/^(.*?)\s*(\([^)]+\))\s*$/);
  if (m && m[1].trim()) {
    return { primary: m[1].trim(), subtitle: m[2].trim() };
  }
  return { primary: trimmed, subtitle: null };
}

function MealCard({ meal, isSelected, onSelect }: {
  meal: Meal;
  isSelected: boolean;
  onSelect: (m: Meal) => void;
}) {
  const totalMins = (meal.prepTimeMins ?? 0) + (meal.cookTimeMins ?? 0);
  const { primary, subtitle } = splitMealDisplayName(meal.name);
  return (
    <button
      onClick={() => onSelect(meal)}
      style={{ width: "100%", maxWidth: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, boxSizing: "border-box" }}
    >
      <div className="app-card" style={{
        padding: "0.875rem 1rem",
        borderLeft: isSelected ? "3px solid var(--gold)" : "3px solid transparent",
        background: isSelected ? "rgba(201,168,76,0.05)" : "var(--app-surface)",
        transition: "all 0.15s",
        maxWidth: "100%",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", maxWidth: "100%" }}>
          <span style={{ fontSize: "1.5rem", lineHeight: 1, flexShrink: 0 }}>🍽️</span>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div style={{
              fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "0.9rem", color: "var(--parchment)",
              marginBottom: subtitle ? "0.2rem" : "0.25rem",
              lineHeight: 1.3,
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}>
              {primary}
            </div>
            {subtitle && (
              <span style={{
                display: "inline-block",
                fontSize: "0.65rem",
                fontFamily: "DM Sans, monospace",
                fontWeight: 600,
                background: "var(--app-bg)",
                color: "var(--text-muted)",
                padding: "0.15rem 0.4rem",
                borderRadius: 4,
                marginBottom: "0.25rem",
                maxWidth: "100%",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                lineHeight: 1.25,
              }}>
                {subtitle}
              </span>
            )}
            {meal.tags && meal.tags.length > 0 && (
              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.375rem" }}>
                {meal.tags.slice(0, 3).map(tag => (
                  <span key={tag} style={{ fontSize: "0.6rem", fontFamily: "DM Sans, monospace", fontWeight: 600, background: "var(--app-bg)", color: "var(--text-muted)", padding: "0.15rem 0.4rem", borderRadius: 4 }}>
                    {tag}
                  </span>
                ))}
                {meal.tags.length > 3 && (
                  <span style={{ fontSize: "0.6rem", fontFamily: "DM Sans, monospace", fontWeight: 600, background: "var(--app-bg)", color: "var(--text-muted)", padding: "0.15rem 0.4rem", borderRadius: 4 }}>
                    +{meal.tags.length - 3}
                  </span>
                )}
              </div>
            )}
            {totalMins > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.65rem", color: "var(--text-subtle)", fontFamily: "DM Sans, sans-serif" }}>
                <Clock size={11} /> {totalMins}m
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Meal Detail View ────────────────────────────────────────────────────────── */

function MealDetail({ meal, onEdit, onDelete }: {
  meal: Meal;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const handleClosePopup = useCallback(() => setSelectedIngredient(null), []);
  const { primary, subtitle } = splitMealDisplayName(meal.name);

  return (
    <div>
      {/* Edit + Delete actions */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <button className="btn-app-primary" style={{ flex: 1 }} onClick={onEdit}>
          Edit Meal
        </button>
        <button
          className="btn-app-secondary"
          onClick={onDelete}
          style={{ padding: "0.5rem 0.75rem", color: "#f87171", borderColor: "rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.08)" }}
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Meal identity */}
      <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🍽️</div>
        <h3 style={{
          fontFamily: "'Cinzel', serif", fontSize: "1rem", color: "var(--parchment)",
          margin: "0 0 0.35rem", letterSpacing: "0.04em", lineHeight: 1.35,
          overflowWrap: "anywhere", wordBreak: "break-word", maxWidth: "100%", padding: "0 0.25rem", boxSizing: "border-box",
        }}>
          {primary}
        </h3>
        {subtitle && (
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem", padding: "0 0.25rem" }}>
            <span style={{
              fontSize: "0.65rem",
              fontFamily: "DM Sans, monospace",
              fontWeight: 600,
              background: "var(--app-bg)",
              color: "var(--text-muted)",
              padding: "0.2rem 0.5rem",
              borderRadius: 4,
              lineHeight: 1.25,
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              maxWidth: "100%",
              textAlign: "center",
            }}>
              {subtitle}
            </span>
          </div>
        )}
        {meal.tags && meal.tags.length > 0 && (
          <div style={{ display: "flex", gap: "0.375rem", justifyContent: "center", flexWrap: "wrap" }}>
            {meal.tags.map(tag => (
              <span key={tag} style={{ fontSize: "0.65rem", background: "var(--app-bg)", color: "var(--text-muted)", padding: "0.2rem 0.5rem", borderRadius: 4, fontFamily: "DM Sans, monospace", fontWeight: 600 }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Time */}
      {(meal.prepTimeMins || meal.cookTimeMins) && (
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem" }}>
          {meal.prepTimeMins && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "DM Sans, sans-serif" }}>
              <Clock size={14} /> Prep: {meal.prepTimeMins}m
            </div>
          )}
          {meal.cookTimeMins && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "DM Sans, sans-serif" }}>
              <Flame size={14} /> Cook: {meal.cookTimeMins}m
            </div>
          )}
        </div>
      )}

      {/* Ingredients */}
      {meal.ingredients.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 0.625rem" }}>
            Ingredients ({meal.ingredients.length})
          </h4>
          {meal.ingredients.map(ing => {
            const hasProducts = ing.primaryProduct != null || (ing.productOptions?.length ?? 0) > 0;
            const qtyLabel = ing.quantity ?? (ing.quantityNum != null ? `${ing.quantityNum}${ing.unit ? " " + ing.unit : ""}` : null);
            return (
              <div
                key={ing.id}
                onClick={() => hasProducts && setSelectedIngredient(ing)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  gap: "0.5rem", padding: "0.4rem 0.625rem", background: "var(--app-bg)", borderRadius: 8,
                  fontSize: "0.85rem", fontFamily: "DM Sans, sans-serif", marginBottom: "0.25rem",
                  cursor: hasProducts ? "pointer" : "default",
                  maxWidth: "100%",
                }}
                title={hasProducts ? "Click to view product options" : undefined}
              >
                <span style={{
                  color: "var(--parchment)", fontWeight: 500, flex: 1, minWidth: 0,
                  overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.35,
                }}>
                  {ing.name}
                  {ing.pantryStaple && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "#8ab4a0", background: "rgba(138,180,160,0.12)", border: "1px solid rgba(138,180,160,0.25)", padding: "0.05rem 0.3rem", borderRadius: "0.25rem" }}>
                      Staple
                    </span>
                  )}
                  {hasProducts && <span style={{ marginLeft: "0.375rem", fontSize: "0.85rem" }}>🛒</span>}
                </span>
                {qtyLabel && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", flexShrink: 0, whiteSpace: "nowrap" }}>{qtyLabel}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Instructions */}
      {meal.instructions.length > 0 && (
        <div>
          <h4 style={{ fontFamily: "DM Sans, sans-serif", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 0.625rem" }}>
            Instructions
          </h4>
          <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {meal.instructions.map((step, i) => (
              <li key={i} style={{ fontSize: "0.85rem", color: "var(--parchment)", lineHeight: 1.5, fontFamily: "DM Sans, sans-serif" }}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {meal.ingredients.length === 0 && meal.instructions.length === 0 && (
        <p style={{ color: "var(--text-subtle)", fontSize: "0.875rem", fontFamily: "DM Sans, sans-serif", fontStyle: "italic" }}>
          No details yet. Click Edit Meal to fill this in.
        </p>
      )}

      {selectedIngredient && (
        <IngredientProductPopup ingredient={selectedIngredient} onClose={handleClosePopup} />
      )}
    </div>
  );
}

/* ── Meal Edit Form ──────────────────────────────────────────────────────────── */

function MealForm({ meal, pantryIngredientNames, saving, onSave, onCancel }: {
  meal: Meal;
  pantryIngredientNames: string[];
  saving: boolean;
  onSave: (meal: Meal) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Meal>({ ...meal, ingredients: [...meal.ingredients], instructions: [...meal.instructions] });
  const isNew = !meal.name;

  const updateIngredient = (idx: number, patch: Partial<Ingredient>) => {
    setDraft(d => {
      const ings = [...d.ingredients];
      ings[idx] = { ...ings[idx], ...patch };
      return { ...d, ingredients: ings };
    });
  };

  return (
    <div>
      <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "0.9rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--parchment)", margin: "0 0 1.25rem" }}>
        {isNew ? "New Meal" : "Edit Meal"}
      </h3>

      <div className="form-group">
        <label className="app-label">Meal Name *</label>
        <input
          className="app-input"
          type="text"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="e.g. Mince Taco Bowl"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label className="app-label">Tags (comma-separated)</label>
        <input
          className="app-input"
          type="text"
          value={draft.tags?.join(", ") ?? ""}
          onChange={e => setDraft(d => ({ ...d, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) }))}
          placeholder="keto, quick, lunch"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <label className="app-label">Prep (mins)</label>
          <input
            className="app-input"
            type="number"
            min={0}
            value={draft.prepTimeMins ?? ""}
            onChange={e => setDraft(d => ({ ...d, prepTimeMins: e.target.value ? parseInt(e.target.value) : undefined }))}
          />
        </div>
        <div>
          <label className="app-label">Cook (mins)</label>
          <input
            className="app-input"
            type="number"
            min={0}
            value={draft.cookTimeMins ?? ""}
            onChange={e => setDraft(d => ({ ...d, cookTimeMins: e.target.value ? parseInt(e.target.value) : undefined }))}
          />
        </div>
      </div>

      {/* Ingredients */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <p className="app-label" style={{ margin: 0 }}>Ingredients</p>
          <button
            className="btn-app-ghost"
            style={{ fontSize: "0.75rem" }}
            onClick={() => setDraft(d => ({ ...d, ingredients: [...d.ingredients, { id: uuidv4(), name: "", store: "Coles" }] }))}
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <datalist id="ingredient-suggestions">
          {pantryIngredientNames.map(n => <option key={n} value={n} />)}
        </datalist>
        {draft.ingredients.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-subtle)", fontFamily: "DM Sans, sans-serif", fontStyle: "italic" }}>No ingredients yet</p>
        )}
        {draft.ingredients.map((ing, idx) => (
          <div key={ing.id} style={{ display: "grid", gridTemplateColumns: "1fr 0.5fr 0.5fr auto", gap: "0.375rem", marginBottom: "0.375rem", alignItems: "center" }}>
            <input
              className="app-input"
              type="text"
              value={ing.name}
              list="ingredient-suggestions"
              placeholder="Ingredient"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.625rem" }}
              onChange={e => updateIngredient(idx, { name: e.target.value })}
            />
            <input
              className="app-input"
              type="number"
              min={0}
              step="0.01"
              value={ing.quantityNum ?? ""}
              placeholder="Qty"
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.5rem" }}
              onChange={e => {
                const num = e.target.value === "" ? undefined : Number(e.target.value);
                updateIngredient(idx, { quantityNum: Number.isFinite(num as number) ? (num as number) : undefined });
              }}
            />
            <select
              className="app-input"
              value={ing.unit ?? ""}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.5rem" }}
              onChange={e => updateIngredient(idx, { unit: (e.target.value || undefined) as Ingredient["unit"] | undefined })}
            >
              <option value="">Unit…</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="units">units</option>
              <option value="tsp">tsp</option>
              <option value="tbsp">tbsp</option>
              <option value="cup">cup</option>
            </select>
            <button
              className="btn-app-ghost"
              style={{ padding: "0.375rem", color: "#dc2626" }}
              onClick={() => setDraft(d => ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== idx) }))}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <p className="app-label" style={{ margin: 0 }}>Instructions</p>
          <button
            className="btn-app-ghost"
            style={{ fontSize: "0.75rem" }}
            onClick={() => setDraft(d => ({ ...d, instructions: [...d.instructions, ""] }))}
          >
            <Plus size={13} /> Add step
          </button>
        </div>
        {draft.instructions.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-subtle)", fontFamily: "DM Sans, sans-serif", fontStyle: "italic" }}>No instructions yet</p>
        )}
        {draft.instructions.map((step, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1.5rem 1fr auto", gap: "0.375rem", marginBottom: "0.375rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)", fontFamily: "DM Sans, monospace", textAlign: "center" }}>{idx + 1}.</span>
            <input
              className="app-input"
              value={step}
              placeholder={`Step ${idx + 1}`}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.625rem" }}
              onChange={e => {
                const steps = [...draft.instructions];
                steps[idx] = e.target.value;
                setDraft(d => ({ ...d, instructions: steps }));
              }}
            />
            <button
              className="btn-app-ghost"
              style={{ padding: "0.375rem", color: "#dc2626" }}
              onClick={() => setDraft(d => ({ ...d, instructions: d.instructions.filter((_, i) => i !== idx) }))}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.625rem" }}>
        <button className="btn-app-primary" style={{ flex: 1 }} onClick={() => onSave(draft)} disabled={saving || !draft.name.trim()}>
          {saving ? "Saving…" : isNew ? "Add Meal" : "Save Changes"}
        </button>
        <button className="btn-app-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── Product Popup ───────────────────────────────────────────────────────────── */

function IngredientProductPopup({ ingredient, onClose }: { ingredient: Ingredient; onClose: () => void }) {
  const [products, setProducts] = useState<MealIngredientProduct[]>(() => {
    const initial: MealIngredientProduct[] = [];
    if (ingredient.primaryProduct) initial.push(ingredient.primaryProduct);
    for (const opt of ingredient.productOptions ?? []) {
      if (!initial.some(p => p.id === opt.id)) initial.push(opt);
    }
    return initial;
  });
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    async function loadIngredientProducts() {
      setLoadingProducts(true);
      try {
        const resolved = await resolvePreferredProductsForIngredientNames([ingredient.name]);
        if (!active) return;
        const entry = resolved.get(ingredient.name.trim().toLowerCase());
        if (!entry) return;
        const mapped: MealIngredientProduct[] = [entry.product, ...entry.alternatives]
          .filter(Boolean)
          .map(p => ({
            id: p!.storeProductId,
            name: p!.name,
            brand: p!.brand ?? undefined,
            sizeLabel: p!.sizeLabel ?? undefined,
            store: p!.store,
            productUrl: p!.productUrl ?? null,
          }));
        if (mapped.length > 0) setProducts(mapped);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoadingProducts(false);
      }
    }
    loadIngredientProducts();
    return () => { active = false; };
  }, [ingredient.name]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(28,26,23,0.6)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="app-card" style={{ maxWidth: "480px", width: "100%", maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div className="app-card-header">
          <div>
            <h3 className="app-card-title">{ingredient.name}</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>Available Products</p>
          </div>
          <button className="btn-app-ghost" style={{ padding: "0.25rem 0.5rem" }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul style={{ listStyle: "none", padding: "0 1.25rem 1.25rem", margin: 0 }}>
          {loadingProducts && (
            <li style={{ padding: "0.75rem 0", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Loading products…
            </li>
          )}
          {products.map(product => (
            <li key={product.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid var(--app-border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--parchment)" }}>{product.name}</span>
                {(product.brand || product.sizeLabel) && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {[product.brand, product.sizeLabel].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span style={{ fontSize: "0.7rem", color: "var(--text-subtle)" }}>{product.store}</span>
              </div>
              {product.productUrl ? (
                <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="btn-app-primary">
                  Open ↗
                </a>
              ) : (
                <span style={{ fontSize: "0.75rem", color: "var(--text-subtle)" }}>No link</span>
              )}
            </li>
          ))}
          {!loadingProducts && products.length === 0 && (
            <li style={{ padding: "0.75rem 0", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              No products available for this ingredient.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
