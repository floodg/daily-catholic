import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './auth.css'

function getSafeNextPath(value: string | null) {
  if (!value) return '/app/fiat'

  try {
    const decoded = decodeURIComponent(value)
    return decoded.startsWith('/app') ? decoded : '/app/fiat'
  } catch {
    return value.startsWith('/app') ? value : '/app/fiat'
  }
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return getSafeNextPath(params.get('next'))
  }, [])

  useEffect(() => {
    let cancelled = false

    const completeAuth = async () => {
      const params = new URLSearchParams(window.location.search)
      const authError = params.get('error_description') || params.get('error')

      if (authError) {
        setError(authError)
        return
      }

      const code = params.get('code')

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (exchangeError) throw exchangeError
        }

        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!data.session) {
          throw new Error('The sign-in link was invalid or has expired. Please request a new magic link.')
        }

        if (!cancelled) {
          navigate(nextPath, { replace: true })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to complete sign in.')
        }
      }
    }

    void completeAuth()

    return () => {
      cancelled = true
    }
  }, [navigate, nextPath])

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back-link">← Back to site</Link>
      <div className="auth-card">
        <h1>✝ Daily Catholic</h1>
        <h2>Completing sign in…</h2>

        {error ? (
          <>
            <div className="auth-error">{error}</div>
            <p className="auth-link">
              <Link to="/magic-link">Request a new magic link</Link>
            </p>
            <p className="auth-link">
              <Link to="/login">Back to Log In</Link>
            </p>
          </>
        ) : (
          <p className="auth-muted">Please wait while we securely sign you in.</p>
        )}
      </div>
    </div>
  )
}
