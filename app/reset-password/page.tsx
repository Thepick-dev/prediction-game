'use client'

import { useState } from 'react'
import Link from 'next/link'
import PasswordInput from '../../components/PasswordInput'

type Mode = 'request' | 'code'

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<Mode>('request')

  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  async function submitRequest() {
    setLoading(true)
    setError('')
    await fetch('/api/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    // Always the same response regardless of what was found — see the
    // route itself for why.
    setRequestSent(true)
    setLoading(false)
  }

  async function submitCode() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/reset-with-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword }),
    })
    const data = await res.json()
    if (data.error) {
      setError(data.error)
      setLoading(false)
      return
    }
    setResetDone(true)
    setLoading(false)
  }

  if (resetDone) {
    return (
      <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
        <div className="pop-panel p-6 text-center" style={{ maxWidth: 420 }}>
          <h1 className="pop-hero pop-hero--blue text-3xl mb-4">Password reset</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)' }}>Your password&apos;s been changed — you can log in with it now.</p>
          <Link href="/login" className="pop-button w-full py-2.5 text-sm mt-6 inline-block">
            Go to Log In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
      <div className="w-full" style={{ maxWidth: 420 }}>
        <div className="pop-panel p-5 sm:p-6">
          <h1 className="pop-hero pop-hero--pink text-3xl text-center mb-6 uppercase tracking-wide">Reset Password</h1>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setMode('request'); setError('') }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg ${mode === 'request' ? 'pop-button' : ''}`}
              style={mode !== 'request' ? { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' } : undefined}
            >
              Request a code
            </button>
            <button
              onClick={() => { setMode('code'); setError('') }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg ${mode === 'code' ? 'pop-button' : ''}`}
              style={mode !== 'code' ? { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' } : undefined}
            >
              I have a code
            </button>
          </div>

          {mode === 'request' ? (
            requestSent ? (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
                If that account exists, it&apos;s been logged for the admin to check — there&apos;s no automatic
                email. They&apos;ll be in touch directly with a one-time code — once you have it, come back
                and use the &quot;I have a code&quot; tab above.
              </p>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Enter your username or email. There&apos;s no automatic email — the admin checks these
                  requests manually and will contact you directly with a reset code.
                </p>
                <input
                  type="text" placeholder="Username or email" value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  className="pop-input w-full p-2.5 mb-3 font-bold text-sm"
                />
                <button onClick={submitRequest} disabled={loading || !identifier} className="pop-button w-full py-2.5 text-sm">
                  {loading ? 'Sending...' : 'Request a code'}
                </button>
              </>
            )
          ) : (
            <>
              <input
                type="text" placeholder="Username or email" value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="pop-input w-full p-2.5 mb-3 font-bold text-sm"
              />
              <input
                type="text" placeholder="Reset code" value={code}
                onChange={e => setCode(e.target.value)}
                className="pop-input w-full p-2.5 mb-3 font-bold text-sm uppercase"
              />
              <PasswordInput
                placeholder="New password" value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="pop-input w-full p-2.5 mb-3 font-bold text-sm"
              />
              <button
                onClick={submitCode}
                disabled={loading || !identifier || !code || !newPassword}
                className="pop-button w-full py-2.5 text-sm"
              >
                {loading ? 'Resetting...' : 'Set new password'}
              </button>
            </>
          )}

          {error && <p className="pop-badge pop-badge--red px-2.5 py-1 text-xs mt-4 inline-block">{error}</p>}

          <Link href="/login" className="block text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Back to Log In
          </Link>
        </div>
      </div>
    </div>
  )
}
