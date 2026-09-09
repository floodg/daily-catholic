import type { Ingredient, Meal, PlannedMeal } from '../../domain/types'
import type { IngredientNutritionProfile } from './api'

export interface NutritionTotals {
  caloriesKcal: number
  proteinG: number
  fatG: number
  totalCarbsG: number
  fibreG: number
  netCarbsG: number
}

export interface MealMacroBreakdown {
  plannedMeal: PlannedMeal
  meal?: Meal
  totals: NutritionTotals
  incompleteIngredients: string[]
}

export interface DayMacroSummary {
  completed: NutritionTotals
  planned: NutritionTotals
  completedIncomplete: boolean
  plannedIncomplete: boolean
  meals: MealMacroBreakdown[]
}

export const EMPTY_TOTALS: NutritionTotals = {
  caloriesKcal: 0,
  proteinG: 0,
  fatG: 0,
  totalCarbsG: 0,
  fibreG: 0,
  netCarbsG: 0,
}

export function addTotals(a: NutritionTotals, b: NutritionTotals): NutritionTotals {
  return {
    caloriesKcal: a.caloriesKcal + b.caloriesKcal,
    proteinG: a.proteinG + b.proteinG,
    fatG: a.fatG + b.fatG,
    totalCarbsG: a.totalCarbsG + b.totalCarbsG,
    fibreG: a.fibreG + b.fibreG,
    netCarbsG: a.netCarbsG + b.netCarbsG,
  }
}

function scaleTotals(value: NutritionTotals, factor: number): NutritionTotals {
  return {
    caloriesKcal: value.caloriesKcal * factor,
    proteinG: value.proteinG * factor,
    fatG: value.fatG * factor,
    totalCarbsG: value.totalCarbsG * factor,
    fibreG: value.fibreG * factor,
    netCarbsG: value.netCarbsG * factor,
  }
}

function ingredientBasisAmount(
  ingredient: Ingredient,
  profile: IngredientNutritionProfile,
): number | null {
  const amount = ingredient.quantityNum
  const unit = ingredient.unit
  if (amount == null || amount < 0 || !unit) return null

  if (profile.basisUnit === 'g') {
    if (unit === 'g') return amount
    if (unit === 'kg') return amount * 1000
  }

  if (profile.basisUnit === 'ml') {
    if (unit === 'ml') return amount
    if (unit === 'l') return amount * 1000
    if (unit === 'tsp') return amount * 5
    if (unit === 'tbsp') return amount * 15
    if (unit === 'cup') return amount * 250
  }

  if (unit === 'units' && profile.amountPerUnit != null) {
    return amount * profile.amountPerUnit
  }

  return null
}

export function calculateIngredientNutrition(
  ingredient: Ingredient,
  profile: IngredientNutritionProfile,
): NutritionTotals | null {
  const basisAmount = ingredientBasisAmount(ingredient, profile)
  if (basisAmount == null) return null

  const factor = basisAmount / 100
  const netCarbsPer100 = Math.max(
    profile.totalCarbsGPer100 - profile.fibreGPer100,
    0,
  )

  return {
    caloriesKcal: profile.caloriesKcalPer100 * factor,
    proteinG: profile.proteinGPer100 * factor,
    fatG: profile.fatGPer100 * factor,
    totalCarbsG: profile.totalCarbsGPer100 * factor,
    fibreG: profile.fibreGPer100 * factor,
    netCarbsG: netCarbsPer100 * factor,
  }
}

export function calculateMealNutrition(
  meal: Meal,
  profilesByIngredient: Map<string, IngredientNutritionProfile>,
): { totals: NutritionTotals; incompleteIngredients: string[] } {
  let totals = { ...EMPTY_TOTALS }
  const incompleteIngredients: string[] = []

  for (const ingredient of meal.ingredients) {
    const key = ingredient.name.trim().toLowerCase()
    const profile = profilesByIngredient.get(key)
    if (!profile) {
      incompleteIngredients.push(ingredient.name)
      continue
    }

    const ingredientTotals = calculateIngredientNutrition(ingredient, profile)
    if (!ingredientTotals) {
      incompleteIngredients.push(ingredient.name)
      continue
    }

    totals = addTotals(totals, ingredientTotals)
  }

  return { totals, incompleteIngredients }
}

export function buildDayMacroSummary(
  date: string,
  plannedMeals: PlannedMeal[],
  meals: Meal[],
  profiles: IngredientNutritionProfile[],
): DayMacroSummary {
  const mealsById = new Map(meals.map(meal => [meal.id, meal]))
  const profilesByIngredient = new Map(
    profiles.map(profile => [profile.ingredientName.trim().toLowerCase(), profile]),
  )

  let completed = { ...EMPTY_TOTALS }
  let planned = { ...EMPTY_TOTALS }
  let completedIncomplete = false
  let plannedIncomplete = false
  const breakdown: MealMacroBreakdown[] = []

  for (const plannedMeal of plannedMeals) {
    if (plannedMeal.date !== date || plannedMeal.status === 'skipped') continue

    const meal = mealsById.get(plannedMeal.mealId)
    if (!meal) {
      const missing: MealMacroBreakdown = {
        plannedMeal,
        totals: { ...EMPTY_TOTALS },
        incompleteIngredients: ['Meal details unavailable'],
      }
      breakdown.push(missing)
      if (plannedMeal.status === 'completed') completedIncomplete = true
      else plannedIncomplete = true
      continue
    }

    const calculated = calculateMealNutrition(meal, profilesByIngredient)
    const servings = plannedMeal.servings > 0 ? plannedMeal.servings : 1
    const totals = scaleTotals(calculated.totals, servings)
    const isIncomplete = calculated.incompleteIngredients.length > 0

    breakdown.push({
      plannedMeal,
      meal,
      totals,
      incompleteIngredients: calculated.incompleteIngredients,
    })

    if (plannedMeal.status === 'completed') {
      completed = addTotals(completed, totals)
      completedIncomplete ||= isIncomplete
    } else {
      planned = addTotals(planned, totals)
      plannedIncomplete ||= isIncomplete
    }
  }

  return {
    completed,
    planned,
    completedIncomplete,
    plannedIncomplete,
    meals: breakdown,
  }
}
