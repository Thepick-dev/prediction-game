'use client'

import { useState } from 'react'
import { createClient } from '../lib/supabase'
import HeroPage from '../../components/HeroPage'
import RulesModal from '../../components/RulesModal'

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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setSubmitted(true)
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
      <HeroPage>
        <div className="text-center text-[#F5ECD9]">
          <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Check your email</h1>
          <p>We sent a magic link to <strong>{email}</strong></p>
          <p className="mt-2 text-[#F5ECD9]/60">Click the link in the email to log in.</p>
        </div>
      </HeroPage>
    )
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded px-4 py-2 mb-3 text-[#F5ECD9] placeholder:text-[#F5ECD9]/40"

  return (
    <HeroPage>
      <div className="w-full text-[#F5ECD9]">
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>The Turnstile</h1>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setMode('login'); setError('') }}
            className="flex-1 py-2 text-sm font-bold uppercase tracking-wider rounded"
            style={mode === 'login' ? { backgroundColor: '#D9A441', color: '#241a12' } : { backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(245,236,217,0.5)' }}
          >
            Log In
          </button>
          <button
            onClick={() => { setMode('join'); setError('') }}
            className="flex-1 py-2 text-sm font-bold uppercase tracking-wider rounded"
            style={mode === 'join' ? { backgroundColor: '#D9A441', color: '#241a12' } : { backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(245,236,217,0.5)' }}
          >
            Join
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <div className="flex gap-2 mb-4 text-xs uppercase tracking-wider">
              <button
                onClick={() => setLoginMethod('magiclink')}
                className={`flex-1 py-1.5 rounded border ${loginMethod === 'magiclink' ? 'border-[#D9A441] font-bold' : 'border-white/10 text-[#F5ECD9]/40'}`}
              >
                Magic Link
              </button>
              <button
                onClick={() => setLoginMethod('password')}
                className={`flex-1 py-1.5 rounded border ${loginMethod === 'password' ? 'border-[#D9A441] font-bold' : 'border-white/10 text-[#F5ECD9]/40'}`}
              >
                Username + Password
              </button>
            </div>

            {loginMethod === 'magiclink' ? (
              <>
                <input type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                <button onClick={handleMagicLinkLogin} disabled={loading || !email} className="w-full rounded px-4 py-2 font-bold" style={{ backgroundColor: '#D9A441', color: '#241a12' }}>
                  {loading ? 'Sending...' : 'Send magic link'}
                </button>
              </>
            ) : (
              <>
                <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className={inputClass} />
                <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
                <button onClick={handlePasswordLogin} disabled={loading || !username || !password} className="w-full rounded px-4 py-2 font-bold" style={{ backgroundColor: '#D9A441', color: '#241a12' }}>
                  {loading ? 'Logging in...' : 'Log In'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <input type="text" placeholder="Choose a username" value={username} onChange={e => setUsername(e.target.value)} className={inputClass} />
            <input type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            <input type="password" placeholder="Set a password (optional — 6 digit PIN works)" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
            <p className="text-xs text-[#F5ECD9]/50 mb-4">
              Set a password to log in instantly next time. Leave it blank to always use a magic link email instead.
            </p>
            <button onClick={handleJoin} disabled={loading || !username || !email} className="w-full rounded px-4 py-2 font-bold" style={{ backgroundColor: '#D9A441', color: '#241a12' }}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </>
        )}

        {error && <p className="text-sm text-red-400 mt-4 text-center">{error}</p>}

        <button
          onClick={() => setShowRules(true)}
          className="w-full text-center text-sm font-bold border-2 rounded px-4 py-2.5 mt-6 uppercase tracking-wider"
          style={{ borderColor: '#D9A441', color: '#D9A441' }}
        >
          📋 Read the Rules
        </button>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </HeroPage>
  )
}