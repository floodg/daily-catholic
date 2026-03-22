import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  type DailyEntry,
  type CheckKey,
  getSectionsForDate,
  computeScore,
  emptyEntry,
  maxScoreForSections,
  toYoutubeEmbedUrl,
} from './fiatScoring'
import {
  fetchFiatRange,
  upsertFiatDay,
  toISODate,
  todayIso,
  startOfWeekMonday,
  addDays,
  entryFromRow,
  fiatDayRowFromEntry,
  type FiatDayRow,
} from '../../lib/fiatDaily'

const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function getPrompt() {
  const h = new Date().getHours()
  if (h < 9)  return '"Receive the day — Fiat."'
  if (h < 12) return '"Offer each hour back to Him."'
  if (h < 14) return '"Eat with order. Body follows soul."'
  if (h < 17) return '"Continue what remains. Nothing wasted."'
  if (h < 20) return '"Complete the day in His will."'
  return '"Review. Give thanks. Night Fiat."'
}

// ── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct   = score / max
  const r     = 54
  const circ  = 2 * Math.PI * r
  const dash  = pct * circ
  const color = pct >= 0.9 ? '#c9a84c' : pct >= 0.7 ? '#a8c4e0' : pct >= 0.5 ? '#8ab4a0' : '#9b8ec4'

  return (
    <svg width={128} height={128} viewBox="0 0 128 128" style={{ display: 'block' }}>
      <circle cx={64} cy={64} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
      <circle cx={64} cy={64} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 64 64)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={64} y={59} textAnchor="middle"
        fontFamily="'Cinzel', serif" fontSize={28} fontWeight="700" fill="white" letterSpacing="1">
        {score}
      </text>
      <text x={64} y={77} textAnchor="middle"
        fontFamily="'Crimson Text', serif" fontSize={12} fill="rgba(255,255,255,0.35)" letterSpacing="2">
        OF {max}
      </text>
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FiatModePage() {
  const initialDate = todayIso()
  const [viewDate, setViewDate] = useState(initialDate)
  const [entry, setEntry] = useState<DailyEntry>(() => emptyEntry(initialDate))
  const [fiatOn, setFiatOn] = useState(true)
  const [animatedIn, setAnimatedIn] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [weekData, setWeekData] = useState<Map<string, FiatDayRow>>(() => new Map())
  const [historyLoading, setHistoryLoading] = useState(true)
  const [videoModal, setVideoModal] = useState<{ title: string; embedUrl: string } | null>(null)

  const skipNextSave = useRef(true)
  const weekDataRef = useRef(weekData)
  weekDataRef.current = weekData

  const SECTIONS = useMemo(() => getSectionsForDate(viewDate), [viewDate])
  const MAX_SCORE = useMemo(() => maxScoreForSections(SECTIONS), [SECTIONS])
  const score = computeScore(entry, SECTIONS)

  const weekSlots = useMemo(() => {
    const mon = startOfWeekMonday(new Date())
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i)
      const iso = toISODate(d)
      const row = weekData.get(iso)
      const sections = getSectionsForDate(iso)
      const max = row?.max_score ?? maxScoreForSections(sections)
      const sc = row?.score ?? 0
      return { iso, label: WEEK_DAY_LABELS[i], max, score: sc }
    })
  }, [weekData])

  useEffect(() => {
    const t = setTimeout(() => setAnimatedIn(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!videoModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideoModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoModal])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setHistoryLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? null
      if (cancelled) return
      setUserId(uid)

      const mon = startOfWeekMonday(new Date())
      const sun = addDays(mon, 6)
      const map = await fetchFiatRange(uid, toISODate(mon), toISODate(sun))
      if (cancelled) return

      setWeekData(map)
      const today = todayIso()
      const next = entryFromRow(map.get(today), today)
      skipNextSave.current = true
      setViewDate(today)
      setEntry(next)
      setHistoryLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    const tid = setTimeout(() => {
      const sc = getSectionsForDate(entry.date)
      void upsertFiatDay(
        userId,
        { ...entry, date: entry.date },
        computeScore(entry, sc),
        maxScoreForSections(sc)
      )
      setWeekData(prev => {
        const next = new Map(prev)
        next.set(entry.date, fiatDayRowFromEntry({ ...entry, date: entry.date }))
        return next
      })
    }, 450)
    return () => clearTimeout(tid)
  }, [entry, userId])

  const handlePickDay = useCallback(async (iso: string) => {
    if (iso === viewDate) return
    await upsertFiatDay(userId, entry, computeScore(entry, SECTIONS), MAX_SCORE)
    const m = new Map(weekDataRef.current)
    m.set(entry.date, fiatDayRowFromEntry(entry))
    const dest = m.get(iso)
    skipNextSave.current = true
    setWeekData(m)
    setViewDate(iso)
    setEntry(entryFromRow(dest, iso))
  }, [viewDate, entry, userId, SECTIONS, MAX_SCORE])

  const toggle = useCallback((key: CheckKey) => {
    setEntry(prev => ({ ...prev, date: viewDate, [key]: !prev[key] }))
  }, [viewDate])

  return (
    <>
      <style>{`
        .fiat-page-inner {
          max-width: 560px;
          margin: 0 auto;
          padding: 0.5rem 0 4rem;
          position: relative;
        }

        @keyframes fiatFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .freveal { opacity: 0; }
        .freveal.in { animation: fiatFadeUp 0.5s ease both; }

        /* Header */
        .fiat-date-line {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.85rem;
          letter-spacing: 0.12em;
          color: rgba(201,168,76,0.6);
          text-align: center;
          margin-bottom: 0.25rem;
        }
        .fiat-heading {
          font-family: 'Cinzel Decorative', 'Cinzel', serif;
          font-size: 1.6rem;
          font-weight: 700;
          color: #e8e0d0;
          text-align: center;
          letter-spacing: 0.03em;
          margin: 0 0 0.25rem;
        }
        .fiat-tagline {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.85rem;
          color: rgba(232,224,208,0.35);
          text-align: center;
          letter-spacing: 0.06em;
          margin-bottom: 1.25rem;
        }

        /* Toggle */
        .ftoggle-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.875rem;
          margin: 0 0 1.25rem;
        }
        .ftoggle-label {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.3);
          transition: color 0.2s;
        }
        .ftoggle-label.on { color: #c9a84c; }

        .ftoggle-pill {
          width: 52px; height: 28px;
          border-radius: 100px;
          border: 1px solid rgba(201,168,76,0.2);
          background: rgba(201,168,76,0.04);
          cursor: pointer;
          position: relative;
          transition: all 0.3s;
        }
        .ftoggle-pill.active {
          border-color: rgba(201,168,76,0.5);
          background: rgba(201,168,76,0.12);
          box-shadow: 0 0 12px rgba(201,168,76,0.15);
        }
        .ftoggle-thumb {
          position: absolute;
          top: 3px; left: 3px;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          transition: all 0.3s;
        }
        .ftoggle-pill.active .ftoggle-thumb {
          left: 27px;
          background: #c9a84c;
        }

        /* Prompt */
        .fprompt {
          background: rgba(201,168,76,0.05);
          border: 1px solid rgba(201,168,76,0.15);
          border-left: 3px solid rgba(201,168,76,0.5);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin-bottom: 1.5rem;
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 1rem;
          color: rgba(232,208,163,0.75);
          text-align: center;
          letter-spacing: 0.02em;
        }

        /* Score area */
        .fscore-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .fscore-label {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.25);
          margin-top: 0.375rem;
        }

        /* Progress bar */
        .fprogress-track {
          height: 2px;
          background: rgba(255,255,255,0.05);
          border-radius: 100px;
          overflow: visible;
          margin-bottom: 0.375rem;
        }
        .fprogress-fill {
          height: 100%;
          border-radius: 100px;
          background: linear-gradient(90deg, #9b8ec4, #a8c4e0, #c9a84c);
          transform-origin: left;
          transition: transform 0.5s ease;
        }
        .fprogress-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .fprogress-tag {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.25);
        }
        .fprogress-num {
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: #c9a84c;
        }

        /* Section card */
        .fsection {
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          overflow: hidden;
          margin-bottom: 0.75rem;
          transition: border-color 0.2s;
        }
        .fsection.complete {
          border-color: rgba(201,168,76,0.2);
          background: rgba(201,168,76,0.02);
        }

        .fsection-hdr {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem 0.75rem;
        }
        .fsection-icon {
          font-size: 1rem;
          width: 28px;
          text-align: center;
          flex-shrink: 0;
        }
        .fsection-name {
          font-family: 'Cinzel', serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.8);
          flex: 1;
        }
        .fsection-sub {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.75rem;
          color: rgba(232,224,208,0.3);
          flex: 1;
          margin-top: 0.1rem;
        }
        .fsection-count {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.12em;
          color: rgba(232,224,208,0.25);
        }

        /* Check row */
        .fcheck {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 1rem 0.6rem 3.5rem;
          border-top: 1px solid rgba(255,255,255,0.03);
          cursor: pointer;
          transition: background 0.15s;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .fcheck:hover { background: rgba(255,255,255,0.025); }
        .fcheck:active { background: rgba(255,255,255,0.04); }

        .fcheck-box {
          width: 20px; height: 20px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.12);
          background: transparent;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          font-size: 0.7rem;
        }

        .fcheck-label {
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 1rem;
          color: rgba(232,224,208,0.5);
          flex: 1;
          line-height: 1.3;
          transition: color 0.2s;
        }
        .fcheck-label.on { color: rgba(232,224,208,0.85); }

        .fcheck-pts {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          color: rgba(201,168,76,0.25);
          transition: color 0.2s;
        }
        .fcheck-pts.on { color: rgba(201,168,76,0.65); }

        .fcheck-required {
          font-family: 'Cinzel', serif;
          font-size: 0.5rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(232,190,100,0.55);
          border: 1px solid rgba(201,168,76,0.25);
          border-radius: 4px;
          padding: 0.1em 0.45em;
          white-space: nowrap;
        }

        .fcheck-media-btn {
          flex-shrink: 0;
          font-family: 'Cinzel', serif;
          font-size: 0.5rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
          border: 1px solid rgba(201,168,76,0.35);
          background: rgba(201,168,76,0.08);
          color: rgba(201,168,76,0.85);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .fcheck-media-btn:hover {
          background: rgba(201,168,76,0.15);
          border-color: rgba(201,168,76,0.55);
        }

        .fvideo-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(5, 8, 14, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          animation: fiatFadeUp 0.25s ease both;
        }
        .fvideo-dialog {
          width: 100%;
          max-width: min(92vw, 720px);
          max-height: 90vh;
          overflow: auto;
          border-radius: 10px;
          border: 1px solid rgba(201,168,76,0.2);
          background: #0d1117;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .fvideo-dialog-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .fvideo-dialog-title {
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 0.95rem;
          color: rgba(232,224,208,0.9);
          margin: 0;
          line-height: 1.3;
        }
        .fvideo-close {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 6px;
          background: rgba(255,255,255,0.06);
          color: rgba(232,224,208,0.7);
          font-size: 1.25rem;
          line-height: 1;
          cursor: pointer;
        }
        .fvideo-close:hover { background: rgba(255,255,255,0.1); color: #e8e0d0; }
        .fvideo-frame-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
        }
        .fvideo-frame-wrap iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }

        /* Divider */
        .fdivider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 1.75rem 0;
          opacity: 0.3;
        }
        .fdivider::before, .fdivider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.5), transparent);
        }
        .fdivider-sym {
          font-size: 0.55rem;
          color: #c9a84c;
          letter-spacing: 0.3em;
          font-family: serif;
        }

        /* Weekly grid */
        .fweek {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
          padding: 1.25rem 1rem;
        }
        .fweek-title {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.25);
          text-align: center;
          margin-bottom: 1.25rem;
        }
        .fweek-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 0.375rem;
        }
        .fweek-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.375rem;
          cursor: pointer;
        }
        .fweek-day {
          font-family: 'Cinzel', serif;
          font-size: 0.5rem;
          letter-spacing: 0.08em;
          color: rgba(232,224,208,0.25);
          text-transform: uppercase;
        }
        .fweek-bar-wrap {
          height: 52px;
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
        }
        .fweek-bar {
          width: 100%;
          border-radius: 3px 3px 2px 2px;
          transition: height 0.4s ease;
          min-height: 3px;
        }
        .fweek-bar.sel {
          outline: 1.5px solid rgba(201,168,76,0.5);
          outline-offset: 2px;
        }
        .fweek-num {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          color: rgba(232,224,208,0.3);
          margin-top: 0.2rem;
          transition: color 0.2s;
        }
        .fweek-num.sel { color: #c9a84c; }

        .fhist-wrap {
          margin-top: 1.25rem;
          overflow-x: auto;
        }
        .fhist-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.06em;
        }
        .fhist-table th {
          text-align: left;
          text-transform: uppercase;
          color: rgba(232,224,208,0.25);
          padding: 0.5rem 0.35rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .fhist-table td {
          padding: 0.55rem 0.35rem;
          color: rgba(232,224,208,0.45);
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .fhist-table tr {
          cursor: pointer;
          transition: background 0.15s;
        }
        .fhist-table tr:hover td {
          background: rgba(255,255,255,0.02);
        }
        .fhist-table tr.sel td {
          color: rgba(232,224,208,0.85);
          background: rgba(201,168,76,0.06);
        }
        .fhist-table .fhist-pct {
          color: rgba(201,168,76,0.45);
        }
        .fhist-table tr.sel .fhist-pct { color: rgba(201,168,76,0.75); }
        .fhist-empty {
          text-align: center;
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.85rem;
          color: rgba(232,224,208,0.25);
          padding: 0.75rem;
        }

        /* Verse footer */
        .fverse {
          text-align: center;
          margin-top: 2.5rem;
          padding: 0 1rem;
          opacity: 0.3;
        }
        .fverse p {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.9rem;
          color: rgba(232,224,208,0.9);
          line-height: 1.7;
          letter-spacing: 0.02em;
          margin: 0 0 0.25rem;
        }
        .fverse span {
          font-family: 'Cinzel', serif;
          font-size: 0.5rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(201,168,76,0.8);
        }
      `}</style>

      <div className="fiat-page-inner">

        {/* Header */}
        <div className={`freveal ${animatedIn ? 'in' : ''}`} style={{ animationDelay: '0ms', textAlign: 'center', marginBottom: '1rem' }}>
          <div className="fiat-date-line">{formatDate(entry.date)}</div>
          <h2 className="fiat-heading">Fiat Mode</h2>
          <p className="fiat-tagline">Thy will be done</p>
        </div>

        {/* Toggle */}
        <div className={`ftoggle-row freveal ${animatedIn ? 'in' : ''}`} style={{ animationDelay: '60ms' }}>
          <span className={`ftoggle-label${!fiatOn ? ' on' : ''}`}>OFF</span>
          <button className={`ftoggle-pill${fiatOn ? ' active' : ''}`} onClick={() => setFiatOn(f => !f)} aria-label="Toggle Fiat Mode">
            <div className="ftoggle-thumb" />
          </button>
          <span className={`ftoggle-label${fiatOn ? ' on' : ''}`}>FIAT MODE</span>
        </div>

        {/* Prompt */}
        {fiatOn && (
          <div className={`fprompt freveal ${animatedIn ? 'in' : ''}`} style={{ animationDelay: '100ms' }}>
            {getPrompt()}
          </div>
        )}

        {/* Score ring */}
        <div className={`fscore-area freveal ${animatedIn ? 'in' : ''}`} style={{ animationDelay: '140ms' }}>
          <ScoreRing score={score} max={MAX_SCORE} />
          <div className="fscore-label">Daily Fidelity Score</div>
        </div>

        {/* Progress bar */}
        <div className="fprogress-track">
          <div className="fprogress-fill" style={{ transform: `scaleX(${score / MAX_SCORE})` }} />
        </div>
        <div className="fprogress-row">
          <span className="fprogress-tag">Fidelity</span>
          <span className="fprogress-num">{score} / {MAX_SCORE}</span>
        </div>

        {/* Sections */}
        {SECTIONS.map((sec, sIdx) => {
          const done = sec.checks.filter(c => entry[c.key]).length
          const total = sec.checks.length
          const allDone = done === total

          return (
            <div
              key={sec.id}
              className={`fsection freveal ${animatedIn ? 'in' : ''} ${allDone ? 'complete' : ''}`}
              style={{ animationDelay: `${180 + sIdx * 55}ms` }}
            >
              <div className="fsection-hdr">
                <div className="fsection-icon" style={{ color: sec.color }}>{sec.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="fsection-name" style={allDone ? { color: sec.color } : {}}>
                    {sec.title}
                  </div>
                  <div className="fsection-sub">{sec.subtitle}</div>
                </div>
                <div className="fsection-count">
                  {done}/{total}
                  {allDone && <span style={{ color: sec.color, marginLeft: '0.25rem' }}>✓</span>}
                </div>
              </div>

              {sec.checks.map(check => {
                const checked = entry[check.key]
                const media = check.media
                return (
                  <div
                    key={check.key}
                    className="fcheck"
                    onClick={() => toggle(check.key)}
                    role="checkbox"
                    aria-checked={checked}
                  >
                    <div
                      className="fcheck-box"
                      style={checked
                        ? { borderColor: sec.color, background: `${sec.color}22`, boxShadow: `0 0 6px ${sec.color}33` }
                        : {}}
                    >
                      {checked && <span style={{ color: sec.color }}>✓</span>}
                    </div>
                    <span className={`fcheck-label${checked ? ' on' : ''}`}>{check.label}</span>
                    {check.required && <span className="fcheck-required">Required</span>}
                    {media && (
                      <button
                        type="button"
                        className="fcheck-media-btn"
                        onClick={e => {
                          e.stopPropagation()
                          if (media.kind === 'youtube') {
                            const embed = toYoutubeEmbedUrl(media.url)
                            if (embed) {
                              setVideoModal({ title: check.label, embedUrl: embed })
                            } else {
                              window.open(media.url, '_blank', 'noopener,noreferrer')
                            }
                          } else {
                            window.open(media.url, '_blank', 'noopener,noreferrer')
                          }
                        }}
                        aria-label={
                          media.kind === 'youtube'
                            ? `Watch video: ${check.label}`
                            : `Open reading in new tab: ${check.label}`
                        }
                      >
                        {media.kind === 'youtube' ? 'Watch' : 'Read'}
                      </button>
                    )}
                    <span className={`fcheck-pts${checked ? ' on' : ''}`}>+{check.points}</span>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Sacred divider */}
        <div className="fdivider">
          <span className="fdivider-sym">✦ ✝ ✦</span>
        </div>

        {/* Weekly grid + history */}
        <div className={`fweek freveal ${animatedIn ? 'in' : ''}`} style={{ animationDelay: '580ms' }}>
          <div className="fweek-title">This Week · Fidelity</div>
          <div className="fweek-grid">
            {weekSlots.map(slot => {
              const ratio = slot.max > 0 ? slot.score / slot.max : 0
              const active = slot.iso === viewDate
              const col = ratio >= 0.9 ? '#c9a84c' : ratio >= 0.75 ? '#a8c4e0' : ratio >= 0.6 ? '#8ab4a0' : '#9b8ec4'
              const h = Math.max(3, Math.round(ratio * 52))
              return (
                <div key={slot.iso} className="fweek-col" onClick={() => void handlePickDay(slot.iso)}>
                  <div className="fweek-day">{slot.label}</div>
                  <div className="fweek-bar-wrap">
                    <div className={`fweek-bar${active ? ' sel' : ''}`}
                      style={{ height: `${h}px`, background: active ? col : `${col}55` }} />
                  </div>
                  <div className={`fweek-num${active ? ' sel' : ''}`}>{slot.score}</div>
                </div>
              )
            })}
          </div>

          <div className="fhist-wrap">
            {historyLoading ? (
              <div className="fhist-empty">Loading this week…</div>
            ) : (
              <table className="fhist-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Date</th>
                    <th>Score</th>
                    <th>Max</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {weekSlots.map(slot => {
                    const active = slot.iso === viewDate
                    const pct = slot.max > 0 ? Math.round((slot.score / slot.max) * 100) : 0
                    const shortDate = new Date(slot.iso + 'T12:00:00').toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'short',
                    })
                    return (
                      <tr
                        key={`row-${slot.iso}`}
                        className={active ? 'sel' : ''}
                        onClick={() => void handlePickDay(slot.iso)}
                      >
                        <td>{slot.label}</td>
                        <td>{shortDate}</td>
                        <td>{slot.score}</td>
                        <td>{slot.max}</td>
                        <td className="fhist-pct">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer verse */}
        <div className="fverse">
          <p>"Not I who live, but Christ who lives in me."</p>
          <span>Galatians 2:20</span>
        </div>
      </div>

      {videoModal && (
        <div
          className="fvideo-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fvideo-dialog-title"
          onClick={() => setVideoModal(null)}
        >
          <div className="fvideo-dialog" onClick={e => e.stopPropagation()}>
            <div className="fvideo-dialog-hdr">
              <h3 id="fvideo-dialog-title" className="fvideo-dialog-title">{videoModal.title}</h3>
              <button
                type="button"
                className="fvideo-close"
                onClick={() => setVideoModal(null)}
                aria-label="Close video"
              >
                ×
              </button>
            </div>
            <div className="fvideo-frame-wrap">
              <iframe
                title={videoModal.title}
                src={videoModal.embedUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
