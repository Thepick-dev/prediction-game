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
        className="pop-button pop-button--blue text-xs px-4 py-2"
      >
        {open ? 'Hide' : '👀 Browse All Players'}
      </button>
      {open && (
        <div className="pop-panel pop-panel--blue p-5 mt-3 text-left">
          {teams.length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No squads synced yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {teams.map(team => (
                <div key={team.id}>
                  <h3 className="pop-name text-sm mb-2" style={{ color: 'var(--pop-blue)' }}>{team.name} ({(playersByTeam[team.id] ?? []).length})</h3>
                  <ul className="text-xs space-y-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {(playersByTeam[team.id] ?? []).map(p => (
                      <li key={p.id} className="pop-name" style={{ letterSpacing: '0.01em' }}>{p.name}</li>
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
