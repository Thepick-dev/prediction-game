'use client'

import { useRouter } from 'next/navigation'

export default function DreamTeamUserSelector({
  entrants,
  selectedUserId,
}: {
  entrants: { userId: string; name: string }[]
  selectedUserId: string
}) {
  const router = useRouter()
  return (
    <select
      value={selectedUserId}
      onChange={e => router.push(`/rugby/dream-team?user=${e.target.value}`)}
      className="pop-input px-3 py-2 text-sm pop-name"
    >
      {entrants.map(e => (
        <option key={e.userId} value={e.userId}>{e.name}</option>
      ))}
    </select>
  )
}
