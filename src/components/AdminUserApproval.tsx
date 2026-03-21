import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AdminUser } from './AdminUserList'

const PENDING_SELECT = 'id, email, display_name, role, approved, created_at, approved_at'

export default function AdminUserApproval() {
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  const applyResult = useCallback(
    (data: AdminUser[] | null, err: { message: string } | null) => {
      if (err) setError(err.message)
      else setPendingUsers(data ?? [])
      setLoading(false)
    },
    [],
  )

  const fetchPending = useCallback(() => {
    setLoading(true)
    setError(null)
    supabase
      .from('profiles')
      .select(PENDING_SELECT)
      .eq('approved', false)
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => applyResult(data, err))
  }, [applyResult])

  useEffect(() => {
    supabase
      .from('profiles')
      .select(PENDING_SELECT)
      .eq('approved', false)
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => applyResult(data, err))
  }, [applyResult])

  const handleApprove = async (userId: string) => {
    setActionUserId(userId)
    const { error: err } = await supabase
      .from('profiles')
      .update({ approved: true })
      .eq('id', userId)
    if (err) {
      setError(err.message)
    } else {
      fetchPending()
    }
    setActionUserId(null)
  }

  const handleReject = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return
    setActionUserId(userId)
    const { error: err } = await supabase.from('profiles').delete().eq('id', userId)
    if (err) {
      setError(err.message)
    } else {
      fetchPending()
    }
    setActionUserId(null)
  }

  if (loading) return <p className="admin-loading">Checking for pending users…</p>
  if (error) return <p className="admin-error">Error: {error}</p>
  if (pendingUsers.length === 0)
    return <p className="admin-empty">No pending users requiring approval.</p>

  return (
    <div className="admin-approval">
      <h2>Pending Approvals ({pendingUsers.length})</h2>
      {pendingUsers.map(user => (
        <div key={user.id} className="approval-card">
          <div className="approval-info">
            <strong>{user.email}</strong>
            {user.display_name && <span> ({user.display_name})</span>}
            <span className="approval-date">
              {' '}· Signed up {new Date(user.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="admin-actions">
            <button
              className="admin-btn admin-btn-approve"
              disabled={actionUserId === user.id}
              onClick={() => handleApprove(user.id)}
            >
              Approve
            </button>
            <button
              className="admin-btn admin-btn-delete"
              disabled={actionUserId === user.id}
              onClick={() => handleReject(user.id)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
