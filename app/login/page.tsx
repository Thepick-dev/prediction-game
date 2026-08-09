'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '../lib/supabase'
import RulesModal from '../../components/RulesModal'
import PasswordInput from '../../components/PasswordInput'

type Mode = 'login' | 'join'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [showRules, setShowRules] = useState(false)

  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  async function handleLogin() {
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    })
    const data = await res.json()

    if (data.error) {
      setError(data.error)
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    // Re-checked on every login, not just right after signup — otherwise
    // a not-yet-approved user who's already been sent to /pending once
    // could freely browse the rest of the site on their next visit.
    const { data: { user: loggedInUser } } = await supabase.auth.getUser()
    if (loggedInUser) {
      const { data: profile } = await supabase.from('profiles').select('approved').eq('id', loggedInUser.id).single()
      if (profile && !profile.approved) {
        window.location.href = '/pending'
        return
      }
    }

    window.location.href = '/picks'
  }

  async function handleJoin() {
    setLoading(true)
    setError('')

    if (!username.trim()) { setError('Please choose a username'); setLoading(false); return }
    if (!email.trim()) { setError('Please enter your email'); setLoading(false); return }
    if (!password) { setError('Please set a password'); setLoading(false); return }
    if (password.length < 4) { setError('Password must be at least 4 characters'); setLoading(false); return }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    if (data.user) {
      // Server-side, service-role — see the route itself for why this
      // can't be a client-side .update() here (there may be no session
      // yet, and RLS would silently block it rather than error).
      const res = await fetch('/api/auth/complete-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, username: username.trim() }),
      })
      const completeData = await res.json()

      if (completeData.error) {
        setError(completeData.error)
        setLoading(false)
        return
      }
    }

    if (data.session) {
      // Normal path — the account is live immediately, just waiting on
      // admin approval.
      window.location.href = '/pending'
    } else {
      // Only reachable if the Supabase project still has "Confirm email"
      // switched on — there's no session yet until that link is clicked.
      setNeedsConfirmation(true)
    }

    setLoading(false)
  }

  if (needsConfirmation) {
    return (
      <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
        <div className="pop-panel p-6 text-center" style={{ maxWidth: 420 }}>
          <h1 className="pop-hero pop-hero--blue text-3xl mb-4">Confirm your email</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)' }}>We sent a confirmation link to <strong style={{ color: 'var(--pop-white)' }}>{email}</strong></p>
          <p className="mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Click it, then wait for an admin to approve your account before you can log in.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
      <div className="w-full" style={{ maxWidth: 420 }}>

        <div className="pop-panel p-5 sm:p-6">
          <h1 className="pop-hero pop-hero--pink text-3xl sm:text-4xl text-center mb-6 uppercase tracking-wide">LMS All-Stars</h1>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 py-2 text-sm font-black uppercase tracking-wider rounded-lg ${mode === 'login' ? 'pop-button' : ''}`}
              style={mode !== 'login' ? { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' } : undefined}
            >
              Log In
            </button>
            <button
              onClick={() => { setMode('join'); setError('') }}
              className={`flex-1 py-2 text-sm font-black uppercase tracking-wider rounded-lg ${mode === 'join' ? 'pop-button' : ''}`}
              style={mode !== 'join' ? { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' } : undefined}
            >
              Join
            </button>
          </div>

          {mode === 'login' ? (
            <>
              <input type="text" placeholder="Username or email" value={identifier} onChange={e => setIdentifier(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
              <PasswordInput placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" popArt />
              <button onClick={handleLogin} disabled={loading || !identifier || !password} className="pop-button w-full py-2.5 text-sm">
                {loading ? 'Logging in...' : 'Log In'}
              </button>
              <Link href="/reset-password" className="block text-center text-xs mt-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Forgot your password?
              </Link>
            </>
          ) : (
            <>
              <input type="text" placeholder="Choose a username" value={username} onChange={e => setUsername(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
              <input type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
              <PasswordInput placeholder="Set a password" value={password} onChange={e => setPassword(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" popArt />
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                An admin needs to approve your account before you can play — you&apos;ll be able to log in as soon as they do.
              </p>
              <button onClick={handleJoin} disabled={loading || !username || !email || !password} className="pop-button w-full py-2.5 text-sm">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </>
          )}

          {error && <p className="pop-badge pop-badge--red px-2.5 py-1 text-xs mt-4 inline-block">{error}</p>}

          <button
            onClick={() => setShowRules(true)}
            className="block w-full text-center text-xs mt-6"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Read the Rules
          </button>
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}
