'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import TeamCrest from '../../components/TeamCrest'

type Team = { id: number; name: string; short_name: string | null; crest_url: string | null }

function teamDisplayName(team: Team | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

export default function JoinPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [teamsByTier, setTeamsByTier] = useState<Record<number, Team[]>>({ 1: [], 2: [], 3: [] })

  const [tier1Team, setTier1Team] = useState<number | null>(null)
  const [tier2Team, setTier2Team] = useState<number | null>(null)
  const [tier3Team, setTier3Team] = useState<number | null>(null)

  const [draftId, setDraftId] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!draftId) return

    const checkLock = async () => {
      const { data } = await supabase
        .from('draft_picks')
        .select('locked_at')
        .eq('id', draftId)
        .single()

      if (data?.locked_at) {
        setLocked(true)
      }
    }

    checkLock()
  }, [draftId])

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

    const { data: tierAssignments } = await supabase
      .from('tier_assignments')
      .select('team_id, tier, teams(id, name, short_name, crest_url)')
      .eq('competition_id', comp.id)
      .in('tier', [1, 2, 3])

    const grouped: Record<number, Team[]> = { 1: [], 2: [], 3: [] }
    tierAssignments?.forEach((a: any) => {
      if (grouped[a.tier] && a.teams) {
        grouped[a.tier].push(a.teams)
      }
    })
    setTeamsByTier(grouped)

    const { data: existing } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('user_id', user.id)
      .eq('competition_id', comp.id)
      .single()

    if (existing) {
      setDraftId(existing.id)
      setTier1Team(existing.tier1_team_id)
      setTier2Team(existing.tier2_team_id)
      setTier3Team(existing.tier3_team_id)
      if (existing.locked_at) setLocked(true)
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !competition) return

    const { error } = await supabase
      .from('draft_picks')
      .upsert({
        user_id: user.id,
        competition_id: competition.id,
        tier1_team_id: tier1Team,
        tier2_team_id: tier2Team,
        tier3_team_id: tier3Team,
        locked_at: null
      }, { onConflict: 'user_id,competition_id' })

    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      const { data: existing } = await supabase
        .from('competition_entries')
        .select('id')
        .eq('user_id', user.id)
        .eq('competition_id', competition.id)
        .single()

      if (!existing) {
        await supabase.from('competition_entries').insert({
          user_id: user.id,
          competition_id: competition.id
        })
      }

      setMessage('saved')
    }
    setSaving(false)
  }

  const quartileColours: Record<number, string> = {
    1: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
    2: 'bg-green-500/20 text-green-300 border-green-400/40',
    3: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
  }

  const tierLabels: Record<number, string> = {
    1: 'Q1 — Elite',
    2: 'Q2 — Solid',
    3: 'Q3 — Mid-Table',
  }

  if (loading) {
    return (
      <Shell active="PICKS">
        <p className="text-gray-500">Loading...</p>
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="PICKS">
        <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
        <p className="text-gray-500">There is no active competition right now.</p>
      </Shell>
    )
  }

  if (message === 'saved') {
    return (
      <Shell active="PICKS" user={user} displayName={displayName}>
        <HeroPage>
          <div className="w-full text-center text-[#F5ECD9]">
            <div className="text-4xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-3" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Tier Picks Saved</h1>
            <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-6">
              You can change your tier picks any time before the Gameweek 1 deadline. After that, they lock for the rest of the competition.
              Head to <strong>Settings</strong> if you want to come back and adjust them later.
            </p>
            
              href="/picks"
              className="inline-block rounded-lg px-6 py-3 font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}
            >
              Go to Picks
            </a>
          </div>
        </HeroPage>
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
                {tierLabels[tier]}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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