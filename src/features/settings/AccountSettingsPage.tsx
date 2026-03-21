import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StarterMeal } from '../../domain/types'
import { useAuth } from '../../context/AuthProvider'
import {
  getStarterMealsNotImportedForUser,
  importStarterMealsForUser,
} from '../meals/api'

export default function AccountSettingsPage() {
  const { user, profileLoading, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [remainingMeals, setRemainingMeals] = useState<StarterMeal[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadRemaining = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const meals = await getStarterMealsNotImportedForUser(user.id)
      setRemainingMeals(meals)
      // Import everything by default; user can deselect if desired.
      setSelected(new Set(meals.map(m => m.id)))
    } catch {
      setError('Failed to load remaining starter meals.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false

    ;(async () => {
      await loadRemaining()
      if (cancelled) return
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const toggleMeal = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(remainingMeals.map(m => m.id)))
  const deselectAll = () => setSelected(new Set())

  const handleImport = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await importStarterMealsForUser(Array.from(selected), user.id)
      await refreshProfile()
      await loadRemaining()
      setSuccess('Starter meals imported successfully.')
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || profileLoading) {
    return <div className="onboarding-loading">Loading starter meals…</div>
  }

  return (
    <div className="onboarding-page">
      <div className="page-header-bar">
        <h1 className="page-title">⚙️ Meal Imports</h1>
        <p className="onboarding-subtitle">
          Import any starter meals you didn't bring in during onboarding. If we add new
          starter meals later, they'll also show up here for you to import.
        </p>
      </div>

      {error && <div className="onboarding-error">{error}</div>}
      {success && (
        <div
          style={{
            background: 'rgba(138,180,160,0.1)',
            border: '1px solid rgba(138,180,160,0.25)',
            color: '#8ab4a0',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: '0.9rem',
          }}
        >
          {success}
        </div>
      )}

      {remainingMeals.length === 0 ? (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>
            You're all set. There are no remaining starter meals to import right now.
          </p>
          <p style={{ color: 'var(--text-subtle)', fontFamily: 'DM Sans, sans-serif' }}>
            If new starter meals are added, you'll be able to import them from this page.
          </p>
        </div>
      ) : (
        <>
          <div className="selection-controls">
            <button className="btn-app-ghost" onClick={selectAll} disabled={saving}>
              Select All
            </button>
            <button className="btn-app-ghost" onClick={deselectAll} disabled={saving}>
              Deselect All
            </button>
            <span className="selection-count">
              {selected.size} of {remainingMeals.length} selected
            </span>
          </div>

          <div className="starter-meals-grid">
            {remainingMeals.map(meal => (
              <div
                key={meal.id}
                className={`starter-meal-card ${selected.has(meal.id) ? 'selected' : ''}`}
                onClick={() => !saving && toggleMeal(meal.id)}
              >
                <div className="card-check">{selected.has(meal.id) ? '✅' : '⬜'}</div>
                <h3>{meal.name}</h3>
                {meal.description && (
                  <p className="card-description">{meal.description}</p>
                )}

                {meal.tags.length > 0 && (
                  <div className="card-tags">
                    {meal.tags.map(tag => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
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
                        {ing.name}
                        {ing.quantity ? ` – ${ing.quantity}` : ''}
                      </li>
                    ))}
                    {meal.ingredients.length > 5 && (
                      <li className="more-ingredients">
                        +{meal.ingredients.length - 5} more…
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="onboarding-actions">
            <div className="onboarding-actions-buttons">
              <button
                className="btn-app-primary"
                onClick={handleImport}
                disabled={saving || selected.size === 0}
              >
                {saving
                  ? 'Importing…'
                  : `Import ${selected.size} Meal${
                      selected.size !== 1 ? 's' : ''
                    }`}
              </button>
              <button className="btn-app-secondary" onClick={() => navigate('/app/dashboard')} disabled={saving}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

