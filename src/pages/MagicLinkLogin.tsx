import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './auth.css'

export default function MagicLinkLogin() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a login link')
    }

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back-link">← Back to site</Link>
      <div className="auth-card">
        <h1>✝ Daily Catholic</h1>
        <h2>Magic Link</h2>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        {!message && (
          <form onSubmit={handleMagicLink}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        )}

        {message && (
          <button
            type="button"
            className="auth-btn auth-btn-secondary"
            onClick={() => {
              setMessage(null)
            }}
          >
            Send another link
          </button>
        )}

        <p className="auth-link">
          <Link to="/login">Back to Log In</Link>
        </p>
      </div>
    </div>
  )
}
