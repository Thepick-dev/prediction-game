'use client'

// Four D/H/M/S pill units in the rugby matchday theme's dark ink, the
// seconds pill picked out in floodlight gold and pulsing to read as
// "ticking" — kept as its own copy rather than importing football's
// page-local CountdownClock, per this project's isolation rule.

import { useCountdown } from '../app/lib/useCountdown'

export default function RugbyCountdownClock({ deadline }: { deadline: string | null }) {
  const time = useCountdown(deadline)
  if (!time) return null

  if (time.expired) {
    return <span className="rb2-badge rb2-badge--bad px-3 py-1.5 text-xs">Deadline passed</span>
  }

  const units = [
    { label: 'D', value: time.days, bg: '#ffffff', fg: 'var(--rb2-ink)' },
    { label: 'H', value: time.hours, bg: '#ffffff', fg: 'var(--rb2-ink)' },
    { label: 'M', value: time.mins, bg: '#ffffff', fg: 'var(--rb2-ink)' },
    { label: 'S', value: time.secs, bg: 'var(--rb2-gold)', fg: 'var(--rb2-ink)', pulse: true },
  ]

  return (
    <div className="flex items-center gap-1.5">
      {units.map(u => (
        <div
          key={u.label}
          className={`flex flex-col items-center px-2.5 py-1.5 leading-tight ${u.pulse ? 'pop-second-tick' : ''}`}
          style={{ background: u.bg, color: u.fg, border: '2.5px solid var(--rb2-ink)' }}
        >
          <span className="rb2-stat-number text-base">{String(u.value).padStart(2, '0')}</span>
          <span className="text-[8px] font-bold uppercase">{u.label}</span>
        </div>
      ))}
    </div>
  )
}
