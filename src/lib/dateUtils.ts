/**
 * Local calendar date helpers for meal planning.
 * Use these when storing or looking up planned_date so that the user's
 * local day (e.g. Friday) consistently matches the same YYYY-MM-DD string.
 */

/**
 * Returns the Monday of the week containing `date` in local time.
 * Week is Monday–Sunday (ISO-style for display).
 */
export function getMondayLocal(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, …
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

/**
 * Returns YYYY-MM-DD for the date's local calendar day.
 * Use this (not toISOString().split('T')[0]) for planned_date so lookups
 * match the user's local day regardless of timezone.
 */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
