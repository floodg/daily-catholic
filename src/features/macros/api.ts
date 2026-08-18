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
  const { data, error } = await supabase
    .from('user_ingredient_nutrition')
    .select('*')
    .order('ingredient_name', { ascending: true })

  if (error) throw error
  return (data as DbIngredientNutrition[]).map(mapNutrition)
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
