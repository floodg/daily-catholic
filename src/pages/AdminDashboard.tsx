import { useState } from 'react'
import { Link } from 'react-router-dom'
import AdminUserList from '../components/AdminUserList'
import AdminUserApproval from '../components/AdminUserApproval'
import { useAuth } from '../context/AuthProvider'
import '../app/app.css'

type AdminTab = 'users' | 'pending'

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = () => setRefreshKey(k => k + 1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', padding: '2rem' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div className="page-header-bar" style={{ marginBottom: '2rem' }}>
          <div>
            <div className="page-eyebrow">Administration</div>
            <h1 className="page-title">🛡 <em>Admin</em> Dashboard</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user?.email}</span>
            <Link to="/app/dashboard" className="btn-app-secondary">← Back to App</Link>
            <button className="btn-app-ghost" onClick={signOut}>Sign out</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            className={activeTab === 'users' ? 'btn-app-primary' : 'btn-app-secondary'}
            onClick={() => setActiveTab('users')}
          >
            All Users
          </button>
          <button
            className={activeTab === 'pending' ? 'btn-app-primary' : 'btn-app-secondary'}
            onClick={() => setActiveTab('pending')}
          >
            Pending Approvals
          </button>
        </div>

        <div className="app-card">
          <div className="app-card-body">
            {activeTab === 'users' && <AdminUserList key={refreshKey} onRefresh={handleRefresh} />}
            {activeTab === 'pending' && <AdminUserApproval key={refreshKey} />}
          </div>
        </div>
      </div>
    </div>
  )
}
