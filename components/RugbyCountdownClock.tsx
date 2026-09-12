'use client'

// Same visual language as football's CountdownClock (app/picks/page.tsx) —
// four colour-coded pill units (D/H/M/S), the seconds pill pulsing to read
// as "ticking" — kept as its own copy rather than importing football's
// page-local helper, per this project's isolation rule.

import { useCountdown } from '../app/lib/useCountdown'

export default function RugbyCountdownClock({ deadline }: { deadline: string | null }) {
  const time = useCountdown(deadline)
  if (!time) return null

  if (time.expired) {
    return <span className="pop-badge pop-badge--red px-3 py-1.5 text-xs">Deadline passed</span>
  }

  const units = [
    { label: 'D', value: time.days, bg: 'var(--pop-pink)', fg: 'var(--pop-white)' },
    { label: 'H', value: time.hours, bg: 'var(--pop-blue)', fg: 'var(--pop-black)' },
    { label: 'M', value: time.mins, bg: 'var(--pop-green)', fg: 'var(--pop-black)' },
    { label: 'S', value: time.secs, bg: 'var(--pop-orange)', fg: 'var(--pop-black)', pulse: true },
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
