'use client'

// One plain line — Kit, 2026-09-25: "too many lines, buttons, words,
// colours... simplify." Four bordered D/H/M/S boxes was one more shape
// than this needed; the deadline is a fact to read, not a scoreboard.

import { useCountdown } from '../app/lib/useCountdown'

export default function RugbyCountdownClock({ deadline }: { deadline: string | null }) {
  const time = useCountdown(deadline)
  if (!time) return null

  if (time.expired) {
    return <span className="rb3-badge rb3-badge--bad px-3 py-1.5 text-xs">Deadline passed</span>
  }

  const parts = [
    time.days > 0 ? `${time.days}d` : null,
    `${time.hours}h`,
    `${time.mins}m`,
  ].filter(Boolean)

  return (
    <span className="rb3-stat-number text-lg" style={{ color: 'var(--rb3-gold)' }}>
      {parts.join(' ')}
    </span>
  )
}
