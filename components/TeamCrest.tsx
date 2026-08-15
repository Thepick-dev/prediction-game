'use client'

import { useState } from 'react'

interface TeamCrestProps {
  teamId: number | null
  teamName: string
  size?: number
  // Pop-art quartile ring — only passed where the team's current quartile
  // is already known in context (Picks fixture cards, Results pick list).
  // Omitted everywhere else rather than fetched specially for this.
  ringColor?: string
}

// Never renders the real crest URL directly — only ever a team's own id,
// which the browser resolves through the authenticated /api/crests proxy.
// A team can genuinely have no crest on file, or the proxy fetch itself
// can fail (e.g. the upstream source is down); either way this falls back
// to a plain initial badge rather than a broken image.
export default function TeamCrest({ teamId, teamName, size = 28, ringColor }: TeamCrestProps) {
  const [failed, setFailed] = useState(false)

  if (!teamId || failed) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-gray-200 text-gray-500 font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4, border: ringColor ? `2px solid ${ringColor}` : undefined }}
      >
        {teamName.charAt(0)}
      </div>
    )
  }

  const img = (
    <img
      src={`/api/crests/${teamId}`}
      alt={teamName}
      width={size}
      height={size}
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )

  if (!ringColor) return img

  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center"
      style={{ width: size + 4, height: size + 4, border: `2px solid ${ringColor}` }}
    >
      {img}
    </div>
  )
}
