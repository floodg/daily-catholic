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

const LS_PREFIX = 'fiat_daily_v1'

function lsKey(userKey: string, isoDate: string) {
  return `${LS_PREFIX}:${userKey}:${isoDate}`
}

export async function fetchFiatRange(
  userId: string | null,
  startIso: string,
  endIso: string
): Promise<Map<string, FiatDayRow>> {
  const map = new Map<string, FiatDayRow>()

  if (userId) {
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

  // Signed-out: localStorage by date
  const start = new Date(startIso + 'T12:00:00')
  const end = new Date(endIso + 'T12:00:00')
  for (let x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) {
    const iso = toISODate(x)
    const raw = localStorage.getItem(lsKey('anon', iso))
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as FiatDayRow
      map.set(iso, { ...parsed, day: iso })
    } catch {
      /* ignore */
    }
  }
  return map
}

export async function upsertFiatDay(
  userId: string | null,
  entry: DailyEntry,
  score: number,
  maxScore: number
): Promise<void> {
  const checks: Record<string, boolean> = {}
  for (const k of Object.keys(entry) as (keyof DailyEntry)[]) {
    if (k === 'date') continue
    checks[k as string] = entry[k] as boolean
  }

  if (userId) {
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
    if (error) console.error('upsertFiatDay', error)
    return
  }

  try {
    localStorage.setItem(
      lsKey('anon', entry.date),
      JSON.stringify({
        day: entry.date,
        checks,
        score,
        max_score: maxScore,
      } satisfies FiatDayRow)
    )
  } catch (e) {
    console.error('upsertFiatDay localStorage', e)
  }
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
