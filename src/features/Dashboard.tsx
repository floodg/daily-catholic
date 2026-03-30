import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlannedMeal, Meal, MealStatus, PlannedWorkout } from "../domain/types";
import { getPlannedMeals } from "./planner/api";
import { getMealsForUser } from "./meals/api";
import { supabase } from "../lib/supabase";
import { formatDateLocal } from "../lib/dateUtils";
import { changePlannedMealStatusWithInventory } from "./mealCompletion";
import { getPlannedWorkouts, updatePlannedWorkoutStatus, getWalkingCompletions, toggleWalkingComplete } from "../storage/dataService";

type TodaysMeal = PlannedMeal & { meal?: Meal };

const MEAL_TIME_POSITION: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

export default function Dashboard() {
  const [todaysMeals, setTodaysMeals] = useState<TodaysMeal[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [todaysWorkouts, setTodaysWorkouts] = useState<PlannedWorkout[]>([]);
  const [walkingDone, setWalkingDone] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const today = formatDateLocal(new Date());
    Promise.all([getPlannedMeals(), getMealsForUser()])
      .then(([plannedMeals, allMeals]) => {
        const mealMap = new Map(allMeals.map(m => [m.id, m]));
        setTodaysMeals(
          plannedMeals
            .filter(pm => pm.date === today)
            .map(pm => ({ ...pm, meal: mealMap.get(pm.mealId) }))
            .sort((a, b) => {
              const aPos = MEAL_TIME_POSITION[a.time] ?? Number.MAX_SAFE_INTEGER;
              const bPos = MEAL_TIME_POSITION[b.time] ?? Number.MAX_SAFE_INTEGER;
              return aPos - bPos;
            })
        );
      })
      .catch(console.error)
      .finally(() => setMealsLoading(false));

    // Load today's workouts and walking completion
    try {
      const allPlanned = getPlannedWorkouts();
      setTodaysWorkouts(allPlanned.filter(w => w.date === today));
      const walking = getWalkingCompletions();
      setWalkingDone(Boolean(walking[today]));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const formatMealTime = (time: string) => {
    return time.charAt(0).toUpperCase() + time.slice(1);
  };

  const handleStatusChange = async (pm: TodaysMeal, newStatus: MealStatus) => {
    if (processingId === pm.id) return;
    setProcessingId(pm.id);
    try {
      const updated = await changePlannedMealStatusWithInventory({
        plannedMeal: pm,
        meal: pm.meal,
        newStatus,
        userId,
      });
      setTodaysMeals(prev =>
        prev.map(m => (m.id === pm.id ? { ...m, status: updated.status } : m))
      );
    } catch (err) {
      console.error('Failed to update meal status', err);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Dashboard</div>
          <h1 className="page-title">Today's <em>Plan</em></h1>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{new Date().toLocaleDateString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <section className="app-card">
          <div className="app-card-header"><span className="app-card-title">🍽️ Meals</span></div>
          {mealsLoading ? (
            <div className="app-card-body">
              <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                Loading…
              </p>
            </div>
          ) : todaysMeals.length === 0 ? (
            <div className="app-card-body">
              <div style={{
                background: 'var(--app-bg)',
                border: '1px solid var(--app-border)',
                borderRadius: '0.625rem',
                padding: '1rem 1.125rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}>
                <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: '0.875rem', color: 'var(--parchment)' }}>
                  Nothing on the menu yet
                </p>
                <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Head to your <Link to="/app/plan" style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>Weekly Plan</Link> to schedule meals for today.
                </p>
              </div>
            </div>
          ) : (
            <div className="app-card-body">
              {todaysMeals.map(pm => (
                <div
                  key={pm.id}
                  className="app-card"
                  style={{ marginBottom: '0.75rem', padding: '0.875rem 1rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <span className={`meal-time-badge ${pm.time}`}>{formatMealTime(pm.time)}</span>
                      <div style={{ fontWeight: 600, color: 'var(--parchment)', marginTop: '0.2rem' }}>{pm.meal?.name || "Unknown meal"}</div>
                      {pm.meal?.ingredients && pm.meal.ingredients.length > 0 && (
                        <ul style={{ margin: '0.375rem 0 0', padding: '0 0 0 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {pm.meal.ingredients.map(ing => (
                            <li key={ing.id}>
                              {ing.quantity ? `${ing.quantity} ${ing.name}` : ing.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      {pm.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{pm.notes}</div>}
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {pm.status === 'completed' && <span className="status-pill completed">✓ Eaten</span>}
                      {pm.status === 'skipped' && <span className="status-pill skipped">Skipped</span>}
                    </div>
                  </div>
                  {pm.status === 'planned' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--app-border)' }}>
                      <button
                        className="btn-app-primary"
                        onClick={() => handleStatusChange(pm, 'completed')}
                        disabled={processingId === pm.id}
                      >
                        {processingId === pm.id ? 'Saving…' : '✓ Mark eaten'}
                      </button>
                      <button
                        className="btn-app-secondary"
                        onClick={() => handleStatusChange(pm, 'skipped')}
                        disabled={processingId === pm.id}
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <Link to="/app/plan" className="btn-app-ghost" style={{ display: 'inline-flex', marginTop: '0.75rem', padding: '0.5rem 1rem' }}>View Weekly Plan →</Link>
        </section>

        {/* Workouts & Walking checklist */}
        <section className="app-card">
          <div className="app-card-header"><span className="app-card-title">💪 Workouts</span></div>
          <div className="app-card-body">
            {todaysWorkouts.length === 0 ? (
              <p style={{ margin: 0, fontFamily: 'DM Sans, sans-serif', fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                No workout scheduled. Plan one on the <Link to="/app/workouts" style={{ color: 'var(--gold)', fontWeight: 600, textDecoration: 'none' }}>Workouts</Link> page.
              </p>
            ) : (
              todaysWorkouts.map(w => (
                <div key={w.id} className="app-card" style={{ marginBottom: '0.75rem', padding: '0.875rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--parchment)' }}>{w.time ? `${w.time} · ` : ''}Workout</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {/* We don't have direct workout name here; link to page */}
                        <Link to="/app/workouts" style={{ color: 'var(--gold)', textDecoration: 'none' }}>View details</Link>
                      </div>
                    </div>
                    <div>
                      {w.status === 'completed' ? (
                        <span className="status-pill completed">✓ Done</span>
                      ) : w.status === 'skipped' ? (
                        <span className="status-pill skipped">Skipped</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn-app-primary" onClick={() => { updatePlannedWorkoutStatus(w.id, 'completed'); setTodaysWorkouts(prev => prev.map(x => x.id === w.id ? { ...x, status: 'completed' } : x)); }}>Mark done</button>
                          <button className="btn-app-secondary" onClick={() => { updatePlannedWorkoutStatus(w.id, 'skipped'); setTodaysWorkouts(prev => prev.map(x => x.id === w.id ? { ...x, status: 'skipped' } : x)); }}>Skip</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div className="app-card" style={{ padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    id="walk-check"
                    type="checkbox"
                    checked={walkingDone}
                    onChange={() => {
                      const today = formatDateLocal(new Date());
                      toggleWalkingComplete(today);
                      setWalkingDone(prev => !prev);
                    }}
                  />
                  <label htmlFor="walk-check" style={{ cursor: 'pointer' }}>
                    🚶 40 min walk (7–10k steps)
                  </label>
                </div>
                <Link to="/app/workouts" className="btn-app-ghost">Plan workouts</Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="app-card" style={{ marginTop: '1.5rem' }}>
        <div className="app-card-header"><span className="app-card-title">Quick Actions</span></div>
        <div className="app-card-body" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/app/meals" className="btn-app-primary">Browse Meals</Link>
          <Link to="/app/shopping" className="btn-app-primary">Shopping List</Link>
          <Link to="/app/plan" className="btn-app-primary">Plan Week</Link>
        </div>
      </section>
    </div>
  );
}
