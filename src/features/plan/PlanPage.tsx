import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, X, Check } from "lucide-react";
import type { PlannedMeal, Meal, MealTime, MealStatus } from "../../domain/types";
import { getPlannedMeals, createPlannedMeal, deletePlannedMeal } from "../planner/api";
import { getMealsForUser } from "../meals/api";
import { useAuth } from "../../context/AuthProvider";
import { changePlannedMealStatusWithInventory } from "../mealCompletion";
import { formatDateLocal, getMondayLocal } from "../../lib/dateUtils";

const MEAL_TIMES: MealTime[] = ["breakfast", "lunch", "dinner", "snack"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_EMOJIS: Record<MealTime, string> = {
  breakfast: "☀️",
  lunch: "🌤️",
  dinner: "🌙",
  snack: "⚡",
};

const TIME_LABELS: Record<MealTime, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function PlanPage() {
  const { user } = useAuth();
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMondayLocal(new Date()));
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalDate, setModalDate] = useState("");
  const [modalTime, setModalTime] = useState<MealTime>("breakfast");
  const [modalDayIdx, setModalDayIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pm, m] = await Promise.all([getPlannedMeals(), getMealsForUser()]);
      setPlannedMeals(pm);
      setMeals(m);
    } finally {
      setLoading(false);
    }
  };

  const weekDates: Date[] = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const todayStr = formatDateLocal(new Date());

  const getMealForSlot = (date: Date, time: MealTime): PlannedMeal | undefined => {
    const dateStr = formatDateLocal(date);
    return plannedMeals.find(pm => pm.date === dateStr && pm.time === time);
  };

  const getMealName = (mealId: string): string =>
    meals.find(m => m.id === mealId)?.name || "Unknown meal";

  const handleAddMeal = (date: Date, time: MealTime, dayIdx: number) => {
    setModalDate(formatDateLocal(date));
    setModalTime(time);
    setModalDayIdx(dayIdx);
    setShowAddModal(true);
  };

  const handleSaveModal = async (mealId: string, servings: number) => {
    if (!user) return;
    try {
      await createPlannedMeal({
        date: modalDate,
        time: modalTime,
        mealId,
        userId: user.id,
        status: "planned",
        servings,
      });
      await loadData();
    } catch (err) {
      console.error(err);
      alert("Failed to add meal to plan.");
    }
    setShowAddModal(false);
  };

  const handleRemoveMeal = async (id: string) => {
    if (!confirm("Remove this meal from the plan?")) return;
    try {
      await deletePlannedMeal(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (pm: PlannedMeal, newStatus: MealStatus) => {
    if (!user || updatingId === pm.id) return;
    setUpdatingId(pm.id);
    try {
      const meal = meals.find(m => m.id === pm.mealId);
      const updated = await changePlannedMealStatusWithInventory({
        plannedMeal: pm,
        meal,
        newStatus,
        userId: user.id,
      });
      setPlannedMeals(prev =>
        prev.map(m => (m.id === pm.id ? { ...m, status: updated.status } : m))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <p style={{ padding: "2rem", color: "var(--text-subtle)", fontFamily: "DM Sans, sans-serif" }}>
          Loading plan…
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header-bar">
        <div>
          <p className="page-eyebrow">Meal Planning</p>
          <h1 className="page-title">Weekly <em>Plan</em></h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className="btn-app-ghost"
            onClick={() => setCurrentWeekStart(d => addDays(d, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="btn-app-secondary"
            onClick={() => setCurrentWeekStart(getMondayLocal(new Date()))}
            style={{ fontSize: "0.8rem", padding: "0.375rem 0.875rem" }}
          >
            Today
          </button>
          <button
            className="btn-app-ghost"
            onClick={() => setCurrentWeekStart(d => addDays(d, 7))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
        {formatHeaderDate(weekDates[0])} → {formatHeaderDate(weekDates[6])}
      </p>

      {/* Grid */}
      <div style={{ overflowX: "auto", borderRadius: 16, boxShadow: "var(--card-shadow)" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `80px repeat(7, minmax(130px, 1fr))`,
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          borderRadius: 16,
          overflow: "hidden",
          minWidth: 760,
        }}>
          {/* Header row — top-left corner */}
          <div style={{
            background: "#0d1117",
            padding: "0.875rem 0.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{
              fontSize: "0.6rem",
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "DM Sans, sans-serif",
            }}>
              Meal
            </span>
          </div>

          {/* Header row — day columns */}
          {weekDates.map((date, i) => {
            const ds = formatDateLocal(date);
            const isToday = ds === todayStr;
            return (
              <div key={i} style={{
                background: isToday ? "rgba(201,168,76,0.12)" : "#0d1117",
                padding: "0.625rem 0.5rem",
                textAlign: "center",
                borderLeft: "1px solid rgba(255,255,255,0.07)",
              }}>
                <div style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: isToday ? "#c9a84c" : "rgba(232,224,208,0.45)",
                  marginBottom: "0.125rem",
                }}>
                  {DAYS[i]}
                </div>
                <div style={{
                  fontSize: "0.75rem",
                  color: isToday ? "#c9a84c" : "rgba(232,224,208,0.8)",
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 500,
                }}>
                  {date.getDate()}/{date.getMonth() + 1}
                </div>
              </div>
            );
          })}

          {/* Meal time rows */}
          {MEAL_TIMES.map(time => (
            <>
              {/* Time label cell */}
              <div key={`label-${time}`} style={{
                padding: "0.75rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderTop: "1px solid var(--app-border)",
                background: "var(--app-bg)",
                gap: "0.2rem",
              }}>
                <span style={{ fontSize: "1rem" }}>{TIME_EMOJIS[time]}</span>
                <span style={{
                  fontSize: "0.55rem",
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-subtle)",
                }}>
                  {TIME_LABELS[time]}
                </span>
              </div>

              {/* Day cells */}
              {weekDates.map((date, dayIdx) => {
                const ds = formatDateLocal(date);
                const isToday = ds === todayStr;
                const pm = getMealForSlot(date, time);
                const isUpdating = pm ? updatingId === pm.id : false;

                return (
                  <div key={`${dayIdx}-${time}`} style={{
                    padding: "0.375rem",
                    borderTop: "1px solid var(--app-border)",
                    borderLeft: "1px solid var(--app-border)",
                    background: isToday ? "rgba(185,90,16,0.04)" : "transparent",
                    minHeight: 80,
                    display: "flex",
                    alignItems: "stretch",
                  }}>
                    {pm ? (
                      <div style={{
                        width: "100%",
                        borderRadius: 10,
                        padding: "0.5rem",
                        background: pm.status === "completed" ? "rgba(138,180,160,0.08)" : pm.status === "skipped" ? "rgba(255,255,255,0.03)" : "rgba(168,196,224,0.06)",
                        border: `1px solid ${pm.status === "completed" ? "rgba(138,180,160,0.25)" : pm.status === "skipped" ? "rgba(255,255,255,0.07)" : "rgba(168,196,224,0.2)"}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.3rem",
                        position: "relative",
                      }}>
                        {/* Delete button — revealed on hover */}
                        <button
                          onClick={() => handleRemoveMeal(pm.id)}
                          className="plan-remove-btn"
                          style={{
                            position: "absolute",
                            top: 3,
                            right: 3,
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#cbd5e1",
                            fontSize: "0.7rem",
                            lineHeight: 1,
                            padding: 2,
                            borderRadius: 4,
                          }}
                          title="Remove"
                          aria-label="Remove meal"
                        >
                          ✕
                        </button>

                        <span style={{ fontSize: "0.7rem", fontFamily: "DM Sans, sans-serif", fontWeight: 600, color: pm.status === "completed" ? "#8ab4a0" : "var(--parchment)", lineHeight: 1.2, textDecoration: pm.status === "completed" ? "line-through" : "none", textDecorationColor: "#8ab4a0", paddingRight: "1rem" }}>
                          {getMealName(pm.mealId)}
                        </span>

                        {pm.servings > 1 && (
                          <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontFamily: "DM Sans, monospace" }}>
                            ×{pm.servings} servings
                          </span>
                        )}

                        {pm.status === "planned" && (
                          <div style={{ display: "flex", gap: "0.2rem", marginTop: "auto" }}>
                            <button
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(pm, "completed")}
                              style={{
                                flex: 1,
                                background: "#16a34a",
                                color: "white",
                                border: "none",
                                borderRadius: 4,
                                padding: "0.175rem 0.25rem",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                letterSpacing: "0.04em",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.2rem",
                                opacity: isUpdating ? 0.6 : 1,
                              }}
                              title="Mark as eaten"
                            >
                              {isUpdating ? "…" : <><Check size={10} /> Eat</>}
                            </button>
                            <button
                              disabled={isUpdating}
                              onClick={() => handleStatusChange(pm, "skipped")}
                              style={{
                                background: "transparent",
                                color: "var(--text-muted)",
                                border: "1px solid var(--app-border)",
                                borderRadius: 4,
                                padding: "0.175rem 0.375rem",
                                fontSize: "0.6rem",
                                cursor: "pointer",
                                opacity: isUpdating ? 0.6 : 1,
                              }}
                              title="Skip this meal"
                            >
                              Skip
                            </button>
                          </div>
                        )}

                        {pm.status === "completed" && (
                          <span style={{ fontSize: "0.6rem", color: "#8ab4a0", fontWeight: 700, letterSpacing: "0.04em" }}>
                            ✓ Eaten
                          </span>
                        )}

                        {pm.status === "skipped" && (
                          <span style={{ fontSize: "0.6rem", color: "var(--text-subtle)", fontWeight: 700, letterSpacing: "0.04em" }}>
                            Skipped
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddMeal(date, time, dayIdx)}
                        className="plan-add-btn"
                        style={{
                          width: "100%",
                          minHeight: 70,
                          background: "transparent",
                          border: "1.5px dashed var(--app-border)",
                          color: "var(--text-subtle)",
                          borderRadius: 10,
                          cursor: "pointer",
                          fontSize: "1.125rem",
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title={`Add ${time} on ${DAYS_FULL[dayIdx]}`}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Add meal modal */}
      {showAddModal && (
        <AddMealModal
          meals={meals}
          date={modalDate}
          time={modalTime}
          dayIdx={modalDayIdx}
          onSave={handleSaveModal}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {/* Footer links */}
      <section style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link to="/app/dashboard" className="btn-app-ghost">Dashboard</Link>
          <Link to="/app/meals" className="btn-app-ghost">Manage Meals</Link>
          <Link to="/app/shopping" className="btn-app-ghost">Shopping List</Link>
          <Link to="/app/shopping-trips" className="btn-app-ghost">Shopping Trips</Link>
          <Link to="/app/inventory" className="btn-app-ghost">Inventory</Link>
        </div>
      </section>

      <style>{`
        .plan-remove-btn { opacity: 0; transition: opacity 0.15s; }
        div:hover > .plan-remove-btn { opacity: 1; }
        .plan-add-btn:hover {
          border-color: rgba(201,168,76,0.5) !important;
          color: var(--gold) !important;
          background: rgba(201,168,76,0.06) !important;
        }
      `}</style>
    </div>
  );
}

/* ── Add Meal Modal ──────────────────────────────────────────────────────────── */

interface AddMealModalProps {
  meals: Meal[];
  date: string;
  time: MealTime;
  dayIdx: number;
  onSave: (mealId: string, servings: number) => void;
  onCancel: () => void;
}

function AddMealModal({ meals, date, time, dayIdx, onSave, onCancel }: AddMealModalProps) {
  const [selectedMealId, setSelectedMealId] = useState("");
  const [servings, setServings] = useState(1);

  const handleSave = () => {
    if (!selectedMealId) { alert("Please select a meal"); return; }
    onSave(selectedMealId, servings);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,26,23,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={onCancel}
    >
      <div
        className="app-card"
        style={{ maxWidth: 400, width: "100%", padding: "1.5rem" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
          <div>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "0.9rem", letterSpacing: "0.06em", textTransform: "uppercase", margin: 0, color: "var(--parchment)" }}>
              Add Meal
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.2rem 0 0", fontFamily: "DM Sans, sans-serif" }}>
              {TIME_LABELS[time]} · {DAYS[dayIdx]} {date}
            </p>
          </div>
          <button className="btn-app-ghost" onClick={onCancel} style={{ padding: "0.25rem" }}>
            <X size={18} />
          </button>
        </div>

        <div className="form-group">
          <label className="app-label">Choose a meal</label>
          <select
            value={selectedMealId}
            onChange={e => setSelectedMealId(e.target.value)}
            className="app-input"
            autoFocus
          >
            <option value="">Select a meal…</option>
            {meals.map(meal => (
              <option key={meal.id} value={meal.id}>{meal.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="app-label">Servings</label>
          <input
            type="number"
            min={1}
            value={servings}
            onChange={e => setServings(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="app-input"
          />
        </div>

        <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
          <button className="btn-app-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-app-primary" onClick={handleSave} disabled={!selectedMealId}>
            Add to Plan
          </button>
        </div>
      </div>
    </div>
  );
}
