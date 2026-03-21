import { Link } from 'react-router-dom'

export default function MacrosPage() {
  return (
    <div>
      <div className="page-header-bar">
        <div>
          <div className="page-eyebrow">Mensura Corporis</div>
          <h1 className="page-title">My Macros</h1>
        </div>
      </div>
      <div className="app-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.6 }}>📊</div>
        <h2 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '0.85rem', fontWeight: 600,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'rgba(232,224,208,0.6)', margin: '0 0 0.75rem',
        }}>
          My Macros
        </h2>
        <p style={{
          fontFamily: "'Crimson Text', Georgia, serif",
          fontStyle: 'italic',
          color: 'var(--text-muted)', fontSize: '1rem',
          maxWidth: 400, margin: '0 auto 1.5rem', lineHeight: 1.7,
        }}>
          Set your protein, fat, and carb targets. Review daily totals and see how discipline in eating tracks over time.
        </p>
        <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/app/meals" className="btn-app-primary">Browse Meals</Link>
          <Link to="/app/plan" className="btn-app-primary">Weekly Plan</Link>
        </div>
      </div>
    </div>
  )
}
