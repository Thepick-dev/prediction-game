'use client'

import { useState, type ReactNode } from 'react'
import RetroWindow from './RetroWindow'

type Props = {
  children: ReactNode
  text: string
}

// Small pixel-bordered callout, shown on hover/focus of its trigger.
export default function RetroTooltip({ children, text }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="retro-tooltip" style={{ bottom: '100%', left: 0, marginBottom: 'calc(var(--retro-px) * 2)' }}>
          <RetroWindow>{text}</RetroWindow>
        </span>
      )}
    </span>
  )
}
