'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { abbrFromMap } from '../../lib/teams'

type PickRow = {
  id: string
  user_id: string
  team_id: number
  player1_id: number
  player2_id: number
  is_banker: boolean
  is_autopick: boolean
  submitted_at: string
  question_answer: string | null
}

type Gameweek = {
  id: string
  number: number
  deadline: string
  status: string
}

export default function AdminSummaryPage() {
  const [competition, setCompetition] = useState<any>(null)
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([])
  const [selectedGw, setSelectedGw] = useState<string>('')
  const [picks, setPicks] = useState<PickRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [teams, setTeams] = useState<Record<number, { name: string; short_name: string | null }>>({})
  const [players, setPlayers] = useState<Record<number, string>>({})
  const [quartileMap, setQuartileMap] = useState<Record<number, number>>({})
  const [question, setQuestion] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPicks, setLoadingPicks] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (selectedGw) loadPicksForGw(selectedGw) }, [selectedGw])

  async function loadBase() {
    const { data: comp } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('status', 'active')
      .single()

    if (!comp) { setLoading(false); return }
    setCompetition(comp)

    const [{ data: gws }, { data: teamsData }, { data: playersData }, { data: quartilesData }] = await Promise.all([
      supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id).order('number', { ascending: false }),
      supabase.from('teams').select('id, name, short_name'),
      supabase.from('players').select('id, name'),
      supabase.from('tier_assignments').select('team_id, tier').eq('competition_id', comp.id)
    ])

    const teamMap: Record<number, { name: string; short_name: string | null }> = {}
    teamsData?.forEach(t => { teamMap[t.id] = { name: t.name, short_name: t.short_name } })
    setTeams(teamMap)

    const playerMap: Record<number, string> = {}
    playersData?.forEach(p => { playerMap[p.id] = p.name })
    setPlayers(playerMap)

    const qMap: Record<number, number> = {}
    quartilesData?.forEach(q => { qMap[q.team_id] = q.tier })
    setQuartileMap(qMap)

    setGameweeks(gws ?? [])
    if (gws && gws.length > 0) setSelectedGw(gws[0].id)

    setLoading(false)
  }

  async function loadPicksForGw(gwId: string) {
    setLoadingPicks(true)

    const [{ data: picksData }, { data: profilesData }, { data: questionData }] = await Promise.all([
      supabase.from('picks').select('id, user_id, team_id, player1_id, player2_id, is_banker, is_autopick, submitted_at, question_answer').eq('gameweek_id', gwId),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('gameweek_questions').select('*').eq('gameweek_id', gwId).single()
    ])

    const profileMap: Record<string, string> = {}
    profilesData?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })
    setProfiles(profileMap)
    setPicks(picksData ?? [])
    setQuestion(questionData ?? null)

    setLoadingPicks(false)
  }

  const selectedGameweek = gameweeks.find(g => g.id === selectedGw)
  const deadlinePassed = selectedGameweek ? new Date() > new Date(selectedGameweek.deadline) : false

  function getDeadlineProximity(submittedAt: string) {
    if (!selectedGameweek || !submittedAt) return null
    const submitted = new Date(submittedAt).getTime()
    const deadline = new Date(selectedGameweek.deadline).getTime()
    const diffMins = (deadline - submitted) / (1000 * 60)
    if (diffMins < 60) return { label: '🕐 Last Minute', title: 'Submitted less than 1 hour before deadline' }
    return null
  }

  function getBoldestPick(): PickRow | null {
    let boldest: PickRow | null = null
    let highestQ = -1
    picks.forEach(pick => {
      const q = quartileMap[pick.team_id] ?? 0
      if (q > highestQ) { highestQ = q; boldest = pick }
    })
    return boldest
  }

  function getSafestPick(): PickRow | null {
    let safest: PickRow | null = null
    let lowestQ = 99
    picks.forEach(pick => {
      const q = quartileMap[pick.team_id] ?? 99
      if (q < lowestQ) { lowestQ = q; safest = pick }
    })
    return safest
  }

  function getContrarianPicks(): PickRow[] {
    const teamCounts: Record<number, number> = {}
    picks.forEach(p => { teamCounts[p.team_id] = (teamCounts[p.team_id] || 0) + 1 })
    return picks.filter(p => teamCounts[p.team_id] === 1)
  }

  function getEarliestPick(): PickRow | null {
    if (picks.length === 0) return null
    return picks.reduce((earliest, pick) => {
      if (!pick.submitted_at) return earliest
      if (!earliest.submitted_at) return pick
      return new Date(pick.submitted_at) < new Date(earliest.submitted_at) ? pick : earliest
    })
  }

  function getQuestionResults() {
    if (!question) return null
    const counts: Record<string, number> = {}
    picks.forEach(p => {
      if (p.question_answer) {
        counts[p.question_answer] = (counts[p.question_answer] || 0) + 1
      }
    })
    return counts
  }

  const boldest = getBoldestPick()
  const safest = getSafestPick()
  const contrarians = getContrarianPicks()
  const earliest = getEarliestPick()
  const questionResults = getQuestionResults()

  const sortedPicks = [...picks].sort((a, b) => {
    const nameA = profiles[a.user_id] ?? ''
    const nameB = profiles[b.user_id] ?? ''
    return nameA.localeCompare(nameB)
  })

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>
  if (!competition) return <div className="p-8 text-gray-500">No active competition.</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Gameweek Summary</h1>
      <p className="text-gray-500 text-sm mb-6">{competition.name} — shareable pick grid</p>

      <div className="mb-6">
        <select
          value={selectedGw}
          onChange={e => setSelectedGw(e.target.value)}
          className="border rounded px-3 py-2 text-sm font-bold bg-white w-full md:w-auto"
        >
          {gameweeks.map(gw => (
            <option key={gw.id} value={gw.id}>
              Gameweek {gw.number} — {gw.status === 'completed' ? 'Scored' : new Date() > new Date(gw.deadline) ? 'Deadline passed' : 'Open'}
            </option>
          ))}
        </select>
      </div>

      {!deadlinePassed ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
          Deadline has not passed yet — picks are still private.
        </div>
      ) : loadingPicks ? (
        <p className="text-gray-400 text-sm">Loading picks...</p>
      ) : picks.length === 0 ? (
        <div className="bg-white border rounded-lg p-6">
          <p className="text-gray-400 text-sm">No picks for this gameweek.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border-2 border-black rounded-xl overflow-hidden mb-6">

            <div className="bg-black text-white px-6 py-4">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">The Coupon</p>
              <p className="text-xl font-bold uppercase tracking-wider">Gameweek {selectedGameweek?.number} — All Picks</p>
              <p className="text-xs text-gray-400 mt-1">{competition.name}</p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Player 1</th>
                  <th className="py-3 px-4">Player 2</th>
                  <th className="py-3 px-4">Flags</th>
                  <th className="py-3 px-4">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {sortedPicks.map(pick => {
                  const isBoldest = boldest?.id === pick.id
                  const isSafest = safest?.id === pick.id && !isBoldest
                  const isContrarian = contrarians.some(c => c.id === pick.id)
                  const isEarliest = earliest?.id === pick.id
                  const proximity = getDeadlineProximity(pick.submitted_at)

                  return (
                    <tr key={pick.id} className={`border-b last:border-0 ${pick.is_autopick ? 'opacity-50' : ''}`}>
                      <td className="py-3 px-4 font-bold uppercase">
                        {profiles[pick.user_id] ?? 'Unknown'}
                      </td>
                      <td className="py-3 px-4 uppercase">
                        {abbrFromMap(teams, pick.team_id)}
                        {pick.is_banker && <span className="ml-1 bg-yellow-400 text-black text-xs font-bold px-1 rounded">★B</span>}
                        {pick.is_autopick && <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-1 rounded">AUTO</span>}
                      </td>
                      <td className="py-3 px-4 text-gray-600 uppercase text-xs">{players[pick.player1_id] ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-600 uppercase text-xs">{players[pick.player2_id] ?? '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 flex-wrap">
                          {isBoldest && <span title="Boldest Pick — highest quartile underdog">🎲</span>}
                          {isSafest && <span title="Safe Hands — lowest risk pick">🛡️</span>}
                          {isContrarian && <span title="Contrarian — only player to pick this team">🦄</span>}
                          {isEarliest && <span title="Early Bird — first to submit">⏰</span>}
                          {proximity && <span title={proximity.title}>{proximity.label}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">
                        {pick.submitted_at ? new Date(pick.submitted_at).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="px-6 py-4 border-t bg-gray-50">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Key</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                <span>🎲 Boldest Pick — highest quartile underdog</span>
                <span>🛡️ Safe Hands — lowest risk pick</span>
                <span>🦄 Contrarian — only player to pick this team</span>
                <span>⏰ Early Bird — first to submit</span>
                <span>🕐 Last Minute — submitted within 1 hour of deadline</span>
                <span>★B — Banker declared</span>
                <span>AUTO — Autopicked</span>
              </div>
            </div>
          </div>

          {question && questionResults && (
            <div className="bg-white border rounded-xl overflow-hidden mb-6">
              <div className="bg-gray-900 text-white px-6 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-0.5">This Week's Question</p>
                <p className="font-bold">{question.question}</p>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {[
                    { key: 'A', label: question.option_a },
                    { key: 'B', label: question.option_b },
                    question.option_c ? { key: 'C', label: question.option_c } : null,
                    question.option_d ? { key: 'D', label: question.option_d } : null,
                  ].filter(Boolean).map((opt: any) => {
                    const count = questionResults[opt.key] ?? 0
                    const total = Object.values(questionResults).reduce((a: any, b: any) => a + b, 0)
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <div key={opt.key}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-gray-500">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-black rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {picks.filter(p => p.question_answer === opt.key).map(p => profiles[p.user_id]).join(', ')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-xl p-6 mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Pick Stats</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Total Picks</p>
                <p className="font-bold text-lg">{picks.length}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Bankers</p>
                <p className="font-bold text-lg">{picks.filter(p => p.is_banker).length}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Autopicks</p>
                <p className="font-bold text-lg">{picks.filter(p => p.is_autopick).length}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">Unique Teams</p>
                <p className="font-bold text-lg">{new Set(picks.map(p => p.team_id)).size}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}