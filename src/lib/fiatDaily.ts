import { supabase } from './supabase'
import type { DailyEntry } from '../features/fiat/fiatScoring'
import {
  mergeEntryFromChecks,
  computeScore,
  getSectionsForDate,
  maxScoreForSections,
} from '../features/fiat/fiatScoring'

export interface FiatDayRow {
  day: string
  checks: unknown
  score: number
  max_score: number
}

/** Week range for the signed-in user only (no localStorage). */
export async function fetchFiatRange(
  userId: string,
  startIso: string,
  endIso: string
): Promise<Map<string, FiatDayRow>> {
  const map = new Map<string, FiatDayRow>()
  const { data, error } = await supabase
    .from('fiat_daily_entries')
    .select('day, checks, score, max_score')
    .eq('user_id', userId)
    .gte('day', startIso)
    .lte('day', endIso)

  if (error) {
    console.error('fetchFiatRange', error)
    return map
  }
  for (const row of data ?? []) {
    const d = row.day as string
    map.set(d, {
      day: d,
      checks: row.checks,
      score: row.score ?? 0,
      max_score: row.max_score ?? 0,
    })
  }
  return map
}

export async function upsertFiatDay(
  userId: string,
  entry: DailyEntry,
  score: number,
  maxScore: number
): Promise<{ error: Error | null }> {
  const checks: Record<string, boolean> = {}
  for (const k of Object.keys(entry) as (keyof DailyEntry)[]) {
    if (k === 'date') continue
    checks[k as string] = entry[k] as boolean
  }

  const { error } = await supabase.from('fiat_daily_entries').upsert(
    {
      user_id: userId,
      day: entry.date,
      checks,
      score,
      max_score: maxScore,
    },
    { onConflict: 'user_id,day' }
  )
  if (error) {
    console.error('upsertFiatDay', error)
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayIso(): string {
  return toISODate(new Date())
}

export function fiatDayRowFromEntry(entry: DailyEntry): FiatDayRow {
  const sections = getSectionsForDate(entry.date)
  const checks: Record<string, boolean> = {}
  for (const k of Object.keys(entry) as (keyof DailyEntry)[]) {
    if (k === 'date') continue
    checks[k as string] = entry[k] as boolean
  }
  return {
    day: entry.date,
    checks,
    score: computeScore(entry, sections),
    max_score: maxScoreForSections(sections),
  }
}

/** Monday = first column (index 0), Sunday = last (index 6). */
export function startOfWeekMonday(from: Date): Date {
  const copy = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const dow = copy.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  copy.setDate(copy.getDate() + diff)
  return copy
}

export function weekDayIndexMonFirst(d: Date): number {
  const dow = d.getDay()
  return dow === 0 ? 6 : dow - 1
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function entryFromRow(row: FiatDayRow | undefined, date: string): DailyEntry {
  if (!row) return mergeEntryFromChecks(date, null)
  return mergeEntryFromChecks(date, row.checks)
}
