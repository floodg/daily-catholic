import { supabase } from '../../lib/supabase';
import type { PlannedMeal, MealTime, MealStatus } from '../../domain/types';

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface DbPlannedMeal {
  id: string;
  user_id: string;
  meal_id: string;
  planned_date: string;
  meal_slot: string;
  planned_time: string | null;
  notes: string | null;
  status: string;
  servings: number | null;
  created_at: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function dbPlannedMealToDomain(row: DbPlannedMeal): PlannedMeal {
  return {
    id: row.id,
    date: row.planned_date,
    time: row.meal_slot as MealTime,
    mealId: row.meal_id,
    servings: row.servings ?? 1,
    notes: row.notes ?? undefined,
    status: (row.status ?? 'planned') as MealStatus,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getPlannedMeals(): Promise<PlannedMeal[]> {
  const { data, error } = await supabase
    .from('planned_meals')
    .select('*')
    .order('planned_date', { ascending: true });

  if (error) throw error;
  return (data as DbPlannedMeal[]).map(dbPlannedMealToDomain);
}

export async function getPlannedMealsForDateRange(
  startDate: string,
  endDate: string
): Promise<PlannedMeal[]> {
  const { data, error } = await supabase
    .from('planned_meals')
    .select('*')
    .gte('planned_date', startDate)
    .lte('planned_date', endDate)
    .order('planned_date', { ascending: true });

  if (error) throw error;
  return (data as DbPlannedMeal[]).map(dbPlannedMealToDomain);
}

export async function createPlannedMeal(
  plannedMeal: Omit<PlannedMeal, 'id'> & { userId: string }
): Promise<PlannedMeal> {
  const { data, error } = await supabase
    .from('planned_meals')
    .insert({
      user_id: plannedMeal.userId,
      meal_id: plannedMeal.mealId,
      planned_date: plannedMeal.date,
      meal_slot: plannedMeal.time,
      notes: plannedMeal.notes ?? null,
      status: plannedMeal.status ?? 'planned',
      servings: plannedMeal.servings ?? 1,
    })
    .select()
    .single();

  if (error) throw error;
  return dbPlannedMealToDomain(data as DbPlannedMeal);
}

export async function updatePlannedMealStatus(
  id: string,
  status: MealStatus
): Promise<PlannedMeal> {
  const { data, error } = await supabase
    .from('planned_meals')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return dbPlannedMealToDomain(data as DbPlannedMeal);
}

export async function deletePlannedMeal(id: string): Promise<void> {
  const { error } = await supabase.from('planned_meals').delete().eq('id', id);
  if (error) throw error;
}
