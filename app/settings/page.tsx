'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [currentName, setCurrentName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)
    setEmail(user.email ?? '')
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    if (profile?.display_name) {
      setDisplayName(profile.display_name)
      setCurrentName(profile.display_name)
    }
    setLoading(false)
  }

  async function saveDisplayName() {
    if (!displayName.trim()) { setMessage('Please enter a display name'); return }
    if (displayName.trim().length > 30) { setMessage('Max 30 characters'); return }
    setSaving(true)
    setMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id)
    if (error) { setMessage('Error: ' + error.message) }
    else { setMessage('Saved'); setCurrentName(displayName.trim()) }
    setSaving(false)
  }

  async function logOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <Shell active="SETTINGS">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  return (
    <Shell active="SETTINGS" user={user} displayName={currentName}>
      <HeroPage>
        <div className="w-full max-w-md">

          <h1 className="text-3xl font-bold mb-8">Settings</h1>

          <div className="space-y-6">

            <div className="bg-white border rounded-lg p-6">
              <h2 className="font-bold mb-1">Display Name</h2>
              <p className="text-sm text-gray-500 mb-4">
                {currentName ? `Currently shown as "${currentName}"` : 'Not set yet'}
              </p>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={30}
                className="w-full border rounded px-3 py-2 text-sm mb-3"
              />
              {message && (
                <p className={`text-sm mb-3 ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>
              )}
              <button
                onClick={saveDisplayName}
                disabled={saving}
                className="w-full bg-black text-white rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

            <div className="bg-white border rounded-lg p-6">
              <h2 className="font-bold mb-1">Account</h2>
              <p className="text-sm text-gray-500 mb-4">Logged in as {email}</p>
              <button
                onClick={logOut}
                className="w-full border rounded px-4 py-2 text-sm hover:border-black"
              >
                Log Out
              </button>
            </div>

          </div>

        </div>
      </HeroPage>
    </Shell>
  )
}