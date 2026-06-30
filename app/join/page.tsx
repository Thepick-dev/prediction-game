'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

type Team = { id: number; name: string }
type Competition = { id: string; name: string; status: string }
type TierAssignment = { team_id: number; tier: number }

export default function JoinPage() {
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [tierAssignments, setTierAssignments] = useState<TierAssignment[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [tier1Pick, setTier1Pick] = useState<number | null>(null)
  const [tier2Pick, setTier2Pick] = useState<number | null>(null)
  const [tier3Pick, setTier3Pick] = useState<number | null>(null)
  const [tier4Pick, setTier4Pick] = useState<number | null>(null)
  const [alreadyJoined, setAlreadyJoined] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: comp } = await supabase
      .from('competitions')
      .select('*')
      .eq('status', 'active')
      .single()

    if (!comp) {
      setLoading(false)
      return
    }

    setCompetition(comp)

    const { data: entry } = await supabase
      .from('competition_entries')
      .select('id')
      .eq('competition_id', comp.id)
      .eq('user_id', user.id)
      .single()

    if (entry) {
      setAlreadyJoined(true)
      setLoading(false)
      return
    }

    const [{ data: assignments }, { data: teamsData }, { data: draft }] = await Promise.all([
      supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('tier_draft_picks').select('*').eq('competition_id', comp.id).eq('user_id', user.id).single()
    ])

    setTierAssignments(assignments ?? [])
    setTeams(teamsData ?? [])

    if (draft) {
      setTier1Pick(draft.tier1_team_id)
      setTier2Pick(draft.tier2_team_id)
      setTier3Pick(draft.tier3_team_id)
      setTier4Pick(draft.tier4_team_id)
    }

    setLoading(false)
  }

  async function handleJoin() {
    if (!tier1Pick || !tier2Pick || !tier3Pick || !tier4Pick) {
      setError('Please pick one team from each tier before joining')
      return
    }

    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: draftError } = await supabase
      .from('tier_draft_picks')
      .upsert({
        competition_id: competition!.id,
        user_id: user.id,
        tier1_team_id: tier1Pick,
        tier2_team_id: tier2Pick,
        tier3_team_id: tier3Pick,
        tier4_team_id: tier4Pick,
        locked: false
      }, { onConflict: 'competition_id,user_id' })

    if (draftError) {
      setError(draftError.message)
      setSaving(false)
      return
    }

    const { error: entryError } = await supabase
      .from('competition_entries')
      .insert({ competition_id: competition!.id, user_id: user.id })

    if (entryError) {
      setError(entryError.message)
      setSaving(false)
      return
    }

    window.location.href = '/picks'
  }

  const teamsInTier = (tier: number) =>
    teams.filter(t => tierAssignments.find(a => a.team_id === t.id && a.tier === tier))

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    )
  }

  if (!competition) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">No Active Competition</h1>
          <p className="text-gray-500">There is no active competition right now.</p>
        </div>
      </main>
    )
  }

  if (alreadyJoined) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Already Joined</h1>
          <p className="text-gray-500 mb-4">You are already entered in {competition.name}.</p>
          <a href="/picks" className="bg-black text-white rounded px-4 py-2 text-sm">Go to Picks</a>
        </div>
      </main>
    )
  }

  const tierLabels: Record<number, string> = {
    1: 'Elite',
    2: 'Solid',
    3: 'Mid-table',
    4: 'Underdogs'
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Join {competition.name}</h1>
        <p className="text-gray-500 mb-8">Before joining you must select one team from each tier that you can use twice during the competition. Choose carefully — these are locked after the first gameweek deadline.</p>

        <div className="space-y-6">
          {[1, 2, 3, 4].map(tier => {
            const selected = tier === 1 ? tier1Pick : tier === 2 ? tier2Pick : tier === 3 ? tier3Pick : tier4Pick
            const setSelected = tier === 1 ? setTier1Pick : tier === 2 ? setTier2Pick : tier === 3 ? setTier3Pick : setTier4Pick

            return (
              <div key={tier} className="bg-white border rounded-lg p-6">
                <h2 className="font-bold mb-1">Tier {tier} — {tierLabels[tier]}</h2>
                <p className="text-sm text-gray-500 mb-4">Pick one team you can use twice</p>
                <div className="grid grid-cols-2 gap-2">
                  {teamsInTier(tier).map(team => (
                    <button
                      key={team.id}
                      onClick={() => setSelected(team.id)}
                      className={`text-left px-3 py-2 rounded border text-sm transition-colors ${
                        selected === team.id
                          ? 'bg-black text-white border-black'
                          : 'hover:border-black'
                      }`}
                    >
                      {team.name}
                    </button>
                  ))}
                  {teamsInTier(tier).length === 0 && (
                    <p className="text-sm text-gray-400 col-span-2">No teams assigned to this tier yet. Ask the admin to set up quartiles first.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={saving || !tier1Pick || !tier2Pick || !tier3Pick || !tier4Pick}
          className="mt-6 w-full bg-black text-white rounded-lg px-4 py-3 font-medium disabled:opacity-50"
        >
          {saving ? 'Joining...' : 'Complete Tier Draft & Join Competition'}
        </button>
      </div>
    </main>
  )
}