'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

type Team = { id: number; name: string }
type Player = { id: number; name: string; position: string; team_id: number }
type Gameweek = { id: string; number: number; deadline: string; status: string; competition_id: string }
type Competition = { id: string; name: string; status: string }

export default function PicksPage() {
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [gameweek, setGameweek] = useState<Gameweek | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [usedTeams, setUsedTeams] = useState<number[]>([])
  const [playerCounts, setPlayerCounts] = useState<Record<number, number>>({})
  const [doubleUseTeams, setDoubleUseTeams] = useState<number[]>([])
  const [bankersUsed, setBankersUsed] = useState(0)
  const [currentPick, setCurrentPick] = useState<any>(null)
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null)
  const [selectedPlayer1, setSelectedPlayer1] = useState<number | null>(null)
  const [selectedPlayer2, setSelectedPlayer2] = useState<number | null>(null)
  const [isBanker, setIsBanker] = useState(false)
  const [player1Search, setPlayer1Search] = useState('')
  const [player2Search, setPlayer2Search] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [notJoined, setNotJoined] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

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

    if (!entry) {
      setNotJoined(true)
      setLoading(false)
      return
    }

    const now = new Date()
    const { data: gw } = await supabase
      .from('gameweeks')
      .select('*')
      .eq('competition_id', comp.id)
      .in('status', ['open', 'upcoming'])
      .gte('deadline', now.toISOString())
      .order('number', { ascending: true })
      .limit(1)
      .single()

    if (!gw) {
      setLoading(false)
      return
    }

    setGameweek(gw)

    const locked = new Date() > new Date(gw.deadline) || gw.status === 'locked'
    setIsLocked(locked)

    const [{ data: teamsData }, { data: playersData }] = await Promise.all([
      supabase.from('teams').select('id, name').order('name'),
      supabase.from('players').select('id, name, position, team_id').order('name')
    ])

    setTeams(teamsData ?? [])
    setPlayers(playersData ?? [])

    const res = await fetch(`/api/picks?competition_id=${comp.id}&gameweek_id=${gw.id}`)
    const data = await res.json()

    if (data.pick) {
      setCurrentPick(data.pick)
      setSelectedTeam(data.pick.team_id)
      setSelectedPlayer1(data.pick.player1_id)
      setSelectedPlayer2(data.pick.player2_id)
      setIsBanker(data.pick.is_banker ?? false)
    }

    setUsedTeams(data.usedTeams ?? [])
    setPlayerCounts(data.playerCounts ?? {})
    setDoubleUseTeams(data.doubleUseTeams ?? [])
    setBankersUsed(data.bankersUsed ?? 0)

    setLoading(false)
  }

  async function savePick() {
    if (!selectedTeam || !selectedPlayer1 || !selectedPlayer2) {
      setError('Please select a team and two players')
      return
    }
    if (selectedPlayer1 === selectedPlayer2) {
      setError('Please select two different players')
      return
    }

    setSaving(true)
    setError('')

    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameweek_id: gameweek!.id,
        competition_id: competition!.id,
        team_id: selectedTeam,
        player1_id: selectedPlayer1,
        player2_id: selectedPlayer2,
        is_banker: isBanker
      })
    })

    const data = await res.json()

    if (data.error) {
      setError(data.error)
    } else {
      setSuccess(true)
      await loadData()
    }

    setSaving(false)
  }

  const filteredPlayer1 = players.filter(p =>
    p.name.toLowerCase().includes(player1Search.toLowerCase()) &&
    p.id !== selectedPlayer2
  )

  const filteredPlayer2 = players.filter(p =>
    p.name.toLowerCase().includes(player2Search.toLowerCase()) &&
    p.id !== selectedPlayer1
  )

  const getTeamName = (id: number) => teams.find(t => t.id === id)?.name ?? ''
  const getPlayerName = (id: number) => players.find(p => p.id === id)?.name ?? ''
  const bankersRemaining = 2 - bankersUsed

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

  if (notJoined) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Not Joined</h1>
          <p className="text-gray-500 mb-4">You need to join the competition before making picks.</p>
          <a href="/join" className="bg-black text-white rounded px-4 py-2 text-sm">Join Competition</a>
        </div>
      </main>
    )
  }

  if (!gameweek) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">No Open Gameweek</h1>
          <p className="text-gray-500">There is no gameweek open for picks right now.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl font-bold">{competition.name}</h1>
          <p className="text-gray-500">Gameweek {gameweek.number} — Deadline: {new Date(gameweek.deadline).toLocaleString()}</p>
        </div>

        {currentPick && !success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="font-medium text-green-800 mb-1">
              Current Pick {currentPick.is_banker && <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">BANKER</span>}
            </div>
            <div className="text-sm text-green-700">
              Team: {getTeamName(currentPick.team_id)} · Players: {getPlayerName(currentPick.player1_id)} & {getPlayerName(currentPick.player2_id)}
            </div>
            {!isLocked && <div className="text-xs text-green-600 mt-1">You can update your pick until the deadline.</div>}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="font-medium text-green-800">Pick saved successfully!</div>
          </div>
        )}

        {isLocked ? (
          <div className="bg-gray-100 border rounded-lg p-6 text-center">
            <div className="font-bold mb-1">Picks are locked</div>
            <div className="text-sm text-gray-500">The deadline for Gameweek {gameweek.number} has passed.</div>
          </div>
        ) : (
          <div className="space-y-6">

            <div className="bg-white border rounded-lg p-6">
              <h2 className="font-bold mb-4">Pick Your Team</h2>
              <div className="grid grid-cols-2 gap-2">
                {teams.map(team => {
                  const isUsed = usedTeams.includes(team.id) && team.id !== currentPick?.team_id
                  const isDoubleUse = doubleUseTeams.includes(team.id)
                  return (
                    <button
                      key={team.id}
                      onClick={() => !isUsed && setSelectedTeam(team.id)}
                      disabled={isUsed}
                      className={`text-left px-3 py-2 rounded border text-sm transition-colors ${
                        selectedTeam === team.id
                          ? 'bg-black text-white border-black'
                          : isUsed
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                          : 'hover:border-black'
                      }`}
                    >
                      {team.name}
                      {isDoubleUse && !isUsed && <span className="ml-1 text-xs opacity-60">★</span>}
                      {isUsed && <span className="ml-1 text-xs">(used)</span>}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3">★ = your tier pick (can use twice)</p>
            </div>

            <div className="bg-white border rounded-lg p-6">
              <h2 className="font-bold mb-4">Pick Player 1</h2>
              <input
                type="text"
                placeholder="Search players..."
                value={player1Search}
                onChange={e => setPlayer1Search(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm mb-3"
              />
              {selectedPlayer1 && (
                <div className="text-sm text-green-700 font-medium mb-2">
                  Selected: {getPlayerName(selectedPlayer1)}
                  <button onClick={() => setSelectedPlayer1(null)} className="ml-2 text-gray-400 hover:text-gray-600">✕</button>
                </div>
              )}
              {player1Search && (
                <div className="border rounded max-h-48 overflow-y-auto">
                  {filteredPlayer1.slice(0, 20).map(player => {
                    const count = playerCounts[player.id] ?? 0
                    const maxedOut = count >= 2 && player.id !== currentPick?.player1_id
                    return (
                      <button
                        key={player.id}
                        onClick={() => {
                          if (!maxedOut) {
                            setSelectedPlayer1(player.id)
                            setPlayer1Search('')
                          }
                        }}
                        disabled={maxedOut}
                        className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 flex justify-between ${
                          selectedPlayer1 === player.id ? 'bg-black text-white' :
                          maxedOut ? 'bg-gray-50 text-gray-400 cursor-not-allowed' :
                          'hover:bg-gray-50'
                        }`}
                      >
                        <span>{player.name}</span>
                        <span className="text-xs text-gray-400">{count}/2</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border rounded-lg p-6">
              <h2 className="font-bold mb-4">Pick Player 2</h2>
              <input
                type="text"
                placeholder="Search players..."
                value={player2Search}
                onChange={e => setPlayer2Search(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm mb-3"
              />
              {selectedPlayer2 && (
                <div className="text-sm text-green-700 font-medium mb-2">
                  Selected: {getPlayerName(selectedPlayer2)}
                  <button onClick={() => setSelectedPlayer2(null)} className="ml-2 text-gray-400 hover:text-gray-600">✕</button>
                </div>
              )}
              {player2Search && (
                <div className="border rounded max-h-48 overflow-y-auto">
                  {filteredPlayer2.slice(0, 20).map(player => {
                    const count = playerCounts[player.id] ?? 0
                    const maxedOut = count >= 2 && player.id !== currentPick?.player2_id
                    return (
                      <button
                        key={player.id}
                        onClick={() => {
                          if (!maxedOut) {
                            setSelectedPlayer2(player.id)
                            setPlayer2Search('')
                          }
                        }}
                        disabled={maxedOut}
                        className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 flex justify-between ${
                          selectedPlayer2 === player.id ? 'bg-black text-white' :
                          maxedOut ? 'bg-gray-50 text-gray-400 cursor-not-allowed' :
                          'hover:bg-gray-50'
                        }`}
                      >
                        <span>{player.name}</span>
                        <span className="text-xs text-gray-400">{count}/2</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">Use Banker?</h2>
                  <p className="text-sm text-gray-500">{bankersRemaining} banker{bankersRemaining !== 1 ? 's' : ''} remaining — doubles all points this gameweek</p>
                </div>
                <button
                  onClick={() => {
                    if (bankersRemaining > 0 || isBanker) {
                      setIsBanker(!isBanker)
                    }
                  }}
                  disabled={bankersRemaining === 0 && !isBanker}
                  className={`px-4 py-2 rounded border text-sm font-medium transition-colors ${
                    isBanker
                      ? 'bg-yellow-400 border-yellow-400 text-black'
                      : bankersRemaining === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'hover:border-black'
                  }`}
                >
                  {isBanker ? 'Banker Active ★' : 'Use Banker'}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={savePick}
              disabled={saving || !selectedTeam || !selectedPlayer1 || !selectedPlayer2}
              className="w-full bg-black text-white rounded-lg px-4 py-3 font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : currentPick ? 'Update Pick' : 'Save Pick'}
            </button>

          </div>
        )}
      </div>
    </main>
  )
}
