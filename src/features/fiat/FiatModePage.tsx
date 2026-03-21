import { useState, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyEntry {
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

type CheckKey = keyof Omit<DailyEntry, 'date'>

interface Section {
  id: string
  icon: string
  title: string
  subtitle: string
  color: string
  checks: { key: CheckKey; label: string; points: number; required?: boolean; sundayOnly?: boolean; weekdayOnly?: boolean }[]
}

// ── Config ────────────────────────────────────────────────────────────────────

const ALL_SECTIONS: Section[] = [
  {
    id: 'word', icon: '✦', title: 'Word of God', subtitle: 'Lectio Divina',
    color: '#c9a84c',
    checks: [
      { key: 'gospel_read', label: 'Daily Gospel read',         points: 8 },
      { key: 'reflection',  label: 'Daily Reflection complete', points: 7 },
    ],
  },
  {
    id: 'eucharist', icon: '✝', title: 'Eucharist', subtitle: 'Source & Summit',
    color: '#e8d5a3',
    checks: [
      { key: 'sunday_mass', label: 'Sunday Mass', points: 25, required: true, sundayOnly: true },
      { key: 'eucharist',   label: 'Daily Mass (optional)',  points: 12, weekdayOnly: true },
    ],
  },
  {
    id: 'fiat', icon: '🕊', title: 'Divine Will', subtitle: 'Fiat voluntas tua',
    color: '#a8c4e0',
    checks: [
      { key: 'fiat_morning', label: 'Morning Offering-The Prevenient Act', points: 9 },
      { key: 'fiat_day',     label: 'Fusing in the Divine Will',           points: 8 },
      { key: 'fiat_night',   label: 'Night Offering-The Consecration Act', points: 8 },
      { key: 'rosary',          label: '__rosary__',       points: 10 },
      { key: 'angelus_noon',    label: 'Angelus · Noon',   points: 5 },
      { key: 'angelus_evening', label: 'Angelus · 6pm',    points: 5 },
    ],
  },
  {
    id: 'body', icon: '⚔', title: 'Body Discipline', subtitle: 'Temple of the Spirit',
    color: '#8ab4a0',
    checks: [
      { key: 'protein_target', label: 'Protein target hit',    points: 7 },
      { key: 'no_snacking',    label: 'No snacking',           points: 6 },
      { key: 'training',       label: 'Walk / Lift completed', points: 7 },
    ],
  },
  {
    id: 'order', icon: '◈', title: 'Order', subtitle: 'Ordo vitae',
    color: '#9b8ec4',
    checks: [
      { key: 'no_scrolling',       label: 'No mindless scrolling', points: 5 },
      { key: 'followed_structure', label: 'Followed structure',     points: 5 },
    ],
  },
  {
    id: 'examen', icon: '☽', title: 'Examen', subtitle: "Review in God's presence",
    color: '#b87333',
    checks: [
      { key: 'examen', label: 'Reviewed the day', points: 10 },
    ],
  },
]

const ROSARY_MYSTERIES: Record<number, string> = {
  0: 'Glorious Mysteries',   // Sunday
  1: 'Joyful Mysteries',     // Monday
  2: 'Sorrowful Mysteries',  // Tuesday
  3: 'Glorious Mysteries',   // Wednesday
  4: 'Luminous Mysteries',   // Thursday
  5: 'Sorrowful Mysteries',  // Friday
  6: 'Joyful Mysteries',     // Saturday
}

function getSections(isSunday: boolean, dayOfWeek: number): Section[] {
  const mystery = ROSARY_MYSTERIES[dayOfWeek]
  return ALL_SECTIONS.map(sec => ({
    ...sec,
    checks: sec.checks
      .filter(c => {
        if (c.sundayOnly  && !isSunday) return false
        if (c.weekdayOnly &&  isSunday) return false
        return true
      })
      .map(c => c.label === '__rosary__' ? { ...c, label: `Rosary · ${mystery}` } : c),
  }))
}

const WEEK_SCORES = [85, 92, 78, 100, 88, 70, 95]
const WEEK_DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function emptyEntry(date: string): DailyEntry {
  return {
    date,
    gospel_read: false, reflection: false,
    eucharist: false, sunday_mass: false,
    rosary: false,
    angelus_noon: false, angelus_evening: false,
    fiat_morning: false, fiat_day: false, fiat_night: false,
    protein_target: false, no_snacking: false, training: false,
    no_scrolling: false, followed_structure: false,
    examen: false,
  }
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

function computeScore(entry: DailyEntry, sections: Section[]) {
  return sections.flatMap(s => s.checks)
    .filter(c => entry[c.key])
    .reduce((sum, c) => sum + c.points, 0)
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
  const [entry, setEntry]             = useState<DailyEntry>(emptyEntry(today()))
  const [fiatOn, setFiatOn]           = useState(true)
  const [activeWeekDay, setActiveWeekDay] = useState(3)
  const [animatedIn, setAnimatedIn]   = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimatedIn(true), 60)
    return () => clearTimeout(t)
  }, [])

  const dayOfWeek = new Date().getDay()
  const isSunday  = dayOfWeek === 0
  const SECTIONS  = getSections(isSunday, dayOfWeek)
  const MAX_SCORE = SECTIONS.flatMap(s => s.checks).reduce((sum, c) => sum + c.points, 0)
  const score     = computeScore(entry, SECTIONS)

  function toggle(key: CheckKey) {
    setEntry(prev => ({ ...prev, [key]: !prev[key] }))
  }

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

        {/* Weekly grid */}
        <div className={`fweek freveal ${animatedIn ? 'in' : ''}`} style={{ animationDelay: '580ms' }}>
          <div className="fweek-title">This Week · Fidelity</div>
          <div className="fweek-grid">
            {WEEK_DAYS.map((day, i) => {
              const s = i === 3 ? score : WEEK_SCORES[i]
              const active = i === activeWeekDay
              const col = s >= 90 ? '#c9a84c' : s >= 75 ? '#a8c4e0' : s >= 60 ? '#8ab4a0' : '#9b8ec4'
              const h = Math.round((s / 100) * 52)
              return (
                <div key={day} className="fweek-col" onClick={() => setActiveWeekDay(i)}>
                  <div className="fweek-day">{day}</div>
                  <div className="fweek-bar-wrap">
                    <div className={`fweek-bar${active ? ' sel' : ''}`}
                      style={{ height: `${h}px`, background: active ? col : `${col}55` }} />
                  </div>
                  <div className={`fweek-num${active ? ' sel' : ''}`}>{s}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer verse */}
        <div className="fverse">
          <p>"Not I who live, but Christ who lives in me."</p>
          <span>Galatians 2:20</span>
        </div>
      </div>
    </>
  )
}
