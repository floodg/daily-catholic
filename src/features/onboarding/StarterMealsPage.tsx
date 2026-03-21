import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StarterMeal } from '../../domain/types';
import { getStarterMeals, importStarterMealsForUser, completeOnboarding } from '../meals/api';
import { seedStarterPlan } from '../planner/seedStarterPlan';
import { useAuth } from '../../context/AuthProvider';

export default function StarterMealsPage() {
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [starterMeals, setStarterMeals] = useState<StarterMeal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generateMealPlan, setGenerateMealPlan] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user has already completed onboarding, skip to dashboard
  useEffect(() => {
    if (!profileLoading && profile?.has_completed_onboarding) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [profile, profileLoading, navigate]);

  useEffect(() => {
    getStarterMeals()
      .then(meals => {
        setStarterMeals(meals);
        // Pre-select all meals by default
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
    <div className="onboarding-page">
      <div className="page-header-bar">
        <h1 className="page-title">👋 Welcome to Joe's Keto!</h1>
        <p className="onboarding-subtitle">
          Choose some starter meals to add to your meal library.
          You can edit or delete them any time.
        </p>
      </div>

      {error && <div className="onboarding-error">{error}</div>}

      <div className="selection-controls">
        <button className="btn-app-ghost" onClick={selectAll}>Select All</button>
        <button className="btn-app-ghost" onClick={deselectAll}>Deselect All</button>
        <span className="selection-count">{selected.size} of {starterMeals.length} selected</span>
      </div>

      <div className="starter-meals-grid">
        {starterMeals.map(meal => (
          <div
            key={meal.id}
            className={`starter-meal-card ${selected.has(meal.id) ? 'selected' : ''}`}
            onClick={() => toggleMeal(meal.id)}
          >
            <div className="card-check">{selected.has(meal.id) ? '✅' : '⬜'}</div>
            <h3>{meal.name}</h3>
            {meal.description && <p className="card-description">{meal.description}</p>}

            {meal.tags.length > 0 && (
              <div className="card-tags">
                {meal.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            )}

            <div className="card-meta">
              {meal.prepTimeMins && <span>⏱️ Prep {meal.prepTimeMins}m</span>}
              {meal.cookTimeMins && <span>🔥 Cook {meal.cookTimeMins}m</span>}
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
          </div>
        ))}
      </div>

      <div className="onboarding-actions">
        <div className="form-group form-group-checkbox">
          <label htmlFor="generateMealPlan" className="checkbox-label">
            <input
              id="generateMealPlan"
              type="checkbox"
              checked={generateMealPlan}
              onChange={e => setGenerateMealPlan(e.target.checked)}
            />
            Generate my starter Joe's Keto meal plan
          </label>
          <span className="field-hint">Pre-populate your Weekly Meal Plan with a default month of keto meals</span>
        </div>
        <div className="onboarding-actions-buttons">
          <button
            className="btn-app-primary"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? 'Importing…' : `Import ${selected.size} Meal${selected.size !== 1 ? 's' : ''}`}
          </button>
          <button className="btn-app-secondary" onClick={handleSkip} disabled={saving}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

