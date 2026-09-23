'use client'

import { useState } from 'react'

type Team = { id: number; name: string }
type Player = { id: number; name: string }

export default function BrowseAllPlayers({
  teams,
  playersByTeam,
}: {
  teams: Team[]
  playersByTeam: Record<number, Player[]>
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="text-center mt-6">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="rugby-button rugby-button--ghost text-xs px-4 py-2"
      >
        {open ? 'Hide' : '👀 Browse All Players'}
      </button>
      {open && (
        <div className="rugby-panel p-5 mt-3 text-left">
          {teams.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No squads synced yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {teams.map(team => (
                <div key={team.id}>
                  <h3 className="rugby-cond text-sm mb-2 uppercase tracking-wide" style={{ color: 'var(--rugby-floodlight)' }}>{team.name} ({(playersByTeam[team.id] ?? []).length})</h3>
                  <ul className="text-xs space-y-0.5" style={{ color: 'var(--rugby-text-dim)' }}>
                    {(playersByTeam[team.id] ?? []).map(p => (
                      <li key={p.id} style={{ letterSpacing: '0.01em' }}>{p.name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
