'use client'

import { useState } from 'react'
import PicksStatusShareCard from '../../../components/PicksStatusShareCard'

type Gw = { id: string; number: number; deadline: string }

type Props = {
  competitionName: string
  gameweeks: Gw[]
  defaultGwId: string
  namesByUser: Record<string, string>
  allUserIds: string[]
  submittedByGw: Record<string, string[]>
}

// Presence only — sourced from pick_submission_status, the same
// content-free view the leaderboard already uses to say "Picked — hidden
// until deadline" for other players. Says THAT someone has picked, never
// what they picked, so it's safe to show admin regardless of deadline.
export default function PicksStatusPanel({ competitionName, gameweeks, defaultGwId, namesByUser, allUserIds, submittedByGw }: Props) {
  const [selectedGwId, setSelectedGwId] = useState(defaultGwId)
  const [showTicket, setShowTicket] = useState(false)

  const selectedGw = gameweeks.find(g => g.id === selectedGwId)
  const submittedSet = new Set(submittedByGw[selectedGwId] ?? [])
  const picked = allUserIds.filter(id => submittedSet.has(id)).map(id => namesByUser[id] ?? 'Unknown').sort()
  const notPicked = allUserIds.filter(id => !submittedSet.has(id)).map(id => namesByUser[id] ?? 'Unknown').sort()

  return (
    <div className="bg-white border rounded-lg p-6 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <h2 className="font-bold">Who&apos;s Picked</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedGwId}
            onChange={e => setSelectedGwId(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm"
          >
            {gameweeks.map(g => <option key={g.id} value={g.id}>GW{g.number}</option>)}
          </select>
          <button
            onClick={() => setShowTicket(true)}
            className="bg-green-600 text-white text-xs rounded px-3 py-2 font-bold whitespace-nowrap"
          >
            📱 Share Ticket
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Who has submitted, not what they picked — picks themselves stay hidden until the deadline passes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">✅ Picked ({picked.length})</p>
          {picked.length === 0 ? (
            <p className="text-xs text-gray-400">Nobody yet.</p>
          ) : (
            <ul className="text-sm space-y-1">{picked.map(n => <li key={n}>{n}</li>)}</ul>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">⏳ Not yet ({notPicked.length})</p>
          {notPicked.length === 0 ? (
            <p className="text-xs text-gray-400">Everyone&apos;s in!</p>
          ) : (
            <ul className="text-sm space-y-1">{notPicked.map(n => <li key={n}>{n}</li>)}</ul>
          )}
        </div>
      </div>

      {showTicket && selectedGw && (
        <PicksStatusShareCard
          competitionName={competitionName}
          gwNumber={selectedGw.number}
          deadline={selectedGw.deadline}
          picked={picked}
          notPicked={notPicked}
          onClose={() => setShowTicket(false)}
        />
      )}
    </div>
  )
}
