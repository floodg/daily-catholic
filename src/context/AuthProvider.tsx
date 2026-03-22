import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Profile {
  has_completed_onboarding: boolean
  role: string
  approved: boolean
}

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  profile: Profile | null
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('has_completed_onboarding, role, approved')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('fetchProfile', error)
      setProfile(null)
      setProfileLoading(false)
      return
    }

    if (data === null) {
      // Auth user exists but no profile row (e.g. DB reset while a JWT was still in localStorage)
      await supabase.auth.signOut()
      setSession(null)
      setProfile(null)
      setProfileLoading(false)
      return
    }

    setProfile(data)
    setProfileLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await fetchProfile(session.user.id)
    }
  }, [session, fetchProfile])

  useEffect(() => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | null = null

    const run = async () => {
      // getSession() reads localStorage only — after `supabase db reset` a stale JWT can remain
      // until we validate with the auth server via getUser().
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (cancelled) return

      if (userError || !user) {
        await supabase.auth.signOut()
        setSession(null)
        setProfile(null)
      } else {
        const { data: { session: s } } = await supabase.auth.getSession()
        setSession(s)
        await fetchProfile(user.id)
      }

      setLoading(false)

      if (cancelled) return

      // Always subscribe (even when logged out) so sign-in / sign-out on this tab still updates state.
      const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'TOKEN_REFRESHED') return
        setSession(nextSession)
        if (nextSession?.user) {
          void fetchProfile(nextSession.user.id)
        } else {
          setProfile(null)
        }
      })
      subscription = data.subscription
    }

    void run()

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    profile,
    profileLoading,
    refreshProfile,
    signOut,
  }), [session, loading, profile, profileLoading, refreshProfile, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
