'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { buildPlayerDisplayNames } from '../../lib/players'

type Option = { id: string; label: string }
type Team = { id: number; name: string; short_name: string | null; short_code: string | null }
type Player = { id: number; name: string; web_name: string | null; team_id: number }
type Pick = { user_id: string; gameweek_id: string; team_id: number; player1_id: number; player2_id: number; is_banker: boolean }

export default function EditPickPage() {
  const [loading, setLoading] = useState(true)
  const [competitionId, setCompetitionId] = useState<string>('')
  const [users, setUsers] = useState<Option[]>([])
  const [gameweeks, setGameweeks] = useState<Option[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [existingPicks, setExistingPicks] = useState<Record<string, Pick>>({})

  const [userId, setUserId] = useState('')
  const [gameweekId, setGameweekId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [player1Id, setPlayer1Id] = useState('')
  const [player2Id, setPlayer2Id] = useState('')
  const [isBanker, setIsBanker] = useState(false)
  const [playerSearch1, setPlayerSearch1] = useState('')
  const [playerSearch2, setPlayerSearch2] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').single()
    if (!comp) { setLoading(false); return }
    setCompetitionId(comp.id)

    const [{ data: entries }, { data: profiles }, { data: gws }, { data: teamsData }, { data: playersData }, { data: picks }] = await Promise.all([
      supabase.from('competition_entries').select('user_id').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id).order('number'),
      supabase.from('teams').select('id, name, short_name, short_code').eq('active', true).order('name'),
      supabase.from('players').select('id, name, web_name, team_id'),
      supabase.from('picks').select('user_id, gameweek_id, team_id, player1_id, player2_id, is_banker').eq('competition_id', comp.id),
    ])

    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    setUsers(
      (entries ?? [])
        .map(e => ({ id: e.user_id, label: profileMap[e.user_id] ?? 'Unknown' }))
        .sort((a, b) => a.label.localeCompare(b.label))
    )
    setGameweeks((gws ?? []).map(g => ({ id: g.id, label: `Gameweek ${g.number}` })))
    setTeams(teamsData ?? [])
    setPlayers(playersData ?? [])

    const pickMap: Record<string, Pick> = {}
    picks?.forEach(p => { pickMap[`${p.user_id}_${p.gameweek_id}`] = p })
    setExistingPicks(pickMap)

    setLoading(false)
  }

  const teamMap: Record<number, Team> = {}
  teams.forEach(t => { teamMap[t.id] = t })
  const displayNames = buildPlayerDisplayNames(players, teamMap)

  useEffect(() => {
    if (!userId || !gameweekId) return
    const existing = existingPicks[`${userId}_${gameweekId}`]
    if (existing) {
      setTeamId(String(existing.team_id))
      setPlayer1Id(String(existing.player1_id))
      setPlayer2Id(String(existing.player2_id))
      setIsBanker(existing.is_banker)
      setMessage('This user already has a pick for this gameweek — editing it below.')
    } else {
      setTeamId('')
      setPlayer1Id('')
      setPlayer2Id('')
      setIsBanker(false)
      setMessage('')
    }
  }, [userId, gameweekId])

  const filteredPlayers1 = playerSearch1.length >= 2
    ? players.filter(p => p.name.toLowerCase().includes(playerSearch1.toLowerCase())).slice(0, 8)
    : []
  const filteredPlayers2 = playerSearch2.length >= 2
    ? players.filter(p => p.name.toLowerCase().includes(playerSearch2.toLowerCase())).slice(0, 8)
    : []

  async function save() {
    if (!userId || !gameweekId || !teamId || !player1Id || !player2Id) {
      setMessage('Please fill in every field before saving.')
      return
    }
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/admin/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        gameweek_id: gameweekId,
        competition_id: competitionId,
        team_id: Number(teamId),
        player1_id: Number(player1Id),
        player2_id: Number(player2Id),
        is_banker: isBanker,
      })
    })
    const data = await res.json()
    if (data.error) {
      setMessage('Error: ' + data.error)
    } else {
      setMessage('Saved.')
      loadData()
    }
    setSaving(false)
  }

  if (loading) return <p className="text-gray-500">Loading...</p>
  if (!competitionId) return <p className="text-gray-500">No active competition.</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Manually Add / Edit a Pick</h1>
      <p className="text-gray-500 text-sm mb-8">
        For fixing mistakes or entering a pick on someone&apos;s behalf. This ignores the normal deadline lock and
        the usual &quot;already used that team/player&quot; rules — double-check what you&apos;re entering.
      </p>

      <div className="bg-white border rounded-lg p-6 max-w-xl space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Player</label>
          <select value={userId} onChange={e => setUserId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
            <option value="">Select a player...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Gameweek</label>
          <select value={gameweekId} onChange={e => setGameweekId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
            <option value="">Select a gameweek...</option>
            {gameweeks.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Team</label>
          <select value={teamId} onChange={e => setTeamId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
            <option value="">Select a team...</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.short_name ?? t.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Player 1</label>
            {player1Id ? (
              <div className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                <span>{displayNames[Number(player1Id)] ?? '?'}</span>
                <button type="button" onClick={() => setPlayer1Id('')} className="text-xs text-red-500">✕</button>
              </div>
            ) : (
              <>
                <input
                  type="text" value={playerSearch1} onChange={e => setPlayerSearch1(e.target.value)}
                  placeholder="Search players..." className="border rounded px-3 py-2 text-sm w-full"
                />
                {filteredPlayers1.length > 0 && (
                  <div className="border rounded mt-1 divide-y max-h-40 overflow-y-auto">
                    {filteredPlayers1.map(p => (
                      <button key={p.id} type="button" onClick={() => { setPlayer1Id(String(p.id)); setPlayerSearch1('') }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        {displayNames[p.id] ?? p.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Player 2</label>
            {player2Id ? (
              <div className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                <span>{displayNames[Number(player2Id)] ?? '?'}</span>
                <button type="button" onClick={() => setPlayer2Id('')} className="text-xs text-red-500">✕</button>
              </div>
            ) : (
              <>
                <input
                  type="text" value={playerSearch2} onChange={e => setPlayerSearch2(e.target.value)}
                  placeholder="Search players..." className="border rounded px-3 py-2 text-sm w-full"
                />
                {filteredPlayers2.length > 0 && (
                  <div className="border rounded mt-1 divide-y max-h-40 overflow-y-auto">
                    {filteredPlayers2.map(p => (
                      <button key={p.id} type="button" onClick={() => { setPlayer2Id(String(p.id)); setPlayerSearch2('') }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        {displayNames[p.id] ?? p.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isBanker} onChange={e => setIsBanker(e.target.checked)} />
          Banker
        </label>

        {message && (
          <p className={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-gray-600'}`}>{message}</p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="bg-black text-white rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Pick'}
        </button>
      </div>
    </div>
  )
}
