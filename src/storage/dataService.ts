import type {
  Meal,
  PlannedMeal,
  Workout,
  PlannedWorkout,
  ShoppingItem,
  WorkoutProgress,
  WorkoutStatus,
} from "../domain/types";
import { load, save, STORAGE_KEYS, isInitialized, markInitialized } from "./storage";
import { getSeedMeals, getSeedWorkouts } from "./seedData";
import { v4 as uuidv4 } from "./uuid";
import { formatDateLocal, getMondayLocal } from "../lib/dateUtils";

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
    save(STORAGE_KEYS.walkingCompletions, {});
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

// ─── Workouts: status & progression ────────────────────────────────────────────

export function updatePlannedWorkoutStatus(id: string, status: WorkoutStatus): void {
  const planned = getPlannedWorkouts();
  const idx = planned.findIndex(p => p.id === id);
  if (idx !== -1) {
    planned[idx] = { ...planned[idx], status };
    savePlannedWorkouts(planned);
  }
}

export function saveWorkoutProgress(progress: WorkoutProgress): void {
  const planned = getPlannedWorkouts();
  const idx = planned.findIndex(p => p.id === progress.plannedWorkoutId);
  if (idx !== -1) {
    planned[idx] = { ...planned[idx], status: "completed", progress };
    savePlannedWorkouts(planned);
  }
}

// ─── Workouts: rotation seeding (A/B weekly, 3 sessions) ──────────────────────
/**
 * Seed a 4-week rotation starting current Monday:
 * Mon: Workout A, Wed: Workout B, Fri: Workout A
 * Alternate A/B each week (so week2 starts with B).
 */
export function seedWorkoutRotationIfEmpty(): void {
  const planned = getPlannedWorkouts();
  if (planned.length > 0) return;

  const workouts = getWorkouts();
  const workoutA = workouts.find(w => /workout a/i.test(w.name)) || workouts[0];
  const workoutB = workouts.find(w => /workout b/i.test(w.name)) || workouts[1] || workouts[0];
  if (!workoutA) return;

  const monday = getMondayLocal(new Date());
  const WEEKS = 4;
  const toInsert: PlannedWorkout[] = [];

  for (let week = 0; week < WEEKS; week++) {
    const start = new Date(monday);
    start.setDate(start.getDate() + week * 7);
    const mon = new Date(start);
    const wed = new Date(start); wed.setDate(start.getDate() + 2);
    const fri = new Date(start); fri.setDate(start.getDate() + 4);

    const isEvenWeek = week % 2 === 0; // week0 even
    const first = isEvenWeek ? workoutA : workoutB;
    const second = isEvenWeek ? workoutB : workoutA;
    const third = isEvenWeek ? workoutA : workoutB;

    const make = (date: Date, workoutId: string): PlannedWorkout => ({
      id: uuidv4(),
      date: formatDateLocal(date),
      workoutId,
      time: "18:00",
      status: "planned",
    });

    toInsert.push(make(mon, first.id), make(wed, second.id), make(fri, third.id));
  }

  savePlannedWorkouts([...planned, ...toInsert]);
}

// ─── Walking daily checklist ───────────────────────────────────────────────────
/**
 * Track daily walking completion by local date string -> boolean.
 */
export function getWalkingCompletions(): Record<string, boolean> {
  return load<Record<string, boolean>>(STORAGE_KEYS.walkingCompletions, {});
}

export function toggleWalkingComplete(date: string): void {
  const map = getWalkingCompletions();
  map[date] = !map[date];
  save(STORAGE_KEYS.walkingCompletions, map);
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
