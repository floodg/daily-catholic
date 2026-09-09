import { supabase } from '../../lib/supabase'

export interface MacroTargets {
  caloriesKcal: number | null
  proteinG: number | null
  fatG: number | null
  totalCarbsG: number | null
  netCarbsG: number | null
}

export interface IngredientNutritionProfile {
  id?: string
  ingredientName: string
  basisUnit: 'g' | 'ml'
  amountPerUnit: number | null
  caloriesKcalPer100: number
  proteinGPer100: number
  fatGPer100: number
  totalCarbsGPer100: number
  fibreGPer100: number
}

interface DbMacroTargets {
  calories_kcal: number | null
  protein_g: number | null
  fat_g: number | null
  total_carbs_g: number | null
  net_carbs_g: number | null
}

interface DbIngredientNutrition {
  id: string
  ingredient_name: string
  basis_unit: 'g' | 'ml'
  amount_per_unit: number | null
  calories_kcal_per_100: number
  protein_g_per_100: number
  fat_g_per_100: number
  total_carbs_g_per_100: number
  fibre_g_per_100: number
}

interface DbMealIngredientNutritionSource {
  name: string
  store_product_id: string | null
}

function mapTargets(row: DbMacroTargets): MacroTargets {
  return {
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    fatG: row.fat_g,
    totalCarbsG: row.total_carbs_g,
    netCarbsG: row.net_carbs_g,
  }
}

function mapNutrition(row: DbIngredientNutrition): IngredientNutritionProfile {
  return {
    id: row.id,
    ingredientName: row.ingredient_name,
    basisUnit: row.basis_unit,
    amountPerUnit: row.amount_per_unit,
    caloriesKcalPer100: row.calories_kcal_per_100,
    proteinGPer100: row.protein_g_per_100,
    fatGPer100: row.fat_g_per_100,
    totalCarbsGPer100: row.total_carbs_g_per_100,
    fibreGPer100: row.fibre_g_per_100,
  }
}

async function fetchIngredientNutritionProfiles(): Promise<IngredientNutritionProfile[]> {
  const { data, error } = await supabase
    .from('user_ingredient_nutrition')
    .select('*')
    .order('ingredient_name', { ascending: true })

  if (error) throw error
  return (data as DbIngredientNutrition[]).map(mapNutrition)
}

async function hydrateMissingLinkedIngredientNutrition(
  profiles: IngredientNutritionProfile[],
): Promise<boolean> {
  const configured = new Set(
    profiles.map(profile => profile.ingredientName.trim().toLowerCase()),
  )

  const { data, error } = await supabase
    .from('meal_ingredients')
    .select('name, store_product_id')
    .not('store_product_id', 'is', null)

  if (error) {
    console.warn('Unable to discover ingredients for automatic nutrition hydration', error)
    return false
  }

  const missingByName = new Map<string, { ingredientName: string; productId: string }>()

  for (const row of (data ?? []) as DbMealIngredientNutritionSource[]) {
    const ingredientName = row.name?.trim()
    const productId = row.store_product_id?.trim()
    if (!ingredientName || !productId) continue

    const key = ingredientName.toLowerCase()
    if (configured.has(key) || missingByName.has(key)) continue
    missingByName.set(key, { ingredientName, productId })
  }

  if (missingByName.size === 0) return false

  const results = await Promise.allSettled(
    [...missingByName.values()].map(async ({ ingredientName, productId }) => {
      const { data: responseData, error: invokeError } = await supabase.functions.invoke(
        'hydrate-product-nutrition',
        { body: { ingredientName, productId } },
      )

      if (invokeError) throw invokeError
      return responseData?.hydrated === true
    }),
  )

  let shouldRefresh = false
  for (const result of results) {
    if (result.status === 'fulfilled') {
      // `hydrated: false` can also mean another request created the profile
      // while this page was loading, so refresh after every successful call.
      shouldRefresh = true
    } else {
      console.warn('Automatic ingredient nutrition hydration failed', result.reason)
    }
  }

  return shouldRefresh
}

export async function getMacroTargets(): Promise<MacroTargets | null> {
  const { data, error } = await supabase
    .from('macro_targets')
    .select('calories_kcal, protein_g, fat_g, total_carbs_g, net_carbs_g')
    .maybeSingle()

  if (error) throw error
  return data ? mapTargets(data as DbMacroTargets) : null
}

export async function saveMacroTargets(
  userId: string,
  targets: MacroTargets,
): Promise<MacroTargets> {
  const { data, error } = await supabase
    .from('macro_targets')
    .upsert({
      user_id: userId,
      calories_kcal: targets.caloriesKcal,
      protein_g: targets.proteinG,
      fat_g: targets.fatG,
      total_carbs_g: targets.totalCarbsG,
      net_carbs_g: targets.netCarbsG,
      updated_at: new Date().toISOString(),
    })
    .select('calories_kcal, protein_g, fat_g, total_carbs_g, net_carbs_g')
    .single()

  if (error) throw error
  return mapTargets(data as DbMacroTargets)
}

export async function getIngredientNutritionProfiles(): Promise<IngredientNutritionProfile[]> {
  const profiles = await fetchIngredientNutritionProfiles()
  const shouldRefresh = await hydrateMissingLinkedIngredientNutrition(profiles)
  return shouldRefresh ? fetchIngredientNutritionProfiles() : profiles
}

export async function saveIngredientNutritionProfile(
  userId: string,
  profile: IngredientNutritionProfile,
): Promise<IngredientNutritionProfile> {
  const ingredientName = profile.ingredientName.trim()
  const ingredientKey = ingredientName.toLowerCase()

  const { data, error } = await supabase
    .from('user_ingredient_nutrition')
    .upsert({
      user_id: userId,
      ingredient_key: ingredientKey,
      ingredient_name: ingredientName,
      basis_unit: profile.basisUnit,
      amount_per_unit: profile.amountPerUnit,
      calories_kcal_per_100: profile.caloriesKcalPer100,
      protein_g_per_100: profile.proteinGPer100,
      fat_g_per_100: profile.fatGPer100,
      total_carbs_g_per_100: profile.totalCarbsGPer100,
      fibre_g_per_100: profile.fibreGPer100,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,ingredient_key' })
    .select('*')
    .single()

  if (error) throw error
  return mapNutrition(data as DbIngredientNutrition)
}
