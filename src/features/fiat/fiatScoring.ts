// Fiat Mode scoring — shared by UI and persistence (weekly / future monthly views).

export interface DailyEntry {
  date: string
  gospel_read: boolean
  reflection: boolean
  eucharist: boolean
  sunday_mass: boolean
  rosary: boolean
  angelus_noon: boolean
  angelus_evening: boolean
  fiat_morning: boolean
  fiat_day: boolean
  fiat_night: boolean
  protein_target: boolean
  no_snacking: boolean
  training: boolean
  no_scrolling: boolean
  followed_structure: boolean
  examen: boolean
}

export type CheckKey = keyof Omit<DailyEntry, 'date'>

/** In-app modal (YouTube iframe) or new tab (e.g. Daily Gospel site). */
export type CheckMedia =
  | { kind: 'youtube'; url: string }
  | { kind: 'external'; url: string }

export interface FiatCheck {
  key: CheckKey
  label: string
  points: number
  required?: boolean
  sundayOnly?: boolean
  weekdayOnly?: boolean
  media?: CheckMedia
}

export interface Section {
  id: string
  icon: string
  title: string
  subtitle: string
  color: string
  checks: FiatCheck[]
}

/** Curated videos / links (full URLs as provided). */
export const FIAT_MEDIA = {
  prevenientAct:
    'https://youtu.be/5XlZdBPdH9c?si=5ERA8MmNM-JZa59v',
  rosary: {
    'Joyful Mysteries': 'https://youtu.be/bKgpFXhBBck?si=1d_VPwAtwr9Q8Y0l',
    'Sorrowful Mysteries': 'https://youtu.be/LBcqGtAyAns?si=aFsumnkBAWk7y_Vf',
    'Glorious Mysteries': 'https://youtu.be/udlX3eoulCk?si=swEgIKNGc8TfiCsP',
    'Luminous Mysteries': 'https://youtu.be/G48pm_t1N6M?si=49y312xCVy_ZdKB5',
  } as Record<string, string>,
  angelus: 'https://youtu.be/MwJg19DZW54?si=_Czo0C_GZdkiX-aL',
  dailyGospel: 'https://dailygospel.org/AM/gospel',
} as const

