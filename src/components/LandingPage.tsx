import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthProvider'
import {
  getFidelityLandingWeekdayRows,
  getSundayMassFidelityPoints,
} from '../features/fiat/fiatScoring'

const PILLARS = [
  {
    icon: '✝',
    title: 'Soul',
    subtitle: 'Word · Eucharist · Examen',
    desc: 'Daily Scripture, Mass attendance, and an evening review of conscience — the three anchors of interior life.',
    color: '#c9a84c',
  },
  {
    icon: '🕊',
    title: 'Divine Will',
    subtitle: 'Fiat voluntas tua',
    desc: 'Morning and evening Fiat offerings. Unite every ordinary act to God\'s will — inspired by Luisa Piccarreta and the Ascent of Mt Carmel.',
    color: '#a8c4e0',
  },
  {
    icon: '⚔',
    title: 'Body',
    subtitle: 'Temple of the Spirit',
    desc: 'Ketogenic discipline, daily training, and ordered eating. The body serves the soul — not the other way around.',
    color: '#8ab4a0',
  },
  {
    icon: '◈',
    title: 'Order',
    subtitle: 'Ordo vitae',
    desc: 'Structure, silence, and intentional time. No mindless scrolling. A life built on the Rule, not the algorithm.',
    color: '#9b8ec4',
  },
]

const VERSES = [
  { text: '"Thy will be done on earth as it is in heaven."', ref: 'Matthew 6:10' },
  { text: '"Not I who live, but Christ who lives in me."', ref: 'Galatians 2:20' },
  { text: '"Nada, nada, nada — and even on the Mountain, nothing."', ref: 'St John of the Cross' },
  { text: '"Receive the day as a gift and return it as an offering."', ref: 'Fiat spirituality' },
]

const LANDING_FIDELITY = (() => {
  const rows = getFidelityLandingWeekdayRows()
  const weekdayMax = rows.reduce((s, r) => s + r.points, 0)
  const sundayMassPts = getSundayMassFidelityPoints()
  return {
    rows,
    weekdayMax,
    sundayMassPts,
    sundayMax: weekdayMax + sundayMassPts,
  }
})()

