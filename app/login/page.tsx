'use client'

import { useState } from 'react'
import { createClient } from '../lib/supabase'
import RulesModal from '../../components/RulesModal'
import PasswordInput from '../../components/PasswordInput'

type Mode = 'login' | 'join'
type LoginMethod = 'magiclink' | 'password'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('magiclink')
  const [showRules, setShowRules] = useState(false)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  async function handleMagicLinkLogin() {
    setLoading(true)
    setError('')
    // shouldCreateUser: false — this is the LOG IN tab, for people who
    // already have an account. Without this, Supabase silently creates a
    // brand new account for any email typed here, with no username set at
    // all, completely bypassing the Join flow's required username/email.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    })
    if (error) {
      setError(
        error.message.toLowerCase().includes('signup')
          ? 'No account found with that email — use Join to create one.'
          : error.message
      )
    } else {
      setSubmitted(true)
    }
    setLoading(false)
  }

  async function handlePasswordLogin() {
    setLoading(true)
    setError('')

    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('display_name', username)
      .single()

    if (lookupError || !profile) {
      setError('Username not found')
      setLoading(false)
      return
    }

    const res = await fetch('/api/auth/username-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
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

    window.location.href = '/picks'
  }

  async function handleJoin() {
    setLoading(true)
    setError('')

    if (!username.trim()) { setError('Please choose a username'); setLoading(false); return }
    if (!email.trim()) { setError('Please enter your email'); setLoading(false); return }

    if (password) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

      if (signUpError) { setError(signUpError.message); setLoading(false); return }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ display_name: username.trim() })
          .eq('id', data.user.id)

        if (profileError) {
          setError(profileError.message.includes('unique') ? 'That username is already taken' : profileError.message)
          setLoading(false)
          return
        }
      }

      window.location.href = '/join'
    } else {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?pendingUsername=${encodeURIComponent(username.trim())}` },
      })

      if (otpError) { setError(otpError.message); setLoading(false); return }
      setSubmitted(true)
    }

    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
        <div className="pop-panel p-6 text-center" style={{ maxWidth: 420 }}>
          <h1 className="pop-hero pop-hero--blue text-3xl mb-4">Check your email</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)' }}>We sent a magic link to <strong style={{ color: 'var(--pop-white)' }}>{email}</strong></p>
          <p className="mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Click the link in the email to log in.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
      <div className="w-full" style={{ maxWidth: 420 }}>

        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="" className="w-24 h-auto" />
        </div>

        <div className="pop-panel p-5 sm:p-6">
          <h1 className="pop-hero pop-hero--pink text-3xl sm:text-4xl text-center mb-6">The Turnstile</h1>

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
              <div className="flex gap-2 mb-4 text-xs uppercase tracking-wider">
                <button
                  onClick={() => setLoginMethod('magiclink')}
                  className="flex-1 py-1.5 rounded-lg font-bold"
                  style={loginMethod === 'magiclink'
                    ? { border: '2px solid var(--pop-blue)', color: 'var(--pop-white)' }
                    : { border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }}
                >
                  Magic Link
                </button>
                <button
                  onClick={() => setLoginMethod('password')}
                  className="flex-1 py-1.5 rounded-lg font-bold"
                  style={loginMethod === 'password'
                    ? { border: '2px solid var(--pop-blue)', color: 'var(--pop-white)' }
                    : { border: '2px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)' }}
                >
                  Username + Password
                </button>
              </div>

              {loginMethod === 'magiclink' ? (
                <>
                  <input type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
                  <button onClick={handleMagicLinkLogin} disabled={loading || !email} className="pop-button w-full py-2.5 text-sm">
                    {loading ? 'Sending...' : 'Send magic link'}
                  </button>
                </>
              ) : (
                <>
                  <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
                  <PasswordInput placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
                  <button onClick={handlePasswordLogin} disabled={loading || !username || !password} className="pop-button w-full py-2.5 text-sm">
                    {loading ? 'Logging in...' : 'Log In'}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <input type="text" placeholder="Choose a username" value={username} onChange={e => setUsername(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
              <input type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
              <PasswordInput placeholder="Set a password (optional — 6 digit PIN works)" value={password} onChange={e => setPassword(e.target.value)} className="pop-input w-full p-2.5 mb-3 font-bold text-sm" />
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Set a password to log in instantly next time. Leave it blank to always use a magic link email instead.
              </p>
              <button onClick={handleJoin} disabled={loading || !username || !email} className="pop-button w-full py-2.5 text-sm">
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </>
          )}

          {error && <p className="pop-badge pop-badge--red px-2.5 py-1 text-xs mt-4 inline-block">{error}</p>}

          <button
            onClick={() => setShowRules(true)}
            className="pop-button pop-button--yellow w-full py-2.5 text-sm mt-6"
          >
            Read the Rules
          </button>
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}