/** Parse youtu.be / youtube.com → embed URL (privacy-enhanced host). */
export function toYoutubeEmbedUrl(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl)
    let id: string | null = null
    if (u.hostname === 'youtu.be' || u.hostname === 'www.youtu.be') {
      id = u.pathname.replace(/^\//, '').split('/')[0] ?? null
    } else if (u.hostname.includes('youtube.com')) {
      id = u.searchParams.get('v')
      if (!id && u.pathname.startsWith('/embed/')) {
        id = u.pathname.slice('/embed/'.length).split('/')[0] ?? null
      }
    }
    if (!id || !/^[a-zA-Z0-9_-]{6,}$/.test(id)) return null
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0`
  } catch {
    return null
  }
}

const ALL_SECTIONS: Section[] = [
  {
    id: 'word',
    icon: '✦',
    title: 'Word of God',
    subtitle: 'Lectio Divina',
    color: '#c9a84c',
    checks: [
      {
        key: 'gospel_read',
        label: 'Daily Gospel read',
        points: 14,
        media: { kind: 'external', url: FIAT_MEDIA.dailyGospel },
      },
      { key: 'reflection', label: 'Daily Reflection complete', points: 13 },
    ],
  },
  {
    id: 'eucharist',
    icon: '✝',
    title: 'Eucharist',
    subtitle: 'Source & Summit',
    color: '#e8d5a3',
    checks: [
      { key: 'sunday_mass', label: 'Sunday Mass', points: 40, required: true, sundayOnly: true },
      { key: 'eucharist', label: 'Daily Mass (optional)', points: 40, weekdayOnly: true },
    ],
  },
  {
    id: 'fiat',
    icon: '🕊',
    title: 'Divine Will',
    subtitle: 'Fiat voluntas tua',
    color: '#a8c4e0',
    checks: [
      {
        key: 'fiat_morning',
        label: 'Morning Offering-The Prevenient Act',
        points: 20,
        media: { kind: 'youtube', url: FIAT_MEDIA.prevenientAct },
      },
      { key: 'fiat_day', label: 'Fusing in the Divine Will', points: 20 },
      { key: 'rosary', label: '__rosary__', points: 20 },
      {
        key: 'angelus_noon',
        label: 'Angelus · Noon',
        points: 5,
        media: { kind: 'youtube', url: FIAT_MEDIA.angelus },
      },
      {
        key: 'angelus_evening',
        label: 'Angelus · 6pm',
        points: 5,
        media: { kind: 'youtube', url: FIAT_MEDIA.angelus },
      },
    ],
  },
  {
    id: 'examen',
    icon: '☽',
    title: 'Examen',
    subtitle: "Review in God's presence",
    color: '#b87333',
    checks: [{ key: 'examen', label: 'Reviewed the day', points: 10 }],
  },
]

const ROSARY_MYSTERIES: Record<number, string> = {
  0: 'Glorious Mysteries',
  1: 'Joyful Mysteries',
  2: 'Sorrowful Mysteries',
  3: 'Glorious Mysteries',
  4: 'Luminous Mysteries',
  5: 'Sorrowful Mysteries',
  6: 'Joyful Mysteries',
}

export function getSections(isSunday: boolean, dayOfWeek: number): Section[] {
  const mystery = ROSARY_MYSTERIES[dayOfWeek]
  const rosaryUrl = FIAT_MEDIA.rosary[mystery]
  return ALL_SECTIONS.map(sec => ({
    ...sec,
    checks: sec.checks
      .filter(c => {
        if (c.sundayOnly && !isSunday) return false
        if (c.weekdayOnly && isSunday) return false
        return true
      })
      .map(c => {
        if (c.label !== '__rosary__') return c
        return {
          ...c,
          label: `Rosary · ${mystery}`,
          media: rosaryUrl ? { kind: 'youtube' as const, url: rosaryUrl } : undefined,
        }
      }),
  }))
}

/** Local calendar date → sections for that day (Mass options depend on Sunday). */
export function getSectionsForDate(isoDate: string): Section[] {
  const d = new Date(isoDate + 'T12:00:00')
  const dayOfWeek = d.getDay()
  const isSunday = dayOfWeek === 0
  return getSections(isSunday, dayOfWeek)
}

export function maxScoreForSections(sections: Section[]): number {
  return sections.flatMap(s => s.checks).reduce((sum, c) => sum + c.points, 0)
}

export function computeScore(entry: DailyEntry, sections: Section[]): number {
  return sections
    .flatMap(s => s.checks)
    .filter(c => entry[c.key])
    .reduce((sum, c) => sum + c.points, 0)
}

export function emptyEntry(date: string): DailyEntry {
  return {
    date,
    gospel_read: false,
    reflection: false,
    eucharist: false,
    sunday_mass: false,
    rosary: false,
    angelus_noon: false,
    angelus_evening: false,
    fiat_morning: false,
    fiat_day: false,
    fiat_night: false,
    protein_target: false,
    no_snacking: false,
    training: false,
    no_scrolling: false,
    followed_structure: false,
    examen: false,
  }
}

/** Merge stored JSON with defaults so old rows stay valid when keys are added. */
export function mergeEntryFromChecks(date: string, checks: unknown): DailyEntry {
  const base = emptyEntry(date)
  if (!checks || typeof checks !== 'object') return base
  const o = checks as Record<string, unknown>
  for (const k of Object.keys(base) as (keyof DailyEntry)[]) {
    if (k === 'date') continue
    if (k in o && typeof o[k as string] === 'boolean') {
      ;(base[k] as boolean) = o[k as string] as boolean
    }
  }
  return base
}
