import { useAuth } from '../../context/AuthProvider'

export default function AccountDetailsPage() {
  const { user, profileLoading, profile } = useAuth()

  if (profileLoading) {
    return <div className="onboarding-loading">Loading account details…</div>
  }

  if (!user || !profile) {
    return (
      <div className="onboarding-page">
        <div className="page-header-bar">
          <h1 className="page-title">Account</h1>
          <p className="onboarding-subtitle">No account details found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="onboarding-page">
      <div className="page-header-bar">
        <h1 className="page-title">👤 Account</h1>
        <p className="onboarding-subtitle">Your account details and onboarding status.</p>
      </div>

      <div className="app-card" style={{ padding: '1rem 1.25rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <div className="app-card-title" style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              Email
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--parchment)' }}>
              {user.email ?? '—'}
            </div>
          </div>

          <div>
            <div className="app-card-title" style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              User ID
            </div>
            <div style={{ fontFamily: 'DM Sans, monospace', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {user.id}
            </div>
          </div>

          <div>
            <div className="app-card-title" style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              Role
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--parchment)' }}>
              {profile.role}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <div className="app-card-title" style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                Approval
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--parchment)' }}>
                {profile.approved ? 'Approved' : 'Pending'}
              </div>
            </div>
            <div>
              <div className="app-card-title" style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                Onboarding
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--parchment)' }}>
                {profile.has_completed_onboarding ? 'Completed' : 'Not completed'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

