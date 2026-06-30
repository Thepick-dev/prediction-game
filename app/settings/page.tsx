'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [currentName, setCurrentName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }

    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    if (profile?.display_name) {
      setDisplayName(profile.display_name)
      setCurrentName(profile.display_name)
    }

    setLoading(false)
  }

  async function saveDisplayName() {
    if (!displayName.trim()) {
      setMessage('Please enter a display name')
      return
    }
    if (displayName.trim().length > 30) {
      setMessage('Display name must be 30 characters or fewer')
      return
    }

    setSaving(true)
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id)

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Display name saved')
      setCurrentName(displayName.trim())
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-500 text-sm mb-8">Logged in as {email}</p>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-1">Display Name</h2>
          <p className="text-sm text-gray-500 mb-4">
            {currentName ? `Currently shown as "${currentName}"` : 'Not set yet — your email is currently shown to other players'}
          </p>

          <input
            type="text"
            placeholder="e.g. Kit"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={30}
            className="w-full border rounded px-3 py-2 text-sm mb-3"
          />

          {message && (
            <p className={`text-sm mb-3 ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <button
            onClick={saveDisplayName}
            disabled={saving}
            className="w-full bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Display Name'}
          </button>
        </div>

        <a href="/" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-4">
          ← Back to home
        </a>
      </div>
    </main>
  )
}