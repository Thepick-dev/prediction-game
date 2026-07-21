'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import KitBadge from '../../components/KitBadge'
import KitPreview from '../../components/KitPreview'

const PATTERNS = [
  { value: 'solid', label: 'Solid' },
  { value: 'horizontal', label: 'Horizontal Stripes' },
  { value: 'vertical', label: 'Vertical Stripes' },
  { value: 'halves', label: 'Halves' },
  { value: 'sleeves', label: 'Different Sleeves' },
  { value: 'hoops', label: 'Hoops' },
  { value: 'sash', label: 'Sash' },
  { value: 'quarters', label: 'Quarters' },
  { value: 'pinstripes', label: 'Pinstripes' },
]

const SWATCHES = [
  '#FFFFFF', '#F5ECD9', '#2A1F17', '#1A1A1A',
  '#E8552B', '#B5493C', '#DC2626', '#7A2426',
  '#1E4D6B', '#3C5A6B', '#1D4ED8', '#0EA5E9',
  '#2F3E2E', '#16A34A', '#4ADE80', '#065F46',
  '#D9A441', '#FBBF24', '#F59E0B', '#EAB308',
  '#7C3AED', '#A855F7', '#EC4899', '#463A4A',
]

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [currentName, setCurrentName] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const [kitPattern, setKitPattern] = useState('solid')
  const [kitColour1, setKitColour1] = useState('#1E4D6B')
  const [kitColour2, setKitColour2] = useState('#F5ECD9')

  const [tierLocked, setTierLocked] = useState<boolean | null>(null)
  const [hasTierPicks, setHasTierPicks] = useState(false)

  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingKit, setSavingKit] = useState(false)

  const [nameMessage, setNameMessage] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [kitMessage, setKitMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)
    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, kit_pattern, kit_colour_1, kit_colour_2')
      .eq('id', user.id)
      .single()

    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setCurrentName(profile.display_name ?? '')
      setKitPattern(profile.kit_pattern ?? 'solid')
      setKitColour1(profile.kit_colour_1 ?? '#1E4D6B')
      setKitColour2(profile.kit_colour_2 ?? '#F5ECD9')
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

  async function saveKit() {
    setSavingKit(true)
    setKitMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({ kit_pattern: kitPattern, kit_colour_1: kitColour1, kit_colour_2: kitColour2 })
      .eq('id', user.id)

    if (error) {
      setKitMessage(error.message)
    } else {
      setKitMessage('Kit saved')
    }
    setSavingKit(false)
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
              <input
                type="password"
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

              <div className="flex justify-center mb-4">
                <KitPreview pattern={kitPattern} colour1={kitColour1} colour2={kitColour2} size={140} />
              </div>

              <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Pattern</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {PATTERNS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setKitPattern(p.value)}
                    className={`flex flex-col items-center gap-1 p-2 rounded border text-xs ${
                      kitPattern === p.value ? 'border-[#D9A441] bg-[#D9A441]/10 font-bold' : 'border-white/10'
                    }`}
                  >
                    <KitBadge pattern={p.value} colour1={kitColour1} colour2={kitColour2} size={28} />
                    <span className="text-center">{p.label}</span>
                  </button>
                ))}
              </div>

              <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Colour 1</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {SWATCHES.map(colour => (
                  <button
                    key={colour}
                    onClick={() => setKitColour1(colour)}
                    className={`w-8 h-8 rounded-full border-2 ${kitColour1 === colour ? 'border-[#D9A441]' : 'border-transparent'}`}
                    style={{ backgroundColor: colour }}
                  />
                ))}
              </div>

              <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Colour 2</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {SWATCHES.map(colour => (
                  <button
                    key={colour}
                    onClick={() => setKitColour2(colour)}
                    className={`w-8 h-8 rounded-full border-2 ${kitColour2 === colour ? 'border-[#D9A441]' : 'border-transparent'}`}
                    style={{ backgroundColor: colour }}
                  />
                ))}
              </div>

              {kitMessage && (
                <p className={`text-sm mb-3 ${kitMessage.startsWith('Kit saved') ? 'text-green-400' : 'text-red-400'}`}>{kitMessage}</p>
              )}
              <button onClick={saveKit} disabled={savingKit} className={btnClass} style={btnStyle}>
                {savingKit ? 'Saving...' : 'Save Kit'}
              </button>
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