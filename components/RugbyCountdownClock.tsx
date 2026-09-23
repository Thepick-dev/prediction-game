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
    return <span className="rugby-badge rugby-badge--error px-3 py-1.5 text-xs">Deadline passed</span>
  }

  const units = [
    { label: 'D', value: time.days, bg: 'var(--rugby-ink-3)', fg: 'var(--rugby-text)' },
    { label: 'H', value: time.hours, bg: 'var(--rugby-ink-3)', fg: 'var(--rugby-text)' },
    { label: 'M', value: time.mins, bg: 'var(--rugby-ink-3)', fg: 'var(--rugby-text)' },
    { label: 'S', value: time.secs, bg: 'var(--rugby-floodlight)', fg: '#241300', pulse: true },
  ]

  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1">
      {units.map(u => (
        <div
          key={u.label}
          className={`flex flex-col items-center px-2.5 py-1 leading-tight ${u.pulse ? 'pop-second-tick' : ''}`}
          style={{ background: u.bg, color: u.fg, borderRadius: 999 }}
        >
          <span className="font-mono text-sm font-bold">{String(u.value).padStart(2, '0')}</span>
          <span className="text-[8px]">{u.label}</span>
        </div>
      ))}
    </div>
  )
}
