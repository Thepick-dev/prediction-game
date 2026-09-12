'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import RugbyKitEditor from '../../../components/RugbyKitEditor'
import PasswordInput from '../../../components/PasswordInput'
import { isValidUsername, USERNAME_MAX_LENGTH, USERNAME_RULES_MESSAGE } from '../../lib/username'

// Username/email/password are shared identity, not rugby-specific — same
// profiles.display_name + username_change_requests queue + Supabase Auth
// that football's Settings page uses. Only the kit card is rugby's own
// (rugby.player_kits, a separate table from football's profiles.kit_*).
export default function RugbySettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [currentName, setCurrentName] = useState('')
  const [pendingRequest, setPendingRequest] = useState<{ requested_name: string } | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

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

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setCurrentName(profile.display_name ?? '')
    }

    const { data: pending } = await supabase
      .from('username_change_requests')
      .select('requested_name')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (pending) setPendingRequest(pending)

    setLoading(false)
  }

  async function saveDisplayName() {
    if (!displayName.trim()) { setNameMessage('Please enter a username'); return }
    if (!isValidUsername(displayName)) { setNameMessage(USERNAME_RULES_MESSAGE); return }
    if (displayName.trim() === currentName) { setNameMessage("That's already your username"); return }
    setSavingName(true)
    setNameMessage('')

    await supabase.from('username_change_requests').delete().eq('user_id', user.id).eq('status', 'pending')

    const { error } = await supabase.from('username_change_requests').insert({
      user_id: user.id,
      current_name: currentName,
      requested_name: displayName.trim(),
    })

    if (error) {
      setNameMessage(error.message)
    } else {
      setNameMessage('Submitted — waiting on admin approval')
      setPendingRequest({ requested_name: displayName.trim() })
    }
    setSavingName(false)
  }

  async function saveEmail() {
    if (!email.trim()) { setEmailMessage('Please enter an email'); return }
    setSavingEmail(true)
    setEmailMessage('')
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    setEmailMessage(error ? error.message : 'Check your new email address to confirm the change')
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
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p></div>
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--blue text-2xl md:text-3xl mb-4">⚙️ Settings</h1>

      <div className="space-y-5">
        <div className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Username</h2>
          <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {currentName ? `Currently shown as "${currentName}"` : 'Not set yet'} — shared with the football side of the site.
          </p>
          {pendingRequest && (
            <p className="pop-badge pop-badge--orange px-2.5 py-1 text-xs mb-3 inline-block">
              Waiting on admin approval: &quot;{pendingRequest.requested_name}&quot;
            </p>
          )}
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={USERNAME_MAX_LENGTH}
            className="pop-input w-full p-2 mb-3 font-bold text-sm"
          />
          {nameMessage && (
            <p className={`pop-badge ${nameMessage.startsWith('Submitted') ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{nameMessage}</p>
          )}
          <button onClick={saveDisplayName} disabled={savingName} className="pop-button w-full py-2.5 text-sm">
            {savingName ? 'Submitting…' : 'Request Username Change'}
          </button>
        </div>

        <div className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Email</h2>
          <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Used for magic link login and account recovery.</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="pop-input w-full p-2 mb-3 font-bold text-sm" />
          {emailMessage && (
            <p className={`pop-badge ${emailMessage.startsWith('Check') ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{emailMessage}</p>
          )}
          <button onClick={saveEmail} disabled={savingEmail} className="pop-button w-full py-2.5 text-sm">
            {savingEmail ? 'Saving…' : 'Update Email'}
          </button>
        </div>

        <div className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Password</h2>
          <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Set or change your password to log in with username + password instead of a magic link.
          </p>
          <PasswordInput
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="pop-input w-full p-2 mb-3 font-bold text-sm"
            popArt
          />
          {passwordMessage && (
            <p className={`pop-badge ${passwordMessage.startsWith('Password updated') ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{passwordMessage}</p>
          )}
          <button onClick={savePassword} disabled={savingPassword || !newPassword} className="pop-button w-full py-2.5 text-sm">
            {savingPassword ? 'Saving…' : 'Set Password'}
          </button>
        </div>

        <div className="pop-panel pop-panel--pink p-5">
          <h2 className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Your Kit</h2>
          <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Shown next to your name on the leaderboard and in the header — click your kit up top for the same editor any time.</p>
          <RugbyKitEditor userId={user.id} />
        </div>

        <div className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Account</h2>
          <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Logged in as {email}</p>
          <button onClick={logOut} className="pop-button pop-button--yellow w-full py-2.5 text-sm">
            Log Out
          </button>
        </div>
      </div>
    </div>
  )
}
