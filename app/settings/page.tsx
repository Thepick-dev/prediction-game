'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import KitEditor from '../../components/KitEditor'
import PasswordInput from '../../components/PasswordInput'
import PopArtLoading from '../../components/PopArtLoading'
import { SHOW_INSTALL_PROMPT_EVENT } from '../../components/InstallPrompt'
import { useSkin } from '../lib/useSkin'
import { isValidUsername, USERNAME_MAX_LENGTH, USERNAME_RULES_MESSAGE } from '../lib/username'
import { RetroWindow, RetroButton, RetroSettingsPanel, RetroSkinPreviewControl } from '../../components/retro'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [currentName, setCurrentName] = useState('')
  const [pendingRequest, setPendingRequest] = useState<{ requested_name: string } | null>(null)

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
  const { skin, popArt, retro, globalSkin, preview, isAdmin, setPreview } = useSkin(user?.id)

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

    const { data: pending } = await supabase
      .from('username_change_requests')
      .select('requested_name')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (pending) setPendingRequest(pending)

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

  // Username changes no longer take effect immediately — they go into a
  // queue an admin reviews and approves (see /admin/users), same shape as
  // the password-reset-requests queue. The live display_name column stays
  // untouched here; currentName only updates once an admin actually
  // approves the request.
  async function saveDisplayName() {
    if (!displayName.trim()) { setNameMessage('Please enter a username'); return }
    if (!isValidUsername(displayName)) { setNameMessage(USERNAME_RULES_MESSAGE); return }
    if (displayName.trim() === currentName) { setNameMessage("That's already your username"); return }
    setSavingName(true)
    setNameMessage('')

    // Replace any request still waiting on the admin rather than stacking
    // — only the latest ask should be live.
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
      <Shell active="SETTINGS" skin={skin}>
        <PopArtLoading />
      </Shell>
    )
  }

  if (retro) {
    return (
      <Shell active="SETTINGS" user={user} displayName={currentName} skin="retro">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 6)' }}>
          <h1 style={{ fontFamily: 'var(--font-retro-display)', fontSize: 24, color: 'var(--retro-gold)', textShadow: 'var(--retro-px) var(--retro-px) 0 #000' }}>
            SETTINGS
          </h1>

          {isAdmin && (
            <RetroSkinPreviewControl globalSkin={globalSkin} preview={preview} setPreview={setPreview} />
          )}

          <RetroSettingsPanel />

          <RetroWindow title="Username">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
              {currentName ? `Currently shown as "${currentName}"` : 'Not set yet'}
            </p>
            {pendingRequest && (
              <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: 'var(--retro-gold)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                Waiting on admin approval: &quot;{pendingRequest.requested_name}&quot;
              </p>
            )}
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={USERNAME_MAX_LENGTH}
              className="retro-input"
              style={{ width: '100%', marginBottom: 'calc(var(--retro-px) * 3)' }}
            />
            {nameMessage && (
              <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: nameMessage.startsWith('Submitted') ? 'var(--retro-green-light)' : 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                {nameMessage}
              </p>
            )}
            <RetroButton variant="a" onClick={saveDisplayName} disabled={savingName} style={{ width: '100%' }}>
              {savingName ? 'Submitting...' : 'Request Change'}
            </RetroButton>
          </RetroWindow>

          <RetroWindow title="Email">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
              Used for magic link login and account recovery.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="retro-input"
              style={{ width: '100%', marginBottom: 'calc(var(--retro-px) * 3)' }}
            />
            {emailMessage && (
              <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: emailMessage.startsWith('Check') ? 'var(--retro-green-light)' : 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                {emailMessage}
              </p>
            )}
            <RetroButton variant="a" onClick={saveEmail} disabled={savingEmail} style={{ width: '100%' }}>
              {savingEmail ? 'Saving...' : 'Update Email'}
            </RetroButton>
          </RetroWindow>

          <RetroWindow title="Password">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
              Set or change your password to log in with username + password instead of a magic link.
            </p>
            <div style={{ marginBottom: 'calc(var(--retro-px) * 3)' }}>
              <PasswordInput
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="retro-input w-full"
              />
            </div>
            {passwordMessage && (
              <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: passwordMessage.startsWith('Password updated') ? 'var(--retro-green-light)' : 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                {passwordMessage}
              </p>
            )}
            <RetroButton variant="a" onClick={savePassword} disabled={savingPassword || !newPassword} style={{ width: '100%' }}>
              {savingPassword ? 'Saving...' : 'Set Password'}
            </RetroButton>
          </RetroWindow>

          <RetroWindow title="Your Kit">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
              Shown next to your name on the leaderboard and results.
            </p>
            {/* KitEditor hasn't been migrated to retro yet — see the same
                note in ceefax-shell.tsx's kit popup. */}
            <div className="pop-art-theme" style={{ background: 'transparent' }}>
              <KitEditor userId={user.id} theme="pop-art" />
            </div>
          </RetroWindow>

          <RetroWindow title="Tier Picks">
            {tierLocked ? (
              <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16 }}>
                Your tier picks are locked for the current competition and can no longer be changed.
              </p>
            ) : (
              <>
                <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
                  {hasTierPicks ? 'You can still change your double-use tier teams until the first gameweek deadline.' : 'You have not set your tier picks yet.'}
                </p>
                <a href="/join" className="retro-button retro-button--b" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}>
                  {hasTierPicks ? 'Edit Tier Picks' : 'Set Tier Picks'}
                </a>
              </>
            )}
          </RetroWindow>

          <RetroWindow title="Install App">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
              Add LMS All-Stars to your home screen for quick access.
            </p>
            <RetroButton variant="b" onClick={() => window.dispatchEvent(new Event(SHOW_INSTALL_PROMPT_EVENT))} style={{ width: '100%' }}>
              Show Install Prompt
            </RetroButton>
          </RetroWindow>

          <RetroWindow title="Account">
            <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
              Logged in as {email}
            </p>
            <RetroButton variant="select" onClick={logOut} style={{ width: '100%' }}>
              Log Out
            </RetroButton>
          </RetroWindow>
        </div>
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell active="SETTINGS" user={user} displayName={currentName} skin="pop-art">
        <div className="pop-art-theme">

          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-6 mt-2">Settings</h1>

          <div className="space-y-5">

            {isAdmin && (
              <div className="pop-panel pop-panel--blue p-5">
                <h2 className="pop-headline text-sm mb-1">🕹️ Admin Preview</h2>
                <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Global skin for everyone right now: <strong>{globalSkin === 'retro' ? 'Retro' : 'Pop Art'}</strong>.
                  Previewing changes only what you see, on this browser.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setPreview('pop-art')}
                    className={`pop-button ${preview === 'pop-art' ? 'pop-button--yellow' : ''} text-xs py-2 px-3`}
                  >
                    Preview Pop Art
                  </button>
                  <button
                    onClick={() => setPreview('retro')}
                    className={`pop-button ${preview === 'retro' ? 'pop-button--yellow' : ''} text-xs py-2 px-3`}
                  >
                    Preview Retro
                  </button>
                  {preview && (
                    <button onClick={() => setPreview(null)} className="pop-button pop-button--blue text-xs py-2 px-3">
                      Clear override
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Username</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {currentName ? `Currently shown as "${currentName}"` : 'Not set yet'}
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
                {savingName ? 'Submitting...' : 'Request Username Change'}
              </button>
            </div>

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Email</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Used for magic link login and account recovery.</p>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pop-input w-full p-2 mb-3 font-bold text-sm"
              />
              {emailMessage && (
                <p className={`pop-badge ${emailMessage.startsWith('Check') ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{emailMessage}</p>
              )}
              <button onClick={saveEmail} disabled={savingEmail} className="pop-button w-full py-2.5 text-sm">
                {savingEmail ? 'Saving...' : 'Update Email'}
              </button>
            </div>

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Password</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Set or change your password to log in with username + password instead of a magic link. Forgotten it? Use a magic link to get back in, then set a new one here.
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
                {savingPassword ? 'Saving...' : 'Set Password'}
              </button>
            </div>

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Your Kit</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Shown next to your name on the leaderboard and results.</p>
              <KitEditor userId={user.id} theme="pop-art" />
            </div>

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Tier Picks</h2>
              {tierLocked ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Your tier picks are locked for the current competition and can no longer be changed.</p>
              ) : (
                <>
                  <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>{hasTierPicks ? 'You can still change your double-use tier teams until the first gameweek deadline.' : 'You have not set your tier picks yet. Choose your double-use teams before the first gameweek deadline.'}</p>
                  <a href="/join" className="pop-button pop-button--yellow w-full py-2.5 text-sm block text-center">
                    {hasTierPicks ? 'Edit Tier Picks' : 'Set Tier Picks'}
                  </a>
                </>
              )}
            </div>

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">📲 Install App</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Add LMS All-Stars to your home screen for quick access, like a real app. If you dismissed the
                install prompt, this brings it back.
              </p>
              <button
                onClick={() => window.dispatchEvent(new Event(SHOW_INSTALL_PROMPT_EVENT))}
                className="pop-button pop-button--yellow w-full py-2.5 text-sm"
              >
                Show Install Prompt
              </button>
            </div>

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Account</h2>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Logged in as {email}</p>
              <button onClick={logOut} className="pop-button pop-button--blue w-full py-2.5 text-sm">
                Log Out
              </button>
            </div>

          </div>

        </div>
      </Shell>
    )
  }

  return null
}