'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import KitEditor from '../../components/KitEditor'
import PasswordInput from '../../components/PasswordInput'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [currentName, setCurrentName] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [tierLocked, setTierLocked] = useState<boolean | null>(null)
  const [hasTierPicks, setHasTierPicks] = useState(false)

  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const [nameMessage, setNameMessage] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)
    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setCurrentName(profile.display_name ?? '')
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('id')
      .eq('status', 'active')
      .single()

    if (comp) {
      const { data: tierPicks } = await supabase
        .from('tier_draft_picks')
        .select('locked')
        .eq('competition_id', comp.id)
        .eq('user_id', user.id)
        .single()

      if (tierPicks) {
        setHasTierPicks(true)
        setTierLocked(tierPicks.locked ?? false)
      } else {
        setHasTierPicks(false)
        setTierLocked(false)
      }
    }

    setLoading(false)
  }

  async function saveDisplayName() {
    if (!displayName.trim()) { setNameMessage('Please enter a username'); return }
    if (displayName.trim().length > 30) { setNameMessage('Max 30 characters'); return }
    setSavingName(true)
    setNameMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id)

    if (error) {
      setNameMessage(error.message.includes('unique') ? 'That username is already taken' : error.message)
    } else {
      setNameMessage('Saved')
      setCurrentName(displayName.trim())
    }
    setSavingName(false)
  }

  async function saveEmail() {
    if (!email.trim()) { setEmailMessage('Please enter an email'); return }
    setSavingEmail(true)
    setEmailMessage('')

    const { error } = await supabase.auth.updateUser({ email: email.trim() })

    if (error) {
      setEmailMessage(error.message)
    } else {
      setEmailMessage('Check your new email address to confirm the change')
    }
    setSavingEmail(false)
  }

  async function savePassword() {
    if (newPassword.length < 4) { setPasswordMessage('Password must be at least 4 characters'); return }
    setSavingPassword(true)
    setPasswordMessage('')

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordMessage(error.message)
    } else {
      setPasswordMessage('Password updated')
      setNewPassword('')
    }
    setSavingPassword(false)
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

  const cardClass = "bg-white/5 border border-white/10 rounded-lg p-6"
  const labelClass = "font-bold mb-1 text-[#D9A441]"
  const subClass = "text-sm text-[#F5ECD9]/60 mb-4"
  const inputClass = "w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm mb-3 text-[#F5ECD9] placeholder:text-[#F5ECD9]/40"
  const btnClass = "w-full rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
  const btnStyle = { backgroundColor: '#D9A441', color: '#241a12' }

  return (
    <Shell active="SETTINGS" user={user} displayName={currentName}>
      <HeroPage>
        <div className="w-full text-[#F5ECD9]">

          <h1 className="text-3xl font-bold mb-8" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Settings</h1>

          <div className="space-y-6">

            <div className={cardClass}>
              <h2 className={labelClass}>Username</h2>
              <p className={subClass}>
                {currentName ? `Currently shown as "${currentName}"` : 'Not set yet'}
              </p>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={30}
                className={inputClass}
              />
              {nameMessage && (
                <p className={`text-sm mb-3 ${nameMessage.startsWith('Saved') ? 'text-green-400' : 'text-red-400'}`}>{nameMessage}</p>
              )}
              <button onClick={saveDisplayName} disabled={savingName} className={btnClass} style={btnStyle}>
                {savingName ? 'Saving...' : 'Save Username'}
              </button>
            </div>

            <div className={cardClass}>
              <h2 className={labelClass}>Email</h2>
              <p className={subClass}>Used for magic link login and account recovery.</p>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
              />
              {emailMessage && (
                <p className={`text-sm mb-3 ${emailMessage.startsWith('Check') ? 'text-green-400' : 'text-red-400'}`}>{emailMessage}</p>
              )}
              <button onClick={saveEmail} disabled={savingEmail} className={btnClass} style={btnStyle}>
                {savingEmail ? 'Saving...' : 'Update Email'}
              </button>
            </div>

            <div className={cardClass}>
              <h2 className={labelClass}>Password</h2>
              <p className={subClass}>
                Set or change your password to log in with username + password instead of a magic link. Forgotten it? Use a magic link to get back in, then set a new one here.
              </p>
              <PasswordInput
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={inputClass}
              />
              {passwordMessage && (
                <p className={`text-sm mb-3 ${passwordMessage.startsWith('Password updated') ? 'text-green-400' : 'text-red-400'}`}>{passwordMessage}</p>
              )}
              <button onClick={savePassword} disabled={savingPassword || !newPassword} className={btnClass} style={btnStyle}>
                {savingPassword ? 'Saving...' : 'Set Password'}
              </button>
            </div>

            <div className={cardClass}>
              <h2 className={labelClass}>Your Kit</h2>
              <p className={subClass}>Shown next to your name on the leaderboard and results.</p>
              <KitEditor userId={user.id} />
            </div>

            <div className={cardClass}>
              <h2 className={labelClass}>Tier Picks</h2>
              {tierLocked ? (
                <p className={subClass + ' mb-0'}>Your tier picks are locked for the current competition and can no longer be changed.</p>
              ) : (
                <>
                  <p className={subClass}>{hasTierPicks ? 'You can still change your double-use tier teams until the first gameweek deadline.' : 'You have not set your tier picks yet. Choose your double-use teams before the first gameweek deadline.'}</p>
                  <a href="/join" className={btnClass + ' block text-center'} style={btnStyle}>
                    {hasTierPicks ? 'Edit Tier Picks' : 'Set Tier Picks'}
                  </a>
                </>
              )}
            </div>

            <div className={cardClass}>
              <h2 className={labelClass}>Account</h2>
              <p className={subClass}>Logged in as {email}</p>
              <button
                onClick={logOut}
                className="w-full border border-white/20 rounded px-4 py-2 text-sm hover:border-[#D9A441] text-[#F5ECD9]"
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