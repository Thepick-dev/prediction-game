'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

type PickRow = {
  gameweek_id: string
  team_id: number
  player1_id: number
  player2_id: number
  is_banker: boolean
  gameweeks: { number: number }
}

export default function HistoryPage() {
  const [picks, setPicks] = useState<PickRow[]>([])
  const [teams, setTeams] = useState<Record<number, string>>({})
  const [players, setPlayers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

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

    const { data: competition } = await supabase
      .from('competitions')
      .select('id')
      .eq('status', 'active')
      .single()

    if (!competition) {
      setLoading(false)
      return
    }

    const { data: picksData } = await supabase
      .from('picks')
      .select('gameweek_id, team_id, player1_id, player2_id, is_banker, gameweeks(number)')
      .eq('user_id', user.id)
      .eq('competition_id', competition.id)
      .order('gameweek_id')

    const [{ data: teamsData }, { data: playersData }] = await Promise.all([
      supabase.from('teams').select('id, name'),
      supabase.from('players').select('id, name')
    ])

    const teamMap: Record<number, string> = {}
    teamsData?.forEach(t => { teamMap[t.id] = t.name })

    const playerMap: Record<number, string> = {}
    playersData?.forEach(p => { playerMap[p.id] = p.name })

    setTeams(teamMap)
    setPlayers(playerMap)
    setPicks((picksData as any) ?? [])
    setLoading(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    )
  }

  const teamCounts: Record<number, number> = {}
  const playerCounts: Record<number, number> = {}
  let bankersUsed = 0

  picks.forEach(pick => {
    teamCounts[pick.team_id] = (teamCounts[pick.team_id] || 0) + 1
    playerCounts[pick.player1_id] = (playerCounts[pick.player1_id] || 0) + 1
    playerCounts[pick.player2_id] = (playerCounts[pick.player2_id] || 0) + 1
    if (pick.is_banker) bankersUsed++
  })

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">My History</h1>
        <p className="text-gray-500 mb-8">Everything you have used so far this competition</p>

        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-bold mb-1">Bankers</h2>
          <p className="text-sm text-gray-500 mb-2">{bankersUsed} of 2 used</p>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded text-xs ${bankersUsed >= 1 ? 'bg-yellow-400' : 'bg-gray-100 text-gray-400'}`}>Banker 1</span>
            <span className={`px-3 py-1 rounded text-xs ${bankersUsed >= 2 ? 'bg-yellow-400' : 'bg-gray-100 text-gray-400'}`}>Banker 2</span>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-bold mb-4">Teams Used</h2>
          {Object.keys(teamCounts).length === 0 ? (
            <p className="text-sm text-gray-400">No teams picked yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(teamCounts).map(([teamId, count]) => (
                <div key={teamId} className="flex justify-between text-sm border-b pb-1 last:border-0">
                  <span>{teams[parseInt(teamId)] ?? 'Unknown'}</span>
                  <span className="text-gray-400">{count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-bold mb-4">Players Used</h2>
          {Object.keys(playerCounts).length === 0 ? (
            <p className="text-sm text-gray-400">No players picked yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(playerCounts).map(([playerId, count]) => (
                <div key={playerId} className="flex justify-between text-sm border-b pb-1 last:border-0">
                  <span>{players[parseInt(playerId)] ?? 'Unknown'}</span>
                  <span className={count >= 2 ? 'text-red-500 font-medium' : 'text-gray-400'}>{count}/2</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-4">Gameweek by Gameweek</h2>
          {picks.length === 0 ? (
            <p className="text-sm text-gray-400">No picks yet.</p>
          ) : (
            <div className="space-y-2">
              {picks.map(pick => (
                <div key={pick.gameweek_id} className="text-sm border-b pb-2 last:border-0">
                  <span className="font-medium">GW{(pick.gameweeks as any)?.number}:</span>{' '}
                  {teams[pick.team_id]} · {players[pick.player1_id]} & {players[pick.player2_id]}
                  {pick.is_banker && <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">BANKER</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <a href="/" className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-6">
          ← Back to home
        </a>
      </div>
    </main>
  )
}