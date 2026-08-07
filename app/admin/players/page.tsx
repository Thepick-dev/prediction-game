'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../lib/supabase'

type Player = { id: number; name: string; position: string | null; team_id: number }
type Team = { id: number; name: string; short_name: string | null }
type Reaction = { player_id: number; type: 'emoji' | 'text'; content: string }

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Record<number, Team>>({})
  const [reactions, setReactions] = useState<Record<number, Reaction>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyWithReaction, setOnlyWithReaction] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: playersData }, { data: teamsData }, { data: reactionsData }] = await Promise.all([
      supabase.from('players').select('id, name, position, team_id').order('name', { ascending: true }),
      supabase.from('teams').select('id, name, short_name'),
      supabase.from('player_reactions').select('player_id, type, content'),
    ])

    setPlayers(playersData ?? [])
    const teamMap: Record<number, Team> = {}
    teamsData?.forEach(t => { teamMap[t.id] = t })
    setTeams(teamMap)

    const reactionMap: Record<number, Reaction> = {}
    reactionsData?.forEach(r => { reactionMap[r.player_id] = r as Reaction })
    setReactions(reactionMap)

    setLoading(false)
  }

  const filteredPlayers = useMemo(() => {
    let list = players
    if (onlyWithReaction) list = list.filter(p => !!reactions[p.id])
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    return list
  }, [players, reactions, search, onlyWithReaction])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Players</h1>
      <p className="text-gray-500 text-sm mb-6">
        {players.length} players imported. Click a player to add, edit, or remove their pick-screen reaction
        (a big emoji or text banner that pops up briefly when someone selects them).
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={onlyWithReaction} onChange={e => setOnlyWithReaction(e.target.checked)} />
          Only show players with a reaction set
        </label>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-sm p-6">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Team</th>
                <th className="py-2 px-3">Position</th>
                <th className="py-2 px-3">Reaction</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.slice(0, 200).map(player => {
                const r = reactions[player.id]
                return (
                  <tr key={player.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-1.5 px-3 font-medium">{player.name}</td>
                    <td className="py-1.5 px-3 text-gray-500">{teams[player.team_id]?.short_name ?? teams[player.team_id]?.name ?? '—'}</td>
                    <td className="py-1.5 px-3 text-gray-500">{player.position ?? '—'}</td>
                    <td className="py-1.5 px-3">
                      {r ? (
                        <span className="inline-block bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5 text-xs">
                          {r.type === 'emoji' ? r.content : `"${r.content}"`}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <button
                        onClick={() => setEditingPlayer(player)}
                        className="text-xs border rounded px-2 py-1 hover:bg-gray-100"
                      >
                        {r ? 'Edit' : 'Add'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredPlayers.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">No players match.</td></tr>
              )}
            </tbody>
          </table>
        )}
        {filteredPlayers.length > 200 && (
          <p className="px-3 py-2 text-xs text-gray-400">Showing first 200 of {filteredPlayers.length} — narrow your search to see more.</p>
        )}
      </div>

      {editingPlayer && (
        <ReactionModal
          player={editingPlayer}
          existing={reactions[editingPlayer.id] ?? null}
          onClose={() => setEditingPlayer(null)}
          onSaved={(reaction) => {
            setReactions(prev => ({ ...prev, [editingPlayer.id]: reaction }))
            setEditingPlayer(null)
          }}
          onDeleted={() => {
            setReactions(prev => {
              const next = { ...prev }
              delete next[editingPlayer.id]
              return next
            })
            setEditingPlayer(null)
          }}
        />
      )}
    </div>
  )
}

function ReactionModal({
  player, existing, onClose, onSaved, onDeleted,
}: {
  player: Player
  existing: Reaction | null
  onClose: () => void
  onSaved: (r: Reaction) => void
  onDeleted: () => void
}) {
  const [type, setType] = useState<'emoji' | 'text'>(existing?.type ?? 'emoji')
  const [content, setContent] = useState(existing?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function save() {
    if (!content.trim()) { setError('Enter an emoji or some text first'); return }
    setSaving(true)
    setError('')
    const { error: saveError } = await supabase
      .from('player_reactions')
      .upsert({ player_id: player.id, type, content: content.trim(), updated_at: new Date().toISOString() })
    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }
    onSaved({ player_id: player.id, type, content: content.trim() })
  }

  async function remove() {
    setSaving(true)
    setError('')
    const { error: deleteError } = await supabase.from('player_reactions').delete().eq('player_id', player.id)
    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }
    onDeleted()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold mb-1">{player.name}</h2>
        <p className="text-xs text-gray-500 mb-4">Shown briefly when someone picks this player on the Picks page.</p>

        <div className="flex gap-2 mb-3 text-xs">
          <button
            onClick={() => setType('emoji')}
            className={`flex-1 py-1.5 rounded border ${type === 'emoji' ? 'border-black font-bold' : 'border-gray-200 text-gray-400'}`}
          >
            Emoji
          </button>
          <button
            onClick={() => setType('text')}
            className={`flex-1 py-1.5 rounded border ${type === 'text' ? 'border-black font-bold' : 'border-gray-200 text-gray-400'}`}
          >
            Text banner
          </button>
        </div>

        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={type === 'emoji' ? 'e.g. 🔥 or 😎😎😎' : 'e.g. WHAT A PLAYER!'}
          className="w-full border rounded px-3 py-2 text-sm mb-3"
          maxLength={80}
        />

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-black text-white rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {existing && (
            <button
              onClick={remove}
              disabled={saving}
              className="border border-red-300 text-red-600 rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className="border rounded px-4 py-2 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
