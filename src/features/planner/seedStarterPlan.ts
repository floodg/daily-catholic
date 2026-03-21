import { supabase } from '../../lib/supabase';
import { formatDateLocal, getMondayLocal } from '../../lib/dateUtils';
import { importStarterMealsForUser } from '../meals/api';

// ─── Weekly schedule ──────────────────────────────────────────────────────────
// Slugs match starter_meals in DB (seed.sql). Monday = index 0 … Sunday = index 6.
// Lunch: Taco Bowl every day except Friday (Salmon Salad – no meat).
// Dinner: rotation; Friday seafood only.
interface DaySchedule {
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
  dinnerNotes?: string;
}

const WEEKLY_SCHEDULE: DaySchedule[] = [
  { breakfast: 'black-coffee-water', lunch: '250g-mince-taco-bowl', dinner: 'steak-greens',           snack: 'daily-targets' }, // Mon
  { breakfast: 'black-coffee-water', lunch: '250g-mince-taco-bowl', dinner: 'chicken-avocado-salad',  snack: 'daily-targets' }, // Tue
  { breakfast: 'black-coffee-water', lunch: '250g-mince-taco-bowl', dinner: 'mince-bowl',             snack: 'daily-targets' }, // Wed
  { breakfast: 'black-coffee-water', lunch: '250g-mince-taco-bowl', dinner: 'steak-greens',           snack: 'daily-targets' }, // Thu
  { breakfast: 'black-coffee-water', lunch: 'salmon-salad',         dinner: 'salmon-avocado-salad',   snack: 'daily-targets' }, // Fri – no meat
  { breakfast: 'black-coffee-water', lunch: '250g-mince-taco-bowl', dinner: 'mince-bowl',             snack: 'daily-targets' }, // Sat
  {
    breakfast: 'black-coffee-water',
    lunch: '250g-mince-taco-bowl',
    dinner: 'chicken-avocado-salad',
    snack: 'daily-targets',
    dinnerNotes: 'Keep structure, then return to plan next meal',
  }, // Sun
];

const ALL_PLAN_SLUGS = [
  ...new Set(WEEKLY_SCHEDULE.flatMap(d => [d.breakfast, d.lunch, d.dinner, d.snack])),
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Seeds a default Joe's Keto meal plan for a newly signed-up user,
 * covering the next month (4 weeks starting from Monday of the current week).
 *
 * - Idempotent: skips if the user already has any planned_meals rows.
 * - Reads meal definitions directly from starter_meals (no plan templates needed).
 * - Any starter meals the user didn't select during onboarding are imported
 *   automatically so the full plan can be built.
 */
export async function seedStarterPlan(userId: string): Promise<void> {
  // ── Idempotency check ────────────────────────────────────────────────────
  const { count, error: checkError } = await supabase
    .from('planned_meals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (checkError) throw checkError;
  if (count && count > 0) return;

  // ── Load the starter_meals needed for this plan ──────────────────────────
  const { data: starterMeals, error: smError } = await supabase
    .from('starter_meals')
    .select('id, slug')
    .in('slug', ALL_PLAN_SLUGS);

  if (smError) throw smError;
  if (!starterMeals?.length) return;

  const starterBySlug = new Map(starterMeals.map(sm => [sm.slug, sm.id as string]));
  const starterIds = starterMeals.map(sm => sm.id as string);

  // ── Find which the user already has imported ─────────────────────────────
  const { data: existingUserMeals, error: existingError } = await supabase
    .from('meals')
    .select('id, source_starter_meal_id')
    .eq('user_id', userId)
    .in('source_starter_meal_id', starterIds);

  if (existingError) throw existingError;

  const userMealByStarterId = new Map<string, string>(
    (existingUserMeals ?? [])
      .filter((m): m is { id: string; source_starter_meal_id: string } =>
        m.source_starter_meal_id != null
      )
      .map(m => [m.source_starter_meal_id, m.id])
  );

  // ── Import any missing starter meals ────────────────────────────────────
  const missingStarterIds = starterIds.filter(id => !userMealByStarterId.has(id));

  if (missingStarterIds.length > 0) {
    await importStarterMealsForUser(missingStarterIds, userId);

    const { data: newMeals, error: newError } = await supabase
      .from('meals')
      .select('id, source_starter_meal_id')
      .eq('user_id', userId)
      .in('source_starter_meal_id', missingStarterIds);

    if (newError) throw newError;

    for (const m of newMeals ?? []) {
      if (m.source_starter_meal_id) {
        userMealByStarterId.set(m.source_starter_meal_id as string, m.id as string);
      }
    }
  }

  // ── Build slug → user meal_id map ────────────────────────────────────────
  const mealIds: Record<string, string> = {};
  for (const [slug, starterId] of starterBySlug) {
    const userMealId = userMealByStarterId.get(starterId);
    if (userMealId) mealIds[slug] = userMealId;
  }

  // ── Build planned_meals rows for 4 weeks ─────────────────────────────────
  const monday = getMondayLocal(new Date());
  const WEEKS_TO_SEED = 4;

  const rows = Array.from({ length: WEEKS_TO_SEED }, (_, week) =>
    WEEKLY_SCHEDULE.flatMap((schedule, dayIndex) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + week * 7 + dayIndex);
      const dateStr = formatDateLocal(date);

      return [
        { meal_slot: 'breakfast', slug: schedule.breakfast, notes: null },
        { meal_slot: 'lunch',     slug: schedule.lunch,     notes: null },
        { meal_slot: 'dinner',    slug: schedule.dinner,    notes: schedule.dinnerNotes ?? null },
        { meal_slot: 'snack',     slug: schedule.snack,     notes: null },
      ]
        .filter(s => mealIds[s.slug])
        .map(s => ({
          user_id:      userId,
          meal_id:      mealIds[s.slug],
          planned_date: dateStr,
          meal_slot:    s.meal_slot,
          notes:        s.notes,
          servings:     1,
        }));
    })
  ).flat();

  const { error: insertError } = await supabase.from('planned_meals').insert(rows);
  if (insertError) throw insertError;
}
