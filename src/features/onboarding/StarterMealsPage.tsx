import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StarterMeal } from '../../domain/types';
import { getStarterMeals, importStarterMealsForUser, completeOnboarding } from '../meals/api';
import { seedStarterPlan } from '../planner/seedStarterPlan';
import { useAuth } from '../../context/AuthProvider';
import '../../app/app.css';
import './onboarding.css';

export default function StarterMealsPage() {
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [starterMeals, setStarterMeals] = useState<StarterMeal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generateMealPlan, setGenerateMealPlan] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileLoading && profile?.has_completed_onboarding) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [profile, profileLoading, navigate]);

  useEffect(() => {
    getStarterMeals()
      .then(meals => {
        setStarterMeals(meals);
        setSelected(new Set(meals.map(m => m.id)));
      })
      .catch(() => setError('Failed to load starter meals.'))
      .finally(() => setLoading(false));
  }, []);

  const toggleMeal = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(starterMeals.map(m => m.id)));
  const deselectAll = () => setSelected(new Set());

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await importStarterMealsForUser(Array.from(selected), user.id);
      if (generateMealPlan) {
        await seedStarterPlan(user.id);
      }
      await completeOnboarding(user.id);
      await refreshProfile();
      navigate('/app/meals', { replace: true });
    } catch (err) {
      setError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await completeOnboarding(user.id);
      await refreshProfile();
      navigate('/app/dashboard', { replace: true });
    } catch {
      navigate('/app/dashboard', { replace: true });
    }
  };

  if (loading || profileLoading) {
    return <div className="onboarding-loading">Loading starter meals…</div>;
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-container">
        <header className="onboarding-hero">
          <span className="onboarding-eyebrow">Getting started</span>
          <h1 className="page-title">👋 Welcome to Daily Catholic!</h1>
          <p className="onboarding-subtitle">
            Choose some starter meals to add to your meal library. You can edit or delete them any time.
          </p>
        </header>

        {error && <div className="onboarding-error" role="alert">{error}</div>}

        <section className="selection-controls" aria-label="Starter meal selection controls">
          <div className="selection-buttons">
            <button className="btn-app-ghost" type="button" onClick={selectAll}>Select All</button>
            <button className="btn-app-ghost" type="button" onClick={deselectAll}>Deselect All</button>
          </div>
          <span className="selection-count">{selected.size} of {starterMeals.length} selected</span>
        </section>

        <section className="starter-meals-grid" aria-label="Starter meals">
          {starterMeals.map(meal => {
            const isSelected = selected.has(meal.id);
            return (
              <button
                key={meal.id}
                type="button"
                className={`starter-meal-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleMeal(meal.id)}
                aria-pressed={isSelected}
              >
                <div className="card-top-row">
                  <span className="card-check" aria-hidden>{isSelected ? '✓' : ''}</span>
                  <h2>{meal.name}</h2>
                </div>

                {meal.description && <p className="card-description">{meal.description}</p>}

                {meal.tags.length > 0 && (
                  <div className="card-tags">
                    {meal.tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                )}

                <div className="card-meta">
                  {meal.prepTimeMins ? <span>⏱️ Prep {meal.prepTimeMins}m</span> : null}
                  {meal.cookTimeMins ? <span>🔥 Cook {meal.cookTimeMins}m</span> : null}
                  <span>🥗 {meal.ingredients.length} ingredients</span>
                </div>

                {meal.ingredients.length > 0 && (
                  <ul className="card-ingredients">
                    {meal.ingredients.slice(0, 5).map(ing => (
                      <li key={ing.id}>
                        {ing.name}{ing.quantity ? ` – ${ing.quantity}` : ''}
                      </li>
                    ))}
                    {meal.ingredients.length > 5 && (
                      <li className="more-ingredients">+{meal.ingredients.length - 5} more…</li>
                    )}
                  </ul>
                )}
              </button>
            );
          })}
        </section>

        <section className="onboarding-actions">
          <label htmlFor="generateMealPlan" className="starter-plan-option">
            <input
              id="generateMealPlan"
              type="checkbox"
              checked={generateMealPlan}
              onChange={e => setGenerateMealPlan(e.target.checked)}
            />
            <span>
              <strong>Generate my starter meal plan</strong>
              <small>Pre-populate your Weekly Meal Plan with a default month of keto meals.</small>
            </span>
          </label>

          <div className="onboarding-actions-buttons">
            <button
              className="btn-app-primary onboarding-primary-action"
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? 'Importing…' : `Import ${selected.size} Meal${selected.size !== 1 ? 's' : ''}`}
            </button>
            <button className="btn-app-secondary" onClick={handleSkip} disabled={saving}>
              Skip for now
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
