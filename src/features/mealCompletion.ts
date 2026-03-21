import type { Meal, MealStatus, PlannedMeal } from "../domain/types";
import { updatePlannedMealStatus } from "./planner/api";
import { supabase } from "../lib/supabase";

interface ChangeStatusOptions {
  plannedMeal: PlannedMeal;
  meal: Meal | undefined;
  newStatus: MealStatus;
  userId: string | null;
}

/**
 * Update a planned meal's status and, when marking as completed, record
 * corresponding inventory consumption transactions for each ingredient.
 *
 * This centralises the completion logic so both the dashboard and planner
 * views keep inventory in sync using the shared quantity parsing utilities.
 */
export async function changePlannedMealStatusWithInventory(
  options: ChangeStatusOptions
): Promise<PlannedMeal> {
  const { plannedMeal, newStatus, userId } = options;

  // When marking a meal as completed, use the atomic DB-side engine.
  if (newStatus === "completed") {
    if (!userId) {
      // Fallback: just update status if we somehow lack a user id
      return updatePlannedMealStatus(plannedMeal.id, newStatus);
    }
    const { error } = await supabase.rpc("mark_meal_eaten", {
      p_planned_meal_id: plannedMeal.id,
      p_user_id: userId,
    });
    if (error) throw error;
    // Either success or already_eaten → fetch the latest row and return it
    const { data: row, error: selErr } = await supabase
      .from("planned_meals")
      .select("*")
      .eq("id", plannedMeal.id)
      .single();
    if (selErr) throw selErr;
    // Map DB row to domain PlannedMeal (inline to avoid a circular import)
    const mapped: PlannedMeal = {
      id: row.id as string,
      date: row.planned_date as string,
      time: row.meal_slot as any,
      mealId: row.meal_id as string,
      servings: (row.servings as number | null) ?? 1,
      notes: (row.notes as string | null) ?? undefined,
      status: ((row.status as string | null) ?? "planned") as any,
    };
    return mapped;
  }

  // For other statuses (e.g. skipped), keep the simple update path.
  return updatePlannedMealStatus(plannedMeal.id, newStatus);
}

