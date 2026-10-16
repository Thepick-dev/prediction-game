'use client'

import { useEffect, type ReactNode } from 'react'
import RetroWindow from './RetroWindow'

// Fixed top-right stack a page renders its RetroToast instances inside —
// handles positioning/stacking only, each toast still manages its own
// auto-dismiss.
export function RetroToastStack({ children }: { children: ReactNode }) {
  return <div className="retro-toast-wrap">{children}</div>
}

type Props = {
  headline: string
  message?: string
  variant?: 'success' | 'error' | 'info'
  onDone: () => void
  /** ms before auto-dismiss — 0 disables auto-dismiss. */
  duration?: number
}

// "ITEM GET!" style transient notification. Drops in, holds, disappears.
// role="status" (assertive for errors) per the spec's accessibility rules.
export default function RetroToast({ headline, message, variant = 'success', onDone, duration = 3500 }: Props) {
  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(onDone, duration)
    return () => clearTimeout(timer)
  }, [duration, onDone])

  return (
    <div
      className={`retro-toast retro-toast--${variant}`}
      role="status"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <RetroWindow variant={variant === 'success' ? 'gold' : variant === 'error' ? 'red' : 'blue'}>
        <p className="retro-toast-headline">{headline}</p>
        {message && <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 16, marginTop: 'calc(var(--retro-px) * 2)' }}>{message}</p>}
      </RetroWindow>
    </div>
  )
}
