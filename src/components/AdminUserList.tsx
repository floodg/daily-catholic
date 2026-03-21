import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface AdminUser {
  id: string
  email: string
  display_name: string | null
  role: string
  approved: boolean
  created_at: string
  approved_at: string | null
}

interface AdminUserListProps {
  onRefresh?: () => void
}

const USER_SELECT = 'id, email, display_name, role, approved, created_at, approved_at'

export default function AdminUserList({ onRefresh }: AdminUserListProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  const applyResult = useCallback(
    (data: AdminUser[] | null, err: { message: string } | null) => {
      if (err) setError(err.message)
      else setUsers(data ?? [])
      setLoading(false)
    },
    [],
  )

  const fetchUsers = useCallback(() => {
    setLoading(true)
    setError(null)
    supabase
      .from('profiles')
      .select(USER_SELECT)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => applyResult(data, err))
  }, [applyResult])

  useEffect(() => {
    supabase
      .from('profiles')
      .select(USER_SELECT)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => applyResult(data, err))
  }, [applyResult])

  const updateUser = async (userId: string, updates: Partial<AdminUser>) => {
    setActionUserId(userId)
    const { error: err } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
    if (err) {
      setError(err.message)
    } else {
      fetchUsers()
      onRefresh?.()
    }
    setActionUserId(null)
  }

  const handleApprove = (userId: string) =>
    updateUser(userId, { approved: true })

  const handleSuspend = (userId: string) =>
    updateUser(userId, { approved: false })

  const handlePromoteToAdmin = (userId: string) =>
    updateUser(userId, { role: 'admin' })

  const handleDemoteToUser = (userId: string) =>
    updateUser(userId, { role: 'user' })

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This cannot be undone.')) return
    setActionUserId(userId)
    const { error: err } = await supabase.from('profiles').delete().eq('id', userId)
    if (err) {
      setError(err.message)
    } else {
      fetchUsers()
      onRefresh?.()
    }
    setActionUserId(null)
  }

  if (loading) return <p className="admin-loading">Loading users…</p>
  if (error) return <p className="admin-error">Error: {error}</p>

  return (
    <div className="admin-user-list">
      <div className="admin-section-header">
        <h2>Users ({users.length})</h2>
        <button className="admin-btn admin-btn-secondary" onClick={fetchUsers}>
          Refresh
        </button>
      </div>

      {users.length === 0 ? (
        <p className="admin-empty">No users found.</p>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Approved</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={!user.approved ? 'row-suspended' : ''}>
                  <td>{user.email}</td>
                  <td>{user.display_name ?? '—'}</td>
                  <td>
                    <span className={`badge badge-${user.role}`}>{user.role}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${user.approved ? 'approved' : 'suspended'}`}>
                      {user.approved ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="admin-actions">
                    {!user.approved && (
                      <button
                        className="admin-btn admin-btn-approve"
                        disabled={actionUserId === user.id}
                        onClick={() => handleApprove(user.id)}
                      >
                        Approve
                      </button>
                    )}
                    {user.approved && (
                      <button
                        className="admin-btn admin-btn-suspend"
                        disabled={actionUserId === user.id}
                        onClick={() => handleSuspend(user.id)}
                      >
                        Suspend
                      </button>
                    )}
                    {user.role !== 'admin' && (
                      <button
                        className="admin-btn admin-btn-promote"
                        disabled={actionUserId === user.id}
                        onClick={() => handlePromoteToAdmin(user.id)}
                      >
                        Make Admin
                      </button>
                    )}
                    {user.role === 'admin' && (
                      <button
                        className="admin-btn admin-btn-demote"
                        disabled={actionUserId === user.id}
                        onClick={() => handleDemoteToUser(user.id)}
                      >
                        Remove Admin
                      </button>
                    )}
                    <button
                      className="admin-btn admin-btn-delete"
                      disabled={actionUserId === user.id}
                      onClick={() => handleDelete(user.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
