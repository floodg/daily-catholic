import type { Meal, PlannedMeal, Workout, PlannedWorkout, ShoppingItem } from "../domain/types";
import { load, save, STORAGE_KEYS, isInitialized, markInitialized } from "./storage";
import { getSeedMeals, getSeedWorkouts } from "./seedData";

/**
 * Initialize storage with seed data if empty
 */
export function initializeStorage(): void {
  if (!isInitialized()) {
    console.log("First run detected - seeding data");
    
    // Seed meals
    const meals = getSeedMeals();
    save(STORAGE_KEYS.meals, meals);
    
    // Seed workouts
    const workouts = getSeedWorkouts();
    save(STORAGE_KEYS.workouts, workouts);
    
    // Initialize empty arrays for planned items
    save(STORAGE_KEYS.plannedMeals, []);
    save(STORAGE_KEYS.plannedWorkouts, []);
    save(STORAGE_KEYS.shoppingManualItems, []);
    
    markInitialized();
  }
}

// Meals
export function getMeals(): Meal[] {
  return load<Meal[]>(STORAGE_KEYS.meals, []);
}

export function saveMeals(meals: Meal[]): void {
  save(STORAGE_KEYS.meals, meals);
}

export function getMealById(id: string): Meal | undefined {
  return getMeals().find(m => m.id === id);
}

export function addMeal(meal: Meal): void {
  const meals = getMeals();
  meals.push(meal);
  saveMeals(meals);
}

export function updateMeal(meal: Meal): void {
  const meals = getMeals();
  const index = meals.findIndex(m => m.id === meal.id);
  if (index !== -1) {
    meals[index] = meal;
    saveMeals(meals);
  }
}

export function deleteMeal(id: string): void {
  const meals = getMeals().filter(m => m.id !== id);
  saveMeals(meals);
}

// Planned Meals
export function getPlannedMeals(): PlannedMeal[] {
  return load<PlannedMeal[]>(STORAGE_KEYS.plannedMeals, []);
}

export function savePlannedMeals(plannedMeals: PlannedMeal[]): void {
  save(STORAGE_KEYS.plannedMeals, plannedMeals);
}

export function addPlannedMeal(plannedMeal: PlannedMeal): void {
  const plannedMeals = getPlannedMeals();
  plannedMeals.push(plannedMeal);
  savePlannedMeals(plannedMeals);
}

export function deletePlannedMeal(id: string): void {
  const plannedMeals = getPlannedMeals().filter(pm => pm.id !== id);
  savePlannedMeals(plannedMeals);
}

export function getPlannedMealsForDateRange(startDate: string, endDate: string): PlannedMeal[] {
  return getPlannedMeals().filter(pm => pm.date >= startDate && pm.date <= endDate);
}

// Workouts
export function getWorkouts(): Workout[] {
  return load<Workout[]>(STORAGE_KEYS.workouts, []);
}

export function saveWorkouts(workouts: Workout[]): void {
  save(STORAGE_KEYS.workouts, workouts);
}

export function getWorkoutById(id: string): Workout | undefined {
  return getWorkouts().find(w => w.id === id);
}

export function addWorkout(workout: Workout): void {
  const workouts = getWorkouts();
  workouts.push(workout);
  saveWorkouts(workouts);
}

export function updateWorkout(workout: Workout): void {
  const workouts = getWorkouts();
  const index = workouts.findIndex(w => w.id === workout.id);
  if (index !== -1) {
    workouts[index] = workout;
    saveWorkouts(workouts);
  }
}

export function deleteWorkout(id: string): void {
  const workouts = getWorkouts().filter(w => w.id !== id);
  saveWorkouts(workouts);
}

// Planned Workouts
export function getPlannedWorkouts(): PlannedWorkout[] {
  return load<PlannedWorkout[]>(STORAGE_KEYS.plannedWorkouts, []);
}

export function savePlannedWorkouts(plannedWorkouts: PlannedWorkout[]): void {
  save(STORAGE_KEYS.plannedWorkouts, plannedWorkouts);
}

export function addPlannedWorkout(plannedWorkout: PlannedWorkout): void {
  const plannedWorkouts = getPlannedWorkouts();
  plannedWorkouts.push(plannedWorkout);
  savePlannedWorkouts(plannedWorkouts);
}

export function deletePlannedWorkout(id: string): void {
  const plannedWorkouts = getPlannedWorkouts().filter(pw => pw.id !== id);
  savePlannedWorkouts(plannedWorkouts);
}

export function getPlannedWorkoutsForDate(date: string): PlannedWorkout[] {
  return getPlannedWorkouts().filter(pw => pw.date === date);
}

// Shopping Manual Items
export function getShoppingManualItems(): ShoppingItem[] {
  return load<ShoppingItem[]>(STORAGE_KEYS.shoppingManualItems, []);
}

export function saveShoppingManualItems(items: ShoppingItem[]): void {
  save(STORAGE_KEYS.shoppingManualItems, items);
}

export function addShoppingItem(item: ShoppingItem): void {
  const items = getShoppingManualItems();
  items.push(item);
  saveShoppingManualItems(items);
}

export function deleteShoppingItem(id: string): void {
  const items = getShoppingManualItems().filter(i => i.id !== id);
  saveShoppingManualItems(items);
}

export function toggleShoppingItemChecked(id: string): void {
  const items = getShoppingManualItems();
  const item = items.find(i => i.id === id);
  if (item) {
    item.checked = !item.checked;
    saveShoppingManualItems(items);
  }
}
