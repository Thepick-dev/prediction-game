'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../../lib/players'

type Option = { id: string; label: string }
type Team = { id: number; name: string; short_name: string | null; short_code: string | null }
type Player = { id: number; name: string; web_name: string | null; team_id: number }
type Pick = { user_id: string; gameweek_id: string; team_id: number; player1_id: number; player2_id: number; is_banker: boolean }
type AoNRow = { gameweek_id: string; player_id: number }
type BonusCardRow = { gameweek_id: string; player_id: number }

export default function EditPickPage() {
  const [loading, setLoading] = useState(true)
  const [competitionId, setCompetitionId] = useState<string>('')
  const [users, setUsers] = useState<Option[]>([])
  const [gameweeks, setGameweeks] = useState<Option[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [existingPicks, setExistingPicks] = useState<Record<string, Pick>>({})
  const [bonusCardEnabled, setBonusCardEnabled] = useState(false)
  const [bonusCardName, setBonusCardName] = useState('Bonus Card')
  const [bonusCardPlayerId, setBonusCardPlayerId] = useState<number | null>(null)

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

  // All or Nothing / Bonus Card — 'none' | 'player1' | 'player2' so the
  // radio can directly reflect which of the two picks (if either) the
  // nomination is on. Both are scoped to the WHOLE competition (at most
  // one row ever, not per gameweek), so "elsewhere" tracks a nomination
  // that exists on a different gameweek — shown but not editable here,
  // since moving it isn't what this control does.
  const [aonChoice, setAonChoice] = useState<'none' | 'player1' | 'player2'>('none')
  const [aonElsewhereGw, setAonElsewhereGw] = useState<number | null>(null)
  const [playBonusCard, setPlayBonusCard] = useState(false)
  const [bonusCardElsewhereGw, setBonusCardElsewhereGw] = useState<number | null>(null)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const [aonByUser, setAonByUser] = useState<Record<string, AoNRow>>({})
  const [bonusCardByUser, setBonusCardByUser] = useState<Record<string, BonusCardRow>>({})
  const [gwNumberById, setGwNumberById] = useState<Record<string, number>>({})
  const [gwDeadlineById, setGwDeadlineById] = useState<Record<string, string>>({})

  async function loadData() {
    const { data: comp } = await supabase.from('competitions').select('id, bonus_card_enabled, bonus_card_name, bonus_card_player_id').eq('status', 'active').single()
    if (!comp) { setLoading(false); return }
    setCompetitionId(comp.id)
    setBonusCardEnabled(!!comp.bonus_card_enabled && comp.bonus_card_player_id != null)
    setBonusCardPlayerId(comp.bonus_card_player_id ?? null)

    const [{ data: entries }, { data: profiles }, { data: gws }, { data: teamsData }, { data: playersData }, aonAndBonusCardRes] = await Promise.all([
      supabase.from('competition_entries').select('user_id').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('gameweeks').select('id, number, deadline').eq('competition_id', comp.id).order('number'),
      supabase.from('teams').select('id, name, short_name, short_code').eq('active', true).order('name'),
      supabase.from('players').select('id, name, web_name, team_id'),
      // These two are RLS-scoped to "own row only" — the admin's regular
      // session can't read another user's row directly, so they're fetched
      // via a service-role-backed API route instead (same pattern as the
      // write side in save()/api/admin/picks).
      fetch(`/api/admin/picks?competition_id=${comp.id}`).then(r => r.json()).catch(() => ({ aonRows: [], bonusCardRows: [] })),
    ])
    const aonRows = aonAndBonusCardRes.aonRows as { user_id: string; gameweek_id: string; player_id: number }[] | undefined
    const bonusCardRows = aonAndBonusCardRes.bonusCardRows as { user_id: string; gameweek_id: string; player_id: number }[] | undefined

    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    setUsers(
      (entries ?? [])
        .map(e => ({ id: e.user_id, label: profileMap[e.user_id] ?? 'Unknown' }))
        .sort((a, b) => a.label.localeCompare(b.label))
    )
    const gwMap: Record<string, number> = {}
    const gwDeadlineMap: Record<string, string> = {}
    gws?.forEach(g => { gwMap[g.id] = g.number; gwDeadlineMap[g.id] = g.deadline })
    setGwNumberById(gwMap)
    setGwDeadlineById(gwDeadlineMap)
    setGameweeks((gws ?? []).map(g => ({ id: g.id, label: `Gameweek ${g.number}` })))
    setTeams(teamsData ?? [])
    setPlayers(playersData ?? [])
    setBonusCardName(bonusCardDisplayName(comp.bonus_card_name, playersData?.find(p => p.id === comp.bonus_card_player_id)?.name ?? null))

    // Same hard rule as everywhere else on the site — a pre-deadline pick's
    // actual content never reaches the browser at all, not just "isn't
    // shown". Split into two queries rather than one unfiltered fetch:
    // content only for gameweeks whose deadline has already passed, and a
    // presence-only fetch (no team/player columns) for every gameweek so
    // "this user already has a pick" can still be detected pre-deadline.
    const pastDeadlineGwIds = (gws ?? []).filter(g => new Date(g.deadline) < new Date()).map(g => g.id)
    const [{ data: revealedPicks }, { data: presenceRows }] = await Promise.all([
      pastDeadlineGwIds.length
        ? supabase.from('picks').select('user_id, gameweek_id, team_id, player1_id, player2_id, is_banker').eq('competition_id', comp.id).in('gameweek_id', pastDeadlineGwIds)
        : Promise.resolve({ data: [] as Pick[] }),
      supabase.from('picks').select('user_id, gameweek_id').eq('competition_id', comp.id),
    ])

    const pickMap: Record<string, Pick> = {}
    revealedPicks?.forEach(p => { pickMap[`${p.user_id}_${p.gameweek_id}`] = p })
    presenceRows?.forEach(p => {
      const key = `${p.user_id}_${p.gameweek_id}`
      // A presence-only stand-in when the real content was withheld — team/
      // player fields are never actually used while a row looks like this;
      // the prefill effect below checks the deadline itself before ever
      // reading them.
      if (!pickMap[key]) pickMap[key] = { user_id: p.user_id, gameweek_id: p.gameweek_id, team_id: 0, player1_id: 0, player2_id: 0, is_banker: false }
    })
    setExistingPicks(pickMap)

    const aonMap: Record<string, AoNRow> = {}
    aonRows?.forEach(a => { aonMap[a.user_id] = { gameweek_id: a.gameweek_id, player_id: a.player_id } })
    setAonByUser(aonMap)

    const bonusCardMap: Record<string, BonusCardRow> = {}
    bonusCardRows?.forEach(b => { bonusCardMap[b.user_id] = { gameweek_id: b.gameweek_id, player_id: b.player_id } })
    setBonusCardByUser(bonusCardMap)

    setLoading(false)
  }

  const teamMap: Record<number, Team> = {}
  teams.forEach(t => { teamMap[t.id] = t })
  const displayNames = buildPlayerDisplayNames(players, teamMap)

  useEffect(() => {
    if (!userId || !gameweekId) return
    const existing = existingPicks[`${userId}_${gameweekId}`]

    const aon = aonByUser[userId]
    if (aon && aon.gameweek_id === gameweekId && existing) {
      setAonChoice(aon.player_id === existing.player1_id ? 'player1' : aon.player_id === existing.player2_id ? 'player2' : 'none')
      setAonElsewhereGw(null)
    } else if (aon) {
      setAonChoice('none')
      setAonElsewhereGw(gwNumberById[aon.gameweek_id] ?? null)
    } else {
      setAonChoice('none')
      setAonElsewhereGw(null)
    }

    const bc = bonusCardByUser[userId]
    if (bc && bc.gameweek_id === gameweekId) {
      setPlayBonusCard(true)
      setBonusCardElsewhereGw(null)
    } else if (bc) {
      setPlayBonusCard(false)
      setBonusCardElsewhereGw(gwNumberById[bc.gameweek_id] ?? null)
    } else {
      setPlayBonusCard(false)
      setBonusCardElsewhereGw(null)
    }

    // Same hard rule as everywhere else on the site — nobody, admin
    // included, sees what a pick actually was before that gameweek's
    // deadline passes. Below the deadline, this deliberately does NOT
    // prefill from `existing` even though it's sitting right there in
    // memory: admin can still type in a fresh pick and save() will
    // overwrite whatever's already there, just without ever displaying it.
    const deadline = gwDeadlineById[gameweekId]
    const deadlinePassed = deadline ? new Date(deadline) < new Date() : false

    if (existing && deadlinePassed) {
      setTeamId(String(existing.team_id))
      setPlayer1Id(String(existing.player1_id))
      setPlayer2Id(String(existing.player2_id))
      setIsBanker(existing.is_banker)
      setMessage('This user already has a pick for this gameweek — editing it below.')
    } else if (existing) {
      setTeamId('')
      setPlayer1Id('')
      setPlayer2Id('')
      setIsBanker(false)
      setMessage("This user already has a pick for this gameweek, but it's hidden until the deadline passes — entering one below will overwrite it.")
    } else {
      setTeamId('')
      setPlayer1Id('')
      setPlayer2Id('')
      setIsBanker(false)
      setMessage('')
    }
  }, [userId, gameweekId, gwDeadlineById])

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
        all_or_nothing_player_id: aonChoice === 'player1' ? Number(player1Id) : aonChoice === 'player2' ? Number(player2Id) : null,
        play_bonus_card: playBonusCard,
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

        <div>
          <label className="block text-xs font-medium mb-1">All or Nothing</label>
          {aonElsewhereGw != null ? (
            <p className="text-xs text-amber-600">
              Already nominated on Gameweek {aonElsewhereGw} — clear it there first if it needs to move.
            </p>
          ) : (
            <select
              value={aonChoice}
              onChange={e => setAonChoice(e.target.value as 'none' | 'player1' | 'player2')}
              disabled={!player1Id || !player2Id}
              className="border rounded px-3 py-2 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="none">Not played</option>
              {player1Id && <option value="player1">{displayNames[Number(player1Id)] ?? 'Player 1'} (Player 1)</option>}
              {player2Id && <option value="player2">{displayNames[Number(player2Id)] ?? 'Player 2'} (Player 2)</option>}
            </select>
          )}
        </div>

        {bonusCardEnabled && (
          <div>
            <label className="block text-xs font-medium mb-1">{bonusCardName}</label>
            {bonusCardElsewhereGw != null ? (
              <p className="text-xs text-amber-600">
                Already played on Gameweek {bonusCardElsewhereGw} — clear it there first if it needs to move.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={playBonusCard}
                  onChange={e => setPlayBonusCard(e.target.checked)}
                  disabled={bonusCardPlayerId != null && (bonusCardPlayerId === Number(player1Id) || bonusCardPlayerId === Number(player2Id))}
                />
                Played {bonusCardName}
                {bonusCardPlayerId != null && (bonusCardPlayerId === Number(player1Id) || bonusCardPlayerId === Number(player2Id)) && (
                  <span className="text-xs text-amber-600">— can't play it on a player already picked this gameweek</span>
                )}
              </label>
            )}
          </div>
        )}

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
