// Domain types for Joe's Keto

export type MeasurementUnitCode = "g" | "kg" | "ml" | "l" | "units" | "tsp" | "tbsp" | "cup";

/** Catalog item kind: food for meals; household for cleaning/hardware/etc. */
export type IngredientKind = "food" | "household";

export interface StoreProduct {
  id: string;
  name: string;
  brand?: string;
  sizeLabel?: string;
  store: string;
  productUrl: string | null;
  imageUrl?: string;
  createdAt: string;
}

export interface MealIngredientProduct {
  id: string;
  name: string;
  brand?: string;
  sizeLabel?: string;
  store: string;
  productUrl: string | null;
  imageUrl?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  /** Legacy free-text quantity label (e.g. "1 cup", "to taste"). */
  quantity?: string;
  /** Structured numeric quantity per meal usage (nullable for legacy rows). */
  quantityNum?: number;
  /** Unit for structured quantity. */
  unit?: MeasurementUnitCode;
  store?: string;
  notes?: string;
  /** Ingredient-level flags from the global catalog */
  optional?: boolean;
  pantryStaple?: boolean;
  kind?: IngredientKind;
  /** Primary linked store product */
  primaryProduct?: MealIngredientProduct;
  /** Alternative product options */
  productOptions?: MealIngredientProduct[];
}

export interface Meal {
  id: string;
  name: string;
  tags?: string[];
  ingredients: Ingredient[];
  instructions: string[];
  prepTimeMins?: number;
  cookTimeMins?: number;
  /** Set when the meal was imported from a starter meal template */
  sourceStarterMealId?: string;
  /** True when created via the Create with AI meals flow */
  createdViaAi?: boolean;
}

export interface StarterMeal {
  id: string;
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  prepTimeMins?: number;
  cookTimeMins?: number;
  instructions: string[];
  ingredients: Ingredient[];
}

export type MealTime = "breakfast" | "lunch" | "dinner" | "snack";

export type MealStatus = "planned" | "completed" | "skipped";

export interface PlannedMeal {
  id: string;
  date: string; // YYYY-MM-DD
  time: MealTime;
  mealId: string;
  /** Number of servings planned; inventory deductions are multiplied by this value. Defaults to 1. */
  servings: number;
  notes?: string;
  status: MealStatus;
}

export interface Exercise {
  id: string;
  name: string;
  sets?: number;
  reps?: string;
  load?: string;
  notes?: string;
}

export interface Workout {
  id: string;
  name: string;
  exercises: Exercise[];
}

export interface PlannedWorkout {
  id: string;
  date: string; // YYYY-MM-DD
  workoutId: string;
  time?: string;
  notes?: string;
  /** Plan status tracking for workouts */
  status?: WorkoutStatus;
  /** Optional per-exercise progression log captured when completing the workout */
  progress?: WorkoutProgress;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  store?: string;
  checked?: boolean;
  manual?: boolean; // true if manually added, false if from meal plan
}

export interface ProgramContent {
  daily_structure?: {
    morning?: string;
    lunch?: string;
    dinner?: string;
    protein_target?: string;
  };
  weekly_structure?: {
    fast_days?: number;
    standard_days?: number;
    description?: string;
  };
  walking?: {
    frequency?: string;
    duration?: string;
  };
  strength_training?: {
    days?: number;
    schedule?: string[];
    exercises?: string[];
  };
}

export interface Program {
  id: string;
  title: string;
  description?: string;
  category?: string;
  content?: ProgramContent;
  createdAt: string;
}

// ─── Workouts progression & status ─────────────────────────────────────────────

export type WorkoutStatus = "planned" | "completed" | "skipped";

export interface WorkoutProgressEntry {
  /** Reference to the exercise in the workout definition */
  exerciseId: string;
  /** Number of sets completed (optional summary, not per-set granularity) */
  setsCompleted?: number;
  /** Heaviest/top set reps achieved (optional quick log) */
  topSetReps?: number;
  /** Heaviest/top set load achieved, free text for flexibility (e.g. "22.5kg x 2") */
  topSetWeight?: string;
  /** Freeform note for this exercise entry */
  notes?: string;
}

export interface WorkoutProgress {
  plannedWorkoutId: string;
  /** ISO timestamp of when this log was saved */
  performedAt: string;
  entries: WorkoutProgressEntry[];
}

export interface UserProgram {
  id: string;
  userId: string;
  programId: string;
  program?: Program;
  createdAt: string;
}

export type InventoryTransactionType = 'purchase' | 'meal_consumption' | 'waste' | 'manual_adjustment';

export interface InventoryTransaction {
  id: string;
  userId: string;
  ingredientName: string;
  quantityDelta: number;
  unit?: string;
  transactionType: InventoryTransactionType;
  sourceType?: string;
  sourceId?: string;
  occurredAt: string;
  createdAt: string;
}

export interface ShoppingTripItem {
  id: string;
  shoppingTripId: string;
  productName: string;
  quantityPurchased: number;
  packQuantity?: number;
  packUnit?: string;
  /** Store product this item was sourced from (set when added via "Add from Meal") */
  storeProductId?: string;
  /** Canonical ingredient name for inventory matching (e.g. "beef mince"). Falls back to productName in the DB trigger when absent. */
  ingredientName?: string;
  createdAt: string;
}

export interface ShoppingTrip {
  id: string;
  userId: string;
  store: string;
  purchasedAt: string; // ISO timestamptz
  notes?: string;
  createdAt: string;
  /** Null while the trip is still being shopped. Set by a DB trigger once every linked trip item has a checked shopping_list row. */
  completedAt?: string;
  items: ShoppingTripItem[];
}
