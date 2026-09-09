import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthProvider'
import { getMealsForUser } from '../meals/api'
import { getPlannedMealsForDateRange } from '../planner/api'
import type { Meal, PlannedMeal } from '../../domain/types'
import {
  getIngredientNutritionProfiles,
  getMacroTargets,
  saveIngredientNutritionProfile,
  saveMacroTargets,
} from './api'
import type { IngredientNutritionProfile, MacroTargets } from './api'
import { buildDayMacroSummary } from './calculations'
import type { DayMacroSummary, NutritionTotals } from './calculations'
import './MacrosPage.css'

type TargetDraft = {
  caloriesKcal: string
  proteinG: string
  fatG: string
  totalCarbsG: string
  netCarbsG: string
}

type NutritionDraft = {
  basisUnit: 'g' | 'ml'
  amountPerUnit: string
  caloriesKcalPer100: string
  proteinGPer100: string
  fatGPer100: string
  totalCarbsGPer100: string
  fibreGPer100: string
}

const EMPTY_TARGET_DRAFT: TargetDraft = {
  caloriesKcal: '',
  proteinG: '',
  fatG: '',
  totalCarbsG: '',
  netCarbsG: '',
}

const EMPTY_NUTRITION_DRAFT: NutritionDraft = {
  basisUnit: 'g',
  amountPerUnit: '',
  caloriesKcalPer100: '',
  proteinGPer100: '',
  fatGPer100: '',
  totalCarbsGPer100: '',
  fibreGPer100: '',
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

function formatDateLabel(dateString: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateString}T12:00:00`))
}

function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function targetToDraft(targets: MacroTargets | null): TargetDraft {
  if (!targets) return { ...EMPTY_TARGET_DRAFT }
  return {
    caloriesKcal: targets.caloriesKcal?.toString() ?? '',
    proteinG: targets.proteinG?.toString() ?? '',
    fatG: targets.fatG?.toString() ?? '',
    totalCarbsG: targets.totalCarbsG?.toString() ?? '',
    netCarbsG: targets.netCarbsG?.toString() ?? '',
  }
}

function optionalPositiveNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function requiredNonNegativeNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Nutrition values must be zero or greater.')
  }
  return parsed
}

function MacroProgressCard({
  label,
  value,
  planned,
  target,
  unit,
}: {
  label: string
  value: number
  planned: number
  target: number | null | undefined
  unit: string
}) {
  const percentage = target && target > 0 ? Math.min((value / target) * 100, 100) : 0
  const remaining = target == null ? null : target - value

  return (
    <div className="macro-progress-card">
      <div className="macro-progress-heading">
        <span>{label}</span>
        <strong>{formatNumber(value)}{unit}</strong>
      </div>
      <div className="macro-progress-track" aria-hidden="true">
        <div className="macro-progress-fill" style={{ width: `${percentage}%` }} />
      </div>
      <div className="macro-progress-meta">
        <span>{target != null ? `Target ${formatNumber(target)}${unit}` : 'No target set'}</span>
        <span>
          {remaining == null
            ? `${formatNumber(planned)}${unit} planned`
            : remaining >= 0
              ? `${formatNumber(remaining)}${unit} remaining`
              : `${formatNumber(Math.abs(remaining))}${unit} over`}
        </span>
      </div>
      {planned > 0 && <div className="macro-planned-note">+ {formatNumber(planned)}{unit} still planned</div>}
    </div>
  )
}

function DailyTotalsGrid({ summary, targets }: { summary: DayMacroSummary; targets: MacroTargets | null }) {
  return (
    <div className="macro-grid">
      <MacroProgressCard
        label="Calories"
        value={summary.completed.caloriesKcal}
        planned={summary.planned.caloriesKcal}
        target={targets?.caloriesKcal}
        unit=" kcal"
      />
      <MacroProgressCard
        label="Protein"
        value={summary.completed.proteinG}
        planned={summary.planned.proteinG}
        target={targets?.proteinG}
        unit="g"
      />
      <MacroProgressCard
        label="Fat"
        value={summary.completed.fatG}
        planned={summary.planned.fatG}
        target={targets?.fatG}
        unit="g"
      />
      <MacroProgressCard
        label="Net Carbs"
        value={summary.completed.netCarbsG}
        planned={summary.planned.netCarbsG}
        target={targets?.netCarbsG}
        unit="g"
      />
    </div>
  )
}

function SecondaryTotals({ totals }: { totals: NutritionTotals }) {
  return (
    <div className="macro-secondary-totals">
      <span>Total carbs <strong>{formatNumber(totals.totalCarbsG, 1)}g</strong></span>
      <span>Fibre <strong>{formatNumber(totals.fibreG, 1)}g</strong></span>
    </div>
  )
}

export default function MacrosPage() {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(localDateString())
  const [meals, setMeals] = useState<Meal[]>([])
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[]>([])
  const [targets, setTargets] = useState<MacroTargets | null>(null)
  const [profiles, setProfiles] = useState<IngredientNutritionProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingTargets, setEditingTargets] = useState(false)
  const [targetDraft, setTargetDraft] = useState<TargetDraft>(EMPTY_TARGET_DRAFT)
  const [savingTargets, setSavingTargets] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<string>('')
  const [nutritionDraft, setNutritionDraft] = useState<NutritionDraft>(EMPTY_NUTRITION_DRAFT)
  const [savingNutrition, setSavingNutrition] = useState(false)
  const [nutritionMessage, setNutritionMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const rangeStart = shiftDate(selectedDate, -6)

      try {
        const [mealData, plannedData, targetData, profileData] = await Promise.all([
          getMealsForUser(),
          getPlannedMealsForDateRange(rangeStart, selectedDate),
          getMacroTargets(),
          getIngredientNutritionProfiles(),
        ])

        if (cancelled) return
        setMeals(mealData)
        setPlannedMeals(plannedData)
        setTargets(targetData)
        setTargetDraft(targetToDraft(targetData))
        setProfiles(profileData)
      } catch (loadError) {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load macros.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const summary = useMemo(
    () => buildDayMacroSummary(selectedDate, plannedMeals, meals, profiles),
    [selectedDate, plannedMeals, meals, profiles],
  )

  const history = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, index - 6)).map(date => ({
      date,
      summary: buildDayMacroSummary(date, plannedMeals, meals, profiles),
    }))
  }, [selectedDate, plannedMeals, meals, profiles])

  const profileByName = useMemo(
    () => new Map(profiles.map(profile => [profile.ingredientName.trim().toLowerCase(), profile])),
    [profiles],
  )

  const usedIngredientNames = useMemo(() => {
    const names = new Set<string>()
    for (const breakdown of summary.meals) {
      for (const ingredient of breakdown.meal?.ingredients ?? []) {
        names.add(ingredient.name)
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [summary])

  const incompleteIngredientNames = useMemo(() => {
    const names = new Set<string>()
    for (const breakdown of summary.meals) {
      for (const name of breakdown.incompleteIngredients) {
        if (name !== 'Meal details unavailable') names.add(name)
      }
    }
    return names
  }, [summary])

  function beginEditingIngredient(name: string) {
    const profile = profileByName.get(name.trim().toLowerCase())
    setSelectedIngredient(name)
    setNutritionMessage(null)
    setNutritionDraft(profile ? {
      basisUnit: profile.basisUnit,
      amountPerUnit: profile.amountPerUnit?.toString() ?? '',
      caloriesKcalPer100: profile.caloriesKcalPer100.toString(),
      proteinGPer100: profile.proteinGPer100.toString(),
      fatGPer100: profile.fatGPer100.toString(),
      totalCarbsGPer100: profile.totalCarbsGPer100.toString(),
      fibreGPer100: profile.fibreGPer100.toString(),
    } : { ...EMPTY_NUTRITION_DRAFT })
  }

  async function handleSaveTargets(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    const nextTargets: MacroTargets = {
      caloriesKcal: optionalPositiveNumber(targetDraft.caloriesKcal),
      proteinG: optionalPositiveNumber(targetDraft.proteinG),
      fatG: optionalPositiveNumber(targetDraft.fatG),
      totalCarbsG: optionalPositiveNumber(targetDraft.totalCarbsG),
      netCarbsG: optionalPositiveNumber(targetDraft.netCarbsG),
    }

    if (Object.values(nextTargets).every(value => value == null)) {
      setError('Enter at least one daily macro target.')
      return
    }

    setSavingTargets(true)
    setError(null)
    try {
      const saved = await saveMacroTargets(user.id, nextTargets)
      setTargets(saved)
      setTargetDraft(targetToDraft(saved))
      setEditingTargets(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save targets.')
    } finally {
      setSavingTargets(false)
    }
  }

  async function handleSaveNutrition(event: FormEvent) {
    event.preventDefault()
    if (!user || !selectedIngredient) return

    setSavingNutrition(true)
    setNutritionMessage(null)
    setError(null)

    try {
      const amountPerUnit = nutritionDraft.amountPerUnit.trim()
        ? requiredNonNegativeNumber(nutritionDraft.amountPerUnit)
        : null

      const saved = await saveIngredientNutritionProfile(user.id, {
        ingredientName: selectedIngredient,
        basisUnit: nutritionDraft.basisUnit,
        amountPerUnit: amountPerUnit && amountPerUnit > 0 ? amountPerUnit : null,
        caloriesKcalPer100: requiredNonNegativeNumber(nutritionDraft.caloriesKcalPer100),
        proteinGPer100: requiredNonNegativeNumber(nutritionDraft.proteinGPer100),
        fatGPer100: requiredNonNegativeNumber(nutritionDraft.fatGPer100),
        totalCarbsGPer100: requiredNonNegativeNumber(nutritionDraft.totalCarbsGPer100),
        fibreGPer100: requiredNonNegativeNumber(nutritionDraft.fibreGPer100),
      })

      setProfiles(current => {
        const key = saved.ingredientName.trim().toLowerCase()
        return [...current.filter(item => item.ingredientName.trim().toLowerCase() !== key), saved]
          .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName))
      })
      setNutritionMessage(`Nutrition saved for ${selectedIngredient}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save nutrition.')
    } finally {
      setSavingNutrition(false)
    }
  }

  if (loading) {
    return <div className="app-card macro-state-card">Loading macro data…</div>
  }

  return (
    <div className="macros-page">
      <div className="page-header-bar macros-header">
        <div>
          <div className="page-eyebrow">Mensura Corporis</div>
          <h1 className="page-title">My Macros</h1>
          <p className="macros-subtitle">Track what you have eaten, what is still planned, and how each day compares with your targets.</p>
        </div>
        <div className="macros-header-actions">
          <input
            className="macro-date-input"
            type="date"
            value={selectedDate}
            max={localDateString()}
            onChange={event => setSelectedDate(event.target.value)}
            aria-label="Macro date"
          />
          <button className="btn-app-primary" type="button" onClick={() => setSelectedDate(localDateString())}>Today</button>
        </div>
      </div>

      {error && <div className="macro-alert macro-alert-error">{error}</div>}

      {!targets && !editingTargets && (
        <div className="macro-alert">
          <div>
            <strong>Set your daily targets</strong>
            <span>Add calories, protein, fat and carb targets so the dashboard can show remaining amounts.</span>
          </div>
          <button className="btn-app-primary" type="button" onClick={() => setEditingTargets(true)}>Set Targets</button>
        </div>
      )}

      <section className="macro-section">
        <div className="macro-section-heading">
          <div>
            <div className="page-eyebrow">Daily Measure</div>
            <h2>{formatDateLabel(selectedDate)}</h2>
          </div>
          <button className="macro-text-button" type="button" onClick={() => setEditingTargets(value => !value)}>
            {editingTargets ? 'Close targets' : 'Edit targets'}
          </button>
        </div>

        {editingTargets && (
          <form className="app-card macro-form-card" onSubmit={handleSaveTargets}>
            <h3>Daily targets</h3>
            <div className="macro-form-grid">
              <label>Calories (kcal)<input type="number" min="1" step="1" value={targetDraft.caloriesKcal} onChange={event => setTargetDraft({ ...targetDraft, caloriesKcal: event.target.value })} /></label>
              <label>Protein (g)<input type="number" min="1" step="0.1" value={targetDraft.proteinG} onChange={event => setTargetDraft({ ...targetDraft, proteinG: event.target.value })} /></label>
              <label>Fat (g)<input type="number" min="1" step="0.1" value={targetDraft.fatG} onChange={event => setTargetDraft({ ...targetDraft, fatG: event.target.value })} /></label>
              <label>Total carbs (g)<input type="number" min="1" step="0.1" value={targetDraft.totalCarbsG} onChange={event => setTargetDraft({ ...targetDraft, totalCarbsG: event.target.value })} /></label>
              <label>Net carbs (g)<input type="number" min="1" step="0.1" value={targetDraft.netCarbsG} onChange={event => setTargetDraft({ ...targetDraft, netCarbsG: event.target.value })} /></label>
            </div>
            <div className="macro-form-actions">
              <button className="btn-app-primary" type="submit" disabled={savingTargets}>{savingTargets ? 'Saving…' : 'Save Targets'}</button>
            </div>
          </form>
        )}

        <DailyTotalsGrid summary={summary} targets={targets} />
        <SecondaryTotals totals={summary.completed} />

        {(summary.completedIncomplete || summary.plannedIncomplete) && (
          <div className="macro-alert macro-alert-warning">
            Some totals are incomplete because one or more ingredients need nutrition data or a compatible measured quantity. Known values are still shown.
          </div>
        )}
      </section>

      <section className="macro-section">
        <div className="macro-section-heading">
          <div>
            <div className="page-eyebrow">Meals</div>
            <h2>Daily breakdown</h2>
          </div>
          <div className="macro-section-links">
            <Link to="/app/meals">Meals</Link>
            <Link to="/app/plan">Weekly Plan</Link>
          </div>
        </div>

        {summary.meals.length === 0 ? (
          <div className="app-card macro-empty-card">
            No meals are planned for this day. Add meals in the Weekly Plan to begin tracking.
          </div>
        ) : (
          <div className="macro-meal-list">
            {summary.meals.map(item => (
              <article className="app-card macro-meal-card" key={item.plannedMeal.id}>
                <div className="macro-meal-main">
                  <div>
                    <span className={`macro-status macro-status-${item.plannedMeal.status}`}>{item.plannedMeal.status}</span>
                    <h3>{item.meal?.name ?? 'Meal unavailable'}</h3>
                    <p>{item.plannedMeal.time} · {item.plannedMeal.servings} serving{item.plannedMeal.servings === 1 ? '' : 's'}</p>
                  </div>
                  <div className="macro-meal-values">
                    <strong>{formatNumber(item.totals.caloriesKcal)} kcal</strong>
                    <span>P {formatNumber(item.totals.proteinG, 1)}g</span>
                    <span>F {formatNumber(item.totals.fatG, 1)}g</span>
                    <span>NC {formatNumber(item.totals.netCarbsG, 1)}g</span>
                  </div>
                </div>
                {item.incompleteIngredients.length > 0 && (
                  <div className="macro-incomplete-line">
                    Incomplete: {item.incompleteIngredients.join(', ')}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="macro-section">
        <div className="macro-section-heading">
          <div>
            <div className="page-eyebrow">Nutrition Setup</div>
            <h2>Ingredient nutrition</h2>
          </div>
          {incompleteIngredientNames.size > 0 && <span className="macro-count-badge">{incompleteIngredientNames.size} need setup</span>}
        </div>
        <p className="macro-section-description">
          Nutrition is stored per 100 g or 100 ml. For ingredients measured as units, also enter the amount represented by one unit in the selected basis.
        </p>

        {usedIngredientNames.length === 0 ? (
          <div className="app-card macro-empty-card">Plan a meal to see its ingredients here.</div>
        ) : (
          <div className="macro-nutrition-layout">
            <div className="app-card macro-ingredient-list">
              {usedIngredientNames.map(name => {
                const profile = profileByName.get(name.trim().toLowerCase())
                const needsSetup = incompleteIngredientNames.has(name)
                return (
                  <button
                    key={name}
                    type="button"
                    className={`macro-ingredient-button ${selectedIngredient === name ? 'is-selected' : ''}`}
                    onClick={() => beginEditingIngredient(name)}
                  >
                    <span>{name}</span>
                    <small>{needsSetup ? 'Needs setup' : profile ? 'Configured' : 'Not configured'}</small>
                  </button>
                )
              })}
            </div>

            <div className="app-card macro-form-card macro-nutrition-form-card">
              {!selectedIngredient ? (
                <div className="macro-empty-form">Select an ingredient to add or edit its nutrition.</div>
              ) : (
                <form onSubmit={handleSaveNutrition}>
                  <h3>{selectedIngredient}</h3>
                  <div className="macro-form-grid macro-form-grid-nutrition">
                    <label>Basis
                      <select value={nutritionDraft.basisUnit} onChange={event => setNutritionDraft({ ...nutritionDraft, basisUnit: event.target.value as 'g' | 'ml' })}>
                        <option value="g">Per 100 g</option>
                        <option value="ml">Per 100 ml</option>
                      </select>
                    </label>
                    <label>Amount per unit ({nutritionDraft.basisUnit})<input type="number" min="0" step="0.1" value={nutritionDraft.amountPerUnit} onChange={event => setNutritionDraft({ ...nutritionDraft, amountPerUnit: event.target.value })} placeholder="Only for unit-based foods" /></label>
                    <label>Calories (kcal)<input required type="number" min="0" step="0.1" value={nutritionDraft.caloriesKcalPer100} onChange={event => setNutritionDraft({ ...nutritionDraft, caloriesKcalPer100: event.target.value })} /></label>
                    <label>Protein (g)<input required type="number" min="0" step="0.1" value={nutritionDraft.proteinGPer100} onChange={event => setNutritionDraft({ ...nutritionDraft, proteinGPer100: event.target.value })} /></label>
                    <label>Fat (g)<input required type="number" min="0" step="0.1" value={nutritionDraft.fatGPer100} onChange={event => setNutritionDraft({ ...nutritionDraft, fatGPer100: event.target.value })} /></label>
                    <label>Total carbs (g)<input required type="number" min="0" step="0.1" value={nutritionDraft.totalCarbsGPer100} onChange={event => setNutritionDraft({ ...nutritionDraft, totalCarbsGPer100: event.target.value })} /></label>
                    <label>Fibre (g)<input required type="number" min="0" step="0.1" value={nutritionDraft.fibreGPer100} onChange={event => setNutritionDraft({ ...nutritionDraft, fibreGPer100: event.target.value })} /></label>
                  </div>
                  <div className="macro-form-actions">
                    <button className="btn-app-primary" type="submit" disabled={savingNutrition}>{savingNutrition ? 'Saving…' : 'Save Nutrition'}</button>
                    {nutritionMessage && <span className="macro-save-message">{nutritionMessage}</span>}
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="macro-section">
        <div className="macro-section-heading">
          <div>
            <div className="page-eyebrow">Seven Days</div>
            <h2>Recent history</h2>
          </div>
        </div>
        <div className="app-card macro-history-card">
          {history.map(({ date, summary: day }) => {
            const calorieTarget = targets?.caloriesKcal ?? null
            const width = calorieTarget && calorieTarget > 0
              ? Math.min((day.completed.caloriesKcal / calorieTarget) * 100, 100)
              : Math.min(day.completed.caloriesKcal / 20, 100)
            return (
              <button key={date} type="button" className="macro-history-row" onClick={() => setSelectedDate(date)}>
                <span className="macro-history-date">{formatDateLabel(date)}</span>
                <span className="macro-history-bar"><span style={{ width: `${width}%` }} /></span>
                <span className="macro-history-values">
                  <strong>{formatNumber(day.completed.caloriesKcal)} kcal</strong>
                  <small>{formatNumber(day.completed.proteinG)}g P · {formatNumber(day.completed.netCarbsG)}g NC</small>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
