import type { ReactNode } from 'react'

type StatProps = {
  label: string
  value: ReactNode
  icon?: ReactNode
  /** The real, unpadded number for screen readers — zero-padding is visual only. */
  srValue?: string
}

export function RetroHudStat({ label, value, icon, srValue }: StatProps) {
  return (
    <div className="retro-hud-stat">
      {icon}
      <span className="retro-hud-stat-label">{label}</span>
      <span className="retro-hud-stat-value" aria-label={srValue ? `${label}: ${srValue}` : undefined}>
        {value}
      </span>
    </div>
  )
}

export default function RetroHud({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`retro-hud ${className}`}>{children}</div>
}
