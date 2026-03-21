// Local storage wrapper with versioning and safety

export const STORAGE_VERSION = 1;
export const STORAGE_VERSION_KEY = "jk_version";

export const STORAGE_KEYS = {
  meals: "jk_meals",
  plannedMeals: "jk_plannedMeals",
  workouts: "jk_workouts",
  plannedWorkouts: "jk_plannedWorkouts",
  shoppingManualItems: "jk_shoppingManualItems",
} as const;

/**
 * Load data from localStorage with fallback
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return fallback;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error loading ${key} from localStorage:`, error);
    return fallback;
  }
}

/**
 * Save data to localStorage
 */
export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving ${key} to localStorage:`, error);
  }
}

/**
 * Check if storage has been initialized
 */
export function isInitialized(): boolean {
  const version = localStorage.getItem(STORAGE_VERSION_KEY);
  return version !== null;
}

/**
 * Mark storage as initialized
 */
export function markInitialized(): void {
  localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
}

/**
 * Migration placeholder for future version updates
 */
export function migrate(): void {
  const currentVersion = load<number>(STORAGE_VERSION_KEY, 0);
  
  if (currentVersion < STORAGE_VERSION) {
    // Add migration logic here when needed
    console.log(`Migrating from version ${currentVersion} to ${STORAGE_VERSION}`);
    markInitialized();
  }
}