export default function LandingPage() {
  const { session, loading: authLoading } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [verseIdx, setVerseIdx] = useState(0)

  // Until auth finishes bootstrapping (getUser), assume logged out so CTAs go to /login, not /app/fiat.
  const authed = !authLoading && !!session
  const fiatHref = authed ? '/app/fiat' : '/login'
  const fiatLinkState = authed ? undefined : { from: { pathname: '/app/fiat' } }
  const dashboardHref = authed ? '/app/dashboard' : '/login'
  const dashboardLinkState = authed ? undefined : { from: { pathname: '/app/dashboard' } }

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setVerseIdx(i => (i + 1) % VERSES.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <style>{`
        .land-page {
          min-height: 100vh;
          background: #0d1117;
          color: #e8e0d0;
          font-family: 'Crimson Text', Georgia, serif;
          overflow-x: hidden;
        }

        /* Radial atmosphere */
        .land-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 70% 50% at 50% -10%, rgba(201,168,76,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 40% 60% at 90% 80%, rgba(155,142,196,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 5%  60%, rgba(168,196,224,0.05) 0%, transparent 55%);
        }

        /* Cross watermark */
        .land-cross {
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          font-size: 700px;
          line-height: 1;
          color: rgba(255,255,255,0.013);
          pointer-events: none;
          z-index: 0;
          font-family: serif;
          user-select: none;
        }

        .land-inner { position: relative; z-index: 1; }

        /* Nav */
        .land-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 3rem;
          border-bottom: 1px solid rgba(201,168,76,0.08);
        }
        .land-nav-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-decoration: none;
        }
        .land-nav-icon {
          width: 36px; height: 36px;
          background: rgba(201,168,76,0.1);
          border: 1px solid rgba(201,168,76,0.3);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          color: #c9a84c;
        }
        .land-nav-title {
          font-family: 'Cinzel', serif;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #e8e0d0;
          text-transform: uppercase;
        }
        .land-nav-sub {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.7rem;
          color: rgba(201,168,76,0.55);
        }
        .land-nav-links {
          display: flex;
          gap: 2rem;
          align-items: center;
        }
        .land-nav-link {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.45);
          text-decoration: none;
          transition: color 0.2s;
        }
        .land-nav-link:hover { color: rgba(201,168,76,0.9); }

        /* Hero */
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 6rem 2rem 4rem;
          max-width: 760px;
          margin: 0 auto;
        }

        .hero-eyebrow {
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(201,168,76,0.6);
          margin-bottom: 1.5rem;
          opacity: 0;
          animation: fadeSlide 0.6s 0.1s ease both;
        }

        .hero-title {
          font-family: 'Cinzel Decorative', 'Cinzel', serif;
          font-size: clamp(2.2rem, 6vw, 4rem);
          font-weight: 700;
          color: #e8e0d0;
          line-height: 1.1;
          letter-spacing: 0.02em;
          margin: 0 0 0.5rem;
          opacity: 0;
          animation: fadeSlide 0.6s 0.2s ease both;
        }

        .hero-title-gold {
          color: #c9a84c;
          display: block;
        }

        .hero-subtitle {
          font-family: 'Cinzel', serif;
          font-size: 0.75rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.3);
          margin: 0.5rem 0 2.5rem;
          opacity: 0;
          animation: fadeSlide 0.6s 0.3s ease both;
        }

        .hero-desc {
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 1.2rem;
          line-height: 1.75;
          color: rgba(232,224,208,0.6);
          max-width: 560px;
          margin: 0 0 3rem;
          opacity: 0;
          animation: fadeSlide 0.6s 0.4s ease both;
        }

        .hero-cta-row {
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
          opacity: 0;
          animation: fadeSlide 0.6s 0.5s ease both;
        }

        .cta-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(201,168,76,0.15);
          color: #c9a84c;
          border: 1px solid rgba(201,168,76,0.5);
          font-family: 'Cinzel', serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 0.875rem 2rem;
          border-radius: 100px;
          text-decoration: none;
          transition: all 0.25s;
          cursor: pointer;
        }
        .cta-primary:hover {
          background: rgba(201,168,76,0.25);
          border-color: rgba(201,168,76,0.8);
          box-shadow: 0 0 24px rgba(201,168,76,0.2);
          transform: translateY(-2px);
        }

        .cta-secondary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          color: rgba(232,224,208,0.5);
          border: 1px solid rgba(255,255,255,0.08);
          font-family: 'Cinzel', serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 0.875rem 2rem;
          border-radius: 100px;
          text-decoration: none;
          transition: all 0.25s;
        }
        .cta-secondary:hover {
          color: rgba(232,224,208,0.85);
          border-color: rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.03);
        }

        /* Rotating verse */
        .verse-band {
          border-top: 1px solid rgba(201,168,76,0.08);
          border-bottom: 1px solid rgba(201,168,76,0.08);
          padding: 1.5rem 2rem;
          text-align: center;
          margin: 2rem 0;
          min-height: 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.375rem;
        }
        .verse-text {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 1.05rem;
          color: rgba(232,208,163,0.65);
          letter-spacing: 0.02em;
          line-height: 1.5;
          transition: opacity 0.5s;
        }
        .verse-ref {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(201,168,76,0.4);
        }

        /* Pillars section */
        .pillars-section {
          padding: 5rem 2rem;
          max-width: 1100px;
          margin: 0 auto;
        }
        .pillars-eyebrow {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: rgba(201,168,76,0.5);
          text-align: center;
          margin-bottom: 0.75rem;
        }
        .pillars-title {
          font-family: 'Cinzel Decorative', 'Cinzel', serif;
          font-size: clamp(1.5rem, 3vw, 2.25rem);
          font-weight: 700;
          color: #e8e0d0;
          text-align: center;
          margin: 0 0 3rem;
          letter-spacing: 0.03em;
        }
        .pillars-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.25rem;
        }
        .pillar-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 1.75rem 1.5rem;
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
        }
        .pillar-card:hover {
          border-color: rgba(201,168,76,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          transform: translateY(-3px);
        }
        .pillar-icon {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          display: block;
        }
        .pillar-title {
          font-family: 'Cinzel', serif;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 0.25rem;
        }
        .pillar-sub {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.8rem;
          color: rgba(232,224,208,0.35);
          margin-bottom: 0.875rem;
        }
        .pillar-desc {
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 0.95rem;
          line-height: 1.7;
          color: rgba(232,224,208,0.5);
        }

        /* Score preview */
        .score-section {
          padding: 5rem 2rem;
          max-width: 700px;
          margin: 0 auto;
          text-align: center;
        }
        .score-breakdown-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          max-width: 480px;
          margin: 0 auto 0.75rem;
        }
        .score-breakdown-label {
          flex: 0 0 7.5rem;
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 0.95rem;
          color: rgba(232,224,208,0.55);
          text-align: left;
        }
        .score-breakdown-track {
          flex: 1;
          min-width: 0;
          height: 6px;
          border-radius: 100px;
          background: rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .score-breakdown-fill {
          height: 100%;
          border-radius: 100px;
          opacity: 0.7;
        }
        .score-breakdown-pts {
          flex: 0 0 1.75rem;
          font-family: 'Cinzel', serif;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-align: right;
        }
        .score-rings-row {
          display: flex;
          justify-content: center;
          gap: 2rem;
          flex-wrap: wrap;
          margin: 3rem 0;
        }
        .score-ring-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .score-ring-label {
          font-family: 'Cinzel', serif;
          font-size: 0.55rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(232,224,208,0.3);
        }

        /* Footer */
        .land-footer {
          border-top: 1px solid rgba(201,168,76,0.08);
          padding: 2rem 3rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .footer-text {
          font-family: 'Crimson Text', Georgia, serif;
          font-style: italic;
          font-size: 0.85rem;
          color: rgba(232,224,208,0.25);
        }
        .footer-cross {
          font-family: 'Cinzel', serif;
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(201,168,76,0.3);
        }

        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          .land-nav { padding: 1.25rem 1.5rem; }
          .land-nav-links { display: none; }
          .hero { padding: 4rem 1.5rem 3rem; }
          .land-footer { padding: 1.5rem; }
        }
      `}</style>

      <div className="land-page">
        <div className="land-bg" />
        <div className="land-cross" aria-hidden="true">✝</div>

        <div className="land-inner">
          {/* Nav */}
          <nav className="land-nav">
            <Link to="/" className="land-nav-brand">
              <div className="land-nav-icon">✝</div>
              <div>
                <div className="land-nav-title">Daily Catholic</div>
                <div className="land-nav-sub">Fiat Mode</div>
              </div>
            </Link>
            <div className="land-nav-links">
              <a href="#pillars" className="land-nav-link">Rule of Life</a>
              <a href="#score"   className="land-nav-link">Fidelity Score</a>
              <Link to={fiatHref} state={fiatLinkState} className="land-nav-link" style={{ color: 'rgba(201,168,76,0.7)' }}>
                Enter App
              </Link>
            </div>
            <Link to={fiatHref} state={fiatLinkState} className="cta-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.6rem' }}>
              Fiat →
            </Link>
          </nav>

          {/* Hero */}
          <section className="hero">
            <div className="hero-eyebrow">A Rule of Life for Body, Soul &amp; Will</div>
            <h1 className="hero-title">
              Daily Catholic
              <span className="hero-title-gold">Fiat Mode</span>
            </h1>
            <p className="hero-subtitle">Thy will be done · On earth as in heaven</p>
            <p className="hero-desc">
              Not just a wellness app. A daily operating system aligned to the
              Divine Will — tracking fidelity, not calories. Built for the
              soul that wants to live fully surrendered.
            </p>
            <div className="hero-cta-row">
              <Link to={fiatHref} state={fiatLinkState} className="cta-primary">
                🕊 Begin Fiat Mode
              </Link>
              <Link to={dashboardHref} state={dashboardLinkState} className="cta-secondary">
                View Dashboard
              </Link>
            </div>
          </section>

          {/* Rotating verse */}
          <div className="verse-band">
            <p className="verse-text">{VERSES[verseIdx].text}</p>
            <span className="verse-ref">{VERSES[verseIdx].ref}</span>
          </div>

          {/* Four Pillars */}
          <section className="pillars-section" id="pillars">
            <div className="pillars-eyebrow">The Foundation</div>
            <h2 className="pillars-title">Four Pillars of the Rule</h2>
            <div className="pillars-grid">
              {PILLARS.map(p => (
                <div key={p.title} className="pillar-card"
                  style={{ borderColor: mounted ? `${p.color}18` : undefined }}>
                  <span className="pillar-icon" style={{ color: p.color }}>{p.icon}</span>
                  <div className="pillar-title" style={{ color: p.color }}>{p.title}</div>
                  <div className="pillar-sub">{p.subtitle}</div>
                  <p className="pillar-desc">{p.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Score preview */}
          <section className="score-section" id="score">
            <div className="pillars-eyebrow">The Measure</div>
            <h2 className="pillars-title">Fidelity Score • 0–{LANDING_FIDELITY.weekdayMax}</h2>
            <p style={{
              fontFamily: 'Crimson Text, Georgia, serif',
              fontSize: '1.1rem', lineHeight: 1.75,
              color: 'rgba(232,224,208,0.5)',
              maxWidth: 520, margin: '0 auto 3rem',
            }}>
              Each day is scored on your Rule — not on willpower or
              productivity, but on faithfulness to what you said you would do.
              Simple. Honest. Repeatable.
            </p>

            {/* Same non-bonus section weights as Fiat Mode (typical weekday). */}
            {LANDING_FIDELITY.rows.map(row => (
              <div key={row.label} className="score-breakdown-row">
                <span className="score-breakdown-label">{row.label}</span>
                <div className="score-breakdown-track">
                  <div
                    className="score-breakdown-fill"
                    style={{
                      width: `${(row.points / LANDING_FIDELITY.weekdayMax) * 100}%`,
                      background: row.color,
                    }}
                  />
                </div>
                <span className="score-breakdown-pts" style={{ color: row.color }}>
                  {row.points}
                </span>
              </div>
            ))}
            <p style={{
              fontFamily: 'Crimson Text, Georgia, serif',
              fontSize: '0.95rem', lineHeight: 1.65,
              color: 'rgba(232,224,208,0.38)',
              maxWidth: 520, margin: '1.25rem auto 0',
            }}>
              On Sundays, Sunday Mass adds up to {LANDING_FIDELITY.sundayMassPts} fidelity points (daily max{' '}
              {LANDING_FIDELITY.sundayMax}). Optional weekday Daily Mass can add bonus points in the app, on top of this cap.
            </p>

            <div style={{ marginTop: '3rem' }}>
              <Link to={fiatHref} state={fiatLinkState} className="cta-primary" style={{ margin: '0 auto' }}>
                🕊 Open Fiat Mode
              </Link>
            </div>
          </section>

          {/* Footer */}
          <footer className="land-footer">
            <p className="footer-text">
              "Receive the day as a gift — return it as an offering."
            </p>
            <span className="footer-cross">✝ Daily Catholic · Fiat Mode</span>
          </footer>
        </div>
      </div>
    </>
  )
}
