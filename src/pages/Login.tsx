import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './auth.css'

type LoginLocationState = { from?: { pathname?: string } }

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath =
    (location.state as LoginLocationState | null)?.from?.pathname ?? '/app/fiat'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // After email confirmation or magic link, Supabase redirects here with tokens; send user into the app.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const dest = fromPath.startsWith('/') ? fromPath : '/app/fiat'
        navigate(dest, { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate, fromPath])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg =
        error.message === 'Invalid login credentials'
          ? 'Email or password is incorrect.'
          : error.message
      setError(msg)
      setLoading(false)
    } else {
      navigate(fromPath.startsWith('/') ? fromPath : '/app/fiat', { replace: true })
    }
  }

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back-link">← Back to site</Link>
      <div className="auth-card">
        <h1>✝ Daily Catholic</h1>
        <h2>Sign In</h2>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="auth-link">
          <Link to="/magic-link">Sign in with Magic Link</Link>
        </p>
        <p className="auth-link">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  )
}

