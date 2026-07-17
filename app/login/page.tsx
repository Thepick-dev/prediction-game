'use client'

import { useState } from 'react'
import { createClient } from '../lib/supabase'
import HeroPage from '../../components/HeroPage'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <HeroPage>
      {submitted ? (
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Check your email</h1>
          <p>We sent a magic link to <strong>{email}</strong></p>
          <p className="mt-2 text-gray-500">Click the link in the email to log in.</p>
        </div>
      ) : (
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-6 text-center">The Turnstile</h1>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-4 py-2 mb-4"
          />
          <button
            onClick={handleLogin}
            disabled={loading || !email}
            className="w-full bg-black text-white rounded px-4 py-2"
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </div>
      )}
    </HeroPage>
  )
}