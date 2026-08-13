'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'
import PopArtLoading from '../../components/PopArtLoading'
import KitEditor from '../../components/KitEditor'
import { usePopArtTheme } from '../lib/usePopArtTheme'

type Team = { id: number; name: string; short_name: string | null; crest_url: string | null }

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

// Shown once, right after a brand new player finishes their tier picks —
// their kit is still the plain default at that point, and this is the
// first natural pause in onboarding to ask them to personalise it. Extracted
// as its own component (rather than defined inline in JoinPage) so it isn't
// recreated — and KitEditor's in-progress selection lost — on every render.
function KitSetupPopup({ userId, theme, onDone }: { userId: string; theme: 'classic' | 'pop-art'; onDone: () => void }) {
  const isPopArt = theme === 'pop-art'
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999, background: 'rgba(0,0,0,0.7)' }}>
      <div
        className={isPopArt ? 'pop-art-theme rounded-2xl p-5 w-full' : 'rounded-2xl p-5 w-full'}
        style={{
          maxWidth: 340, maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto',
          ...(isPopArt
            ? { background: 'var(--pop-surface)', border: '3px solid var(--pop-green)', boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }
            : { background: '#1e1914', border: '2px solid rgba(217,164,65,0.4)' }),
        }}
      >
        <p className={isPopArt ? 'pop-headline text-lg mb-1 text-center' : 'text-lg font-bold mb-1 text-center'} style={isPopArt ? undefined : { color: '#D9A441', fontFamily: 'var(--font-heading), serif' }}>
          One Last Thing — Your Kit
        </p>
        <p className="text-xs mb-4 text-center" style={{ color: isPopArt ? 'rgba(255,255,255,0.6)' : '#F5ECD9CC' }}>
          Design the kit that appears next to your name on the leaderboard and picks. You can change it any time in Settings.
        </p>
        <KitEditor userId={userId} compact theme={theme} onSaved={() => { if (isPopArt) { setTimeout(onDone, 1200) } else { onDone() } }} />
        <button
          onClick={onDone}
          className={isPopArt ? 'pop-button pop-button--blue w-full mt-3 py-2 text-xs' : 'w-full mt-3 rounded-lg py-2 text-xs font-bold uppercase tracking-wider'}
          style={isPopArt ? undefined : { backgroundColor: 'rgba(245,236,217,0.1)', color: '#F5ECD9' }}
        >
          Skip for now
        </button>
      </div>
    </div>,
    document.body
  )
}

export default function JoinPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [tierNames, setTierNames] = useState<Record<number, string>>({})
  const [teamsByTier, setTeamsByTier] = useState<Record<number, Team[]>>({ 1: [], 2: [], 3: [] })

  const [tier1Team, setTier1Team] = useState<number | null>(null)
  const [tier2Team, setTier2Team] = useState<number | null>(null)
  const [tier3Team, setTier3Team] = useState<number | null>(null)

  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  // True only when this user had no tier_draft_picks row at all before this
  // page load — i.e. genuinely their first time, not a later edit via
  // Settings. Only that first save should trigger the kit popup.
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false)
  const [showKitPopup, setShowKitPopup] = useState(false)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }
    setUser(user)

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setDisplayName(profile?.display_name ?? '')

    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const [{ data: tierNamesData }, { data: assignments }, { data: teamsData }] = await Promise.all([
      supabase.from('competition_draft_tiers').select('tier_number, tier_name').eq('competition_id', comp.id),
      supabase.from('draft_tier_assignments').select('team_id, tier_number').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name, short_name, crest_url')
    ])

    const nameMap: Record<number, string> = {}
    tierNamesData?.forEach(t => { nameMap[t.tier_number] = t.tier_name })
    setTierNames(nameMap)

    const teamMap: Record<number, Team> = {}
    teamsData?.forEach(t => { teamMap[t.id] = t })

    const grouped: Record<number, Team[]> = { 1: [], 2: [], 3: [] }
    assignments?.forEach(a => {
      if (grouped[a.tier_number] && teamMap[a.team_id]) {
        grouped[a.tier_number].push(teamMap[a.team_id])
      }
    })
    setTeamsByTier(grouped)

    const { data: existing } = await supabase
      .from('tier_draft_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('competition_id', comp.id)
      .single()

    setIsFirstTimeSetup(!existing)

    if (existing) {
      setTier1Team(existing.tier1_team_id)
      setTier2Team(existing.tier2_team_id)
      setTier3Team(existing.tier3_team_id)
      if (existing.locked) setLocked(true)
    }

    setLoading(false)
  }

  async function saveDraft() {
    if (!tier1Team || !tier2Team || !tier3Team) {
      setMessage('Please select one team from each tier')
      return
    }
    setSaving(true)
    setMessage('')

    if (!competition) return

    const res = await fetch('/api/tier-picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competition_id: competition.id,
        tier1_team_id: tier1Team,
        tier2_team_id: tier2Team,
        tier3_team_id: tier3Team,
      })
    })
    const data = await res.json()

    if (data.error) {
      setMessage('Error: ' + data.error)
      if (data.error.includes('locked')) setLocked(true)
    } else {
      setMessage('saved')
      if (isFirstTimeSetup) setShowKitPopup(true)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <Shell active="PICKS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="PICKS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? (
          <div className="pop-art-theme text-center py-12">
            <p className="pop-headline text-2xl mb-2">No Active Competition</p>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>There is no active competition right now.</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
            <p className="text-gray-500">There is no active competition right now.</p>
          </>
        )}
      </Shell>
    )
  }

  if (message === 'saved') {
    if (popArt) {
      return (
        <Shell active="PICKS" user={user} displayName={displayName} theme="pop-art">
          <div className="pop-art-theme text-center">
            <div className="text-4xl mb-4">✅</div>
            <h1 className="pop-hero pop-hero--blue text-4xl sm:text-5xl mb-3">Tier Picks Saved</h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.7)' }}>
              You can change your tier picks any time before the Gameweek 1 deadline. After that, they lock for the rest of the competition.
              Head to Settings if you want to come back and adjust them later.
            </p>
            <a href="/picks" className="pop-button inline-block px-6 py-3 text-sm">
              Go to Picks
            </a>
          </div>
          {showKitPopup && <KitSetupPopup userId={user.id} theme="pop-art" onDone={() => setShowKitPopup(false)} />}
        </Shell>
      )
    }
    return (
      <Shell active="PICKS" user={user} displayName={displayName}>
        <HeroPage>
          <div className="w-full text-center text-[#F5ECD9]">
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Tier Picks Saved</h1>
            <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-6">
              You can change your tier picks any time before the Gameweek 1 deadline. After that, they lock for the rest of the competition.
              Head to Settings if you want to come back and adjust them later.
            </p>
            <a href="/picks" className="inline-block rounded-lg px-6 py-3 font-bold uppercase tracking-wider" style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}>
              Go to Picks
            </a>
          </div>
          {showKitPopup && <KitSetupPopup userId={user.id} theme="classic" onDone={() => setShowKitPopup(false)} />}
        </HeroPage>
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell active="PICKS" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">

          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-1 mt-2">Tier Draft</h1>
          <p className="font-bold text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name}</p>
          <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Pick one team from each tier — these become your double-use teams for the season.</p>

          {locked && (
            <div className="pop-panel pop-panel--yellow px-4 py-3 mb-6">
              <p className="text-sm">Your tier picks are locked for this competition and can no longer be changed.</p>
            </div>
          )}

          {[1, 2, 3].map(tier => (
            <div key={tier} className="mb-6">
              <h2 className="pop-headline text-sm mb-3">
                Tier {tier}{tierNames[tier] ? ` — ${tierNames[tier]}` : ''}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teamsByTier[tier]?.length === 0 && (
                  <p className="text-xs col-span-full" style={{ color: 'rgba(255,255,255,0.4)' }}>No teams assigned to this tier yet.</p>
                )}
                {teamsByTier[tier]?.map(team => {
                  const selected =
                    tier === 1 ? tier1Team === team.id :
                    tier === 2 ? tier2Team === team.id :
                    tier3Team === team.id

                  return (
                    <button
                      key={team.id}
                      onClick={() => {
                        if (locked) return
                        if (tier === 1) setTier1Team(team.id)
                        else if (tier === 2) setTier2Team(team.id)
                        else setTier3Team(team.id)
                      }}
                      disabled={locked}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                      style={{
                        border: selected ? '2px solid var(--pop-green)' : '2px solid rgba(255,255,255,0.15)',
                        background: selected ? 'rgba(204,250,0,0.12)' : 'transparent',
                        boxShadow: selected ? '0 0 14px rgba(204,250,0,0.4)' : 'none',
                      }}
                    >
                      <TeamCrest crestUrl={team.crest_url} teamName={team.name} size={26} />
                      <span className="text-xs font-black uppercase truncate">{teamDisplayName(team)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {message && message !== 'saved' && (
            <p className="pop-badge pop-badge--red px-2.5 py-1 text-xs mb-4 inline-block">{message}</p>
          )}

          {!locked && (
            <button
              onClick={saveDraft}
              disabled={saving}
              className="pop-button w-full py-3 text-sm"
            >
              {saving ? 'Saving...' : 'Save Tier Picks'}
            </button>
          )}

        </div>
      </Shell>
    )
  }

  return (
    <Shell active="PICKS" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>TIER DRAFT</h1>
          <p className="text-[#D9A441]/70 mb-1 text-sm">{competition.name}</p>
          <p className="text-xs text-[#F5ECD9]/50 mb-6">Pick one team from each tier — these become your double-use teams for the season.</p>

          {locked && (
            <div className="bg-yellow-900/30 border border-yellow-500/40 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-yellow-200">Your tier picks are locked for this competition and can no longer be changed.</p>
            </div>
          )}

          {[1, 2, 3].map(tier => (
            <div key={tier} className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>
                Tier {tier}{tierNames[tier] ? ` — ${tierNames[tier]}` : ''}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {teamsByTier[tier]?.length === 0 && (
                  <p className="text-xs text-[#F5ECD9]/40 col-span-full">No teams assigned to this tier yet.</p>
                )}
                {teamsByTier[tier]?.map(team => {
                  const selected =
                    tier === 1 ? tier1Team === team.id :
                    tier === 2 ? tier2Team === team.id :
                    tier3Team === team.id

                  return (
                    <button
                      key={team.id}
                      onClick={() => {
                        if (locked) return
                        if (tier === 1) setTier1Team(team.id)
                        else if (tier === 2) setTier2Team(team.id)
                        else setTier3Team(team.id)
                      }}
                      disabled={locked}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        selected
                          ? 'bg-[#D9A441]/15 border-[#D9A441]'
                          : 'bg-white/5 border-white/10 hover:border-[#D9A441]/50'
                      } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <TeamCrest crestUrl={team.crest_url} teamName={team.name} size={26} />
                      <span className="text-xs font-bold uppercase truncate">{teamDisplayName(team)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {message && message !== 'saved' && (
            <p className="text-sm text-red-400 mb-4">{message}</p>
          )}

          {!locked && (
            <button
              onClick={saveDraft}
              disabled={saving}
              className="w-full rounded-lg px-6 py-3 font-bold uppercase tracking-wider disabled:opacity-50"
              style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}
            >
              {saving ? 'Saving...' : 'Save Tier Picks'}
            </button>
          )}

        </div>
      </HeroPage>
    </Shell>
  )
}