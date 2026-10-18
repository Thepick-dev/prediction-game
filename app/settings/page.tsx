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
import { isValidPassword, PASSWORD_RULES_MESSAGE } from '../lib/password'
import { isInviteCodeUsable } from '../lib/inviteCodes'
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

  const [inviteSettings, setInviteSettings] = useState<{ enabled: boolean; cap: number } | null>(null)
  const [myInviteCodes, setMyInviteCodes] = useState<{ id: string; code: string; max_uses: number | null; uses_count: number; active: boolean }[]>([])
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')
  const [copiedCode, setCopiedCode] = useState('')

  const [marketingQuestions, setMarketingQuestions] = useState<{ id: string; question_text: string }[]>([])
  const [marketingAnswers, setMarketingAnswers] = useState<Record<string, boolean>>({})
  const [savingMarketing, setSavingMarketing] = useState(false)
  const [marketingMessage, setMarketingMessage] = useState('')

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState('')

  const supabase = createClient()
  const { skin, popArt, retro, globalSkin, preview, isAdmin, setPreview, popArtVariant, globalPopArtVariant, variantPreview, setVariantPreview } = useSkin(user?.id)

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

    // Isolated and defensive — a brand new, feature-flagged endpoint;
    // a problem here should just mean "no invite section", never break
    // the rest of Settings.
    try {
      const res = await fetch('/api/invites')
      if (res.ok) {
        const data = await res.json()
        setInviteSettings({ enabled: data.enabled, cap: data.cap })
        setMyInviteCodes(data.codes ?? [])
      }
    } catch {}

    // Active questions are public-read, so fetched directly; existing
    // answers need the caller's own session, hence the API route.
    try {
      const { data: questions } = await supabase.from('marketing_consent_questions').select('id, question_text').eq('active', true).order('display_order', { ascending: true })
      setMarketingQuestions(questions ?? [])

      if (questions && questions.length > 0) {
        const res = await fetch('/api/marketing-consent')
        if (res.ok) {
          const data = await res.json()
          const answers: Record<string, boolean> = {}
          data.answers?.forEach((a: { question_id: string; consented: boolean }) => { answers[a.question_id] = a.consented })
          setMarketingAnswers(answers)
        }
      }
    } catch {}

    setLoading(false)
  }

  async function saveMarketingPreferences() {
    setSavingMarketing(true)
    setMarketingMessage('')
    try {
      const res = await fetch('/api/marketing-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: marketingQuestions.map(q => ({ questionId: q.id, consented: !!marketingAnswers[q.id] })),
        }),
      })
      setMarketingMessage(res.ok ? 'Preferences saved' : 'Something went wrong')
    } catch {
      setMarketingMessage('Something went wrong')
    }
    setSavingMarketing(false)
  }

  async function generateInvite() {
    setGeneratingInvite(true)
    setInviteMessage('')
    try {
      const res = await fetch('/api/invites', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setInviteMessage(data.error ?? 'Something went wrong')
      } else {
        setMyInviteCodes(prev => [data.code, ...prev])
      }
    } catch {
      setInviteMessage('Something went wrong')
    }
    setGeneratingInvite(false)
  }

  async function copyInviteLink(code: string) {
    const link = `${window.location.origin}/login?invite=${code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(''), 2000)
    } catch {
      setInviteMessage('Could not copy automatically — select the link above and copy it manually')
    }
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
    if (!isValidPassword(newPassword)) { setPasswordMessage(PASSWORD_RULES_MESSAGE); return }
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

  async function deleteAccount() {
    if (deleteConfirmText.trim() !== currentName) {
      setDeleteMessage('Type your username exactly to confirm')
      return
    }
    setDeletingAccount(true)
    setDeleteMessage('')
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setDeleteMessage(data.error ?? 'Something went wrong')
        setDeletingAccount(false)
        return
      }
      await supabase.auth.signOut()
      window.location.href = '/login?deleted=1'
    } catch {
      setDeleteMessage('Something went wrong')
      setDeletingAccount(false)
    }
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

          {inviteSettings?.enabled && (
            <RetroWindow title="Invite a Mate">
              <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
                Know someone who&apos;d enjoy this? Generate a link — whoever uses it skips the waiting list and gets straight in. Up to {inviteSettings.cap} outstanding at once.
              </p>
              {inviteMessage && (
                <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                  {inviteMessage}
                </p>
              )}
              {myInviteCodes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 2)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                  {myInviteCodes.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(var(--retro-px) * 2)' }}>
                      <span style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16 }}>
                        {c.code} — {!isInviteCodeUsable(c) && c.uses_count > 0 ? 'Used' : !c.active ? 'Deactivated' : 'Available'}
                      </span>
                      <RetroButton variant="b" onClick={() => copyInviteLink(c.code)}>
                        {copiedCode === c.code ? 'Copied!' : 'Copy Link'}
                      </RetroButton>
                    </div>
                  ))}
                </div>
              )}
              <RetroButton
                variant="a"
                onClick={generateInvite}
                disabled={generatingInvite || myInviteCodes.filter(isInviteCodeUsable).length >= inviteSettings.cap}
                style={{ width: '100%' }}
              >
                {generatingInvite ? 'Generating...' : 'Generate New Invite Link'}
              </RetroButton>
            </RetroWindow>
          )}

          {marketingQuestions.length > 0 && (
            <RetroWindow title="Marketing Preferences">
              {marketingMessage && (
                <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: marketingMessage === 'Preferences saved' ? 'var(--retro-green-light)' : 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                  {marketingMessage}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 3)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                {marketingQuestions.map(q => (
                  <label key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'calc(var(--retro-px) * 2)', fontFamily: 'var(--font-retro-body)', fontSize: 16 }}>
                    <input
                      type="checkbox"
                      checked={!!marketingAnswers[q.id]}
                      onChange={e => setMarketingAnswers(prev => ({ ...prev, [q.id]: e.target.checked }))}
                      style={{ marginTop: 4 }}
                    />
                    <span>{q.question_text}</span>
                  </label>
                ))}
              </div>
              <RetroButton variant="a" onClick={saveMarketingPreferences} disabled={savingMarketing} style={{ width: '100%' }}>
                {savingMarketing ? 'Saving...' : 'Save Preferences'}
              </RetroButton>
            </RetroWindow>
          )}

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

          <RetroWindow title="Delete Account">
            {!showDeleteConfirm ? (
              <>
                <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginBottom: 'calc(var(--retro-px) * 3)' }}>
                  Permanently deletes your account. Your past picks, points and Wall posts stay — removing them would
                  wipe other people&apos;s history too — but your name and email are scrubbed and you won&apos;t be
                  able to log back in.
                </p>
                <RetroButton variant="select" onClick={() => setShowDeleteConfirm(true)} style={{ width: '100%' }}>
                  Delete My Account
                </RetroButton>
              </>
            ) : (
              <>
                <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, color: 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                  This can&apos;t be undone. Type your username (&quot;{currentName}&quot;) below to confirm.
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={currentName}
                  className="retro-input"
                  style={{ width: '100%', marginBottom: 'calc(var(--retro-px) * 3)' }}
                />
                {deleteMessage && (
                  <p style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: 'var(--retro-red-light)', marginBottom: 'calc(var(--retro-px) * 3)' }}>
                    {deleteMessage}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 'calc(var(--retro-px) * 3)' }}>
                  <RetroButton variant="b" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteMessage('') }} style={{ flex: 1 }}>
                    Cancel
                  </RetroButton>
                  <RetroButton variant="select" onClick={deleteAccount} disabled={deletingAccount} style={{ flex: 1 }}>
                    {deletingAccount ? 'Deleting...' : 'Permanently Delete'}
                  </RetroButton>
                </div>
              </>
            )}
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

            {isAdmin && (
              <div className="pop-panel pop-panel--blue p-5">
                <h2 className="pop-headline text-sm mb-1">🎨 Pop Art Version Preview</h2>
                <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  V2 is a richer, jewel-toned refinement. V3 ("Gallery Spotlight") is bolder still — theatrical
                  lighting, bold panel edges, a cut-corner signature on every card. Colours/glow/shape only,
                  nothing about layout changes. Live for everyone right now:{' '}
                  <strong>{globalPopArtVariant === 'v3' ? 'V3' : globalPopArtVariant === 'v2' ? 'V2' : 'V1 (original)'}</strong>.
                  Previewing here only changes what you see, on this browser.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setVariantPreview('v1')}
                    className={`pop-button ${variantPreview === 'v1' ? 'pop-button--yellow' : ''} text-xs py-2 px-3`}
                  >
                    Preview V1 (Original)
                  </button>
                  <button
                    onClick={() => setVariantPreview('v2')}
                    className={`pop-button ${variantPreview === 'v2' ? 'pop-button--yellow' : ''} text-xs py-2 px-3`}
                  >
                    Preview V2
                  </button>
                  <button
                    onClick={() => setVariantPreview('v3')}
                    className={`pop-button ${variantPreview === 'v3' ? 'pop-button--yellow' : ''} text-xs py-2 px-3`}
                  >
                    Preview V3
                  </button>
                  {variantPreview && (
                    <button onClick={() => setVariantPreview(null)} className="pop-button pop-button--blue text-xs py-2 px-3">
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

            {inviteSettings?.enabled && (
              <div className="pop-panel p-5">
                <h2 className="pop-headline text-sm mb-1">🤝 Invite a Mate</h2>
                <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Know someone who&apos;d enjoy this? Generate a link — whoever uses it skips the waiting list and gets straight in. Up to {inviteSettings.cap} outstanding at once.
                </p>
                {inviteMessage && (
                  <p className="pop-badge pop-badge--red px-2.5 py-1 text-xs mb-3 inline-block">{inviteMessage}</p>
                )}
                {myInviteCodes.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {myInviteCodes.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold">
                          {c.code}
                          <span className="ml-2 text-xs font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {!isInviteCodeUsable(c) && c.uses_count > 0 ? 'Used' : !c.active ? 'Deactivated' : 'Available'}
                          </span>
                        </span>
                        <button onClick={() => copyInviteLink(c.code)} className="pop-button text-xs py-1.5 px-3 shrink-0">
                          {copiedCode === c.code ? 'Copied!' : 'Copy Link'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={generateInvite}
                  disabled={generatingInvite || myInviteCodes.filter(isInviteCodeUsable).length >= inviteSettings.cap}
                  className="pop-button pop-button--yellow w-full py-2.5 text-sm"
                >
                  {generatingInvite ? 'Generating...' : 'Generate New Invite Link'}
                </button>
              </div>
            )}

            {marketingQuestions.length > 0 && (
              <div className="pop-panel p-5">
                <h2 className="pop-headline text-sm mb-1">📬 Marketing Preferences</h2>
                {marketingMessage && (
                  <p className={`pop-badge ${marketingMessage === 'Preferences saved' ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{marketingMessage}</p>
                )}
                <div className="space-y-2 mb-3">
                  {marketingQuestions.map(q => (
                    <label key={q.id} className="flex items-start gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <input
                        type="checkbox"
                        checked={!!marketingAnswers[q.id]}
                        onChange={e => setMarketingAnswers(prev => ({ ...prev, [q.id]: e.target.checked }))}
                        className="mt-0.5"
                      />
                      <span>{q.question_text}</span>
                    </label>
                  ))}
                </div>
                <button onClick={saveMarketingPreferences} disabled={savingMarketing} className="pop-button pop-button--yellow w-full py-2.5 text-sm">
                  {savingMarketing ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            )}

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

            <div className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-1">Delete Account</h2>
              {!showDeleteConfirm ? (
                <>
                  <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Permanently deletes your account. Your past picks, points and Wall posts stay — removing them
                    would wipe other people&apos;s history too — but your name and email are scrubbed and you
                    won&apos;t be able to log back in.
                  </p>
                  <button onClick={() => setShowDeleteConfirm(true)} className="pop-button w-full py-2.5 text-sm" style={{ background: 'var(--pop-red)' }}>
                    Delete My Account
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm mb-3 font-bold" style={{ color: 'var(--pop-red)' }}>
                    This can&apos;t be undone. Type your username (&quot;{currentName}&quot;) below to confirm.
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder={currentName}
                    className="pop-input w-full p-2 mb-3 font-bold text-sm"
                  />
                  {deleteMessage && (
                    <p className="pop-badge pop-badge--red px-2.5 py-1 text-xs mb-3 inline-block">{deleteMessage}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteMessage('') }}
                      className="pop-button flex-1 py-2.5 text-sm"
                    >
                      Cancel
                    </button>
                    <button onClick={deleteAccount} disabled={deletingAccount} className="pop-button flex-1 py-2.5 text-sm" style={{ background: 'var(--pop-red)' }}>
                      {deletingAccount ? 'Deleting...' : 'Permanently Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>

        </div>
      </Shell>
    )
  }

  return null
}