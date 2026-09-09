import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './auth.css'

function buildSignupRedirectTo() {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent('/app/fiat')}`
}

export default function Signup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: buildSignupRedirectTo(),
        data: {
          display_name: name.trim(),
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      navigate('/app/fiat', { replace: true })
      return
    }

    setMessage('Check your email to confirm your account. The link will finish signing you in.')
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back-link">← Back to site</Link>
      <div className="auth-card">
        <h1>✝ Daily Catholic</h1>
        <h2>Create Account</h2>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        {!message && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Display Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

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
              <label htmlFor="password">Password <span className="field-hint">(min. 6 characters)</span></label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Creating account…' : 'Sign Up'}
            </button>
          </form>
        )}

        {message && (
          <button
            type="button"
            className="auth-btn auth-btn-secondary"
            onClick={() => setMessage(null)}
          >
            Use another email
          </button>
        )}

        <p className="auth-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
        <p className="auth-link">
          Prefer email-only? <Link to="/magic-link">Send a magic link</Link>
        </p>
      </div>
    </div>
  )
}
