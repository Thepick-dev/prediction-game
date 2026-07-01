'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

type Team = { id: number; name: string }
type Competition = { id: string; name: string; status: string }
type DraftTier = { tier_number: number; tier_name: string }
type DraftTierAssignment = { team_id: number; tier_number: number }

export default function JoinPage() {
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [tiers, setTiers] = useState<DraftTier[]>([])
  const [assignments, setAssignments] = useState<DraftTierAssignment[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<Record<number, number>>({})
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

    const [{ data: tiersData }, { data: assignmentsData }, { data: teamsData }, { data: existingPicks }] = await Promise.all([
      supabase.from('competition_draft_tiers').select('tier_number, tier_name').eq('competition_id', comp.id).order('tier_number'),
      supabase.from('draft_tier_assignments').select('team_id, tier_number').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('draft_picks').select('tier_number, team_id').eq('competition_id', comp.id).eq('user_id', user.id)
    ])

    setTiers(tiersData ?? [])
    setAssignments(assignmentsData ?? [])
    setTeams(teamsData ?? [])

    if (existingPicks && existingPicks.length > 0) {
      const pickMap: Record<number, number> = {}
      existingPicks.forEach(p => { pickMap[p.tier_number] = p.team_id })
      setPicks(pickMap)
    }

    setLoading(false)
  }

  async function handleJoin() {
    const allTiersPicked = tiers.every(t => picks[t.tier_number])
    if (!allTiersPicked) {
      setError('Please pick one team from each tier before joining')
      return
    }

    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const pickRows = Object.entries(picks).map(([tier_number, team_id]) => ({
      competition_id: competition!.id,
      user_id: user.id,
      tier_number: parseInt(tier_number),
      team_id
    }))

    for (const row of pickRows) {
      const { error: pickError } = await supabase
        .from('draft_picks')
        .upsert(row, { onConflict: 'competition_id,user_id,tier_number' })

      if (pickError) {
        setError(pickError.message)
        setSaving(false)
        return
      }
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

  const teamsInTier = (tierNumber: number) =>
    teams.filter(t => assignments.find(a => a.team_id === t.id && a.tier_number === tierNumber))

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

  if (tiers.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Draft Tiers Not Set Up</h1>
          <p className="text-gray-500">The admin hasn't set up the draft tiers yet. Check back soon.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Join {competition.name}</h1>
        <p className="text-gray-500 mb-8">Before joining you must select one team from each tier that you can use twice during the competition. Choose carefully — these are locked after the first gameweek deadline.</p>

        <div className="space-y-6">
          {tiers.map(tier => (
            <div key={tier.tier_number} className="bg-white border rounded-lg p-6">
              <h2 className="font-bold mb-1">Tier {tier.tier_number} — {tier.tier_name}</h2>
              <p className="text-sm text-gray-500 mb-4">Pick one team you can use twice</p>
              <div className="grid grid-cols-2 gap-2">
                {teamsInTier(tier.tier_number).map(team => (
                  <button
                    key={team.id}
                    onClick={() => setPicks(prev => ({ ...prev, [tier.tier_number]: team.id }))}
                    className={`text-left px-3 py-2 rounded border text-sm transition-colors ${
                      picks[tier.tier_number] === team.id
                        ? 'bg-black text-white border-black'
                        : 'hover:border-black'
                    }`}
                  >
                    {team.name}
                  </button>
                ))}
                {teamsInTier(tier.tier_number).length === 0 && (
                  <p className="text-sm text-gray-400 col-span-2">No teams assigned to this tier yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={saving || !tiers.every(t => picks[t.tier_number])}
          className="mt-6 w-full bg-black text-white rounded-lg px-4 py-3 font-medium disabled:opacity-50"
        >
          {saving ? 'Joining...' : 'Complete Tier Draft & Join Competition'}
        </button>
      </div>
    </main>
  )
}