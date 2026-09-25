'use client'

import type { CSSProperties } from 'react'

// Dark Mode First / Kinetic (Kit, 2026-09-25, matching the approved
// "Meridian" mockup): quiet outline at rest — muted grey, nothing
// competing for attention — and a soft breathing glow in the choice's
// own colour once picked. Colour only ever appears once something is
// actually chosen, never as permanent decoration.
export default function ChoiceButton({ label, active, glow, onClick }: { label: string; active: boolean; glow: string; onClick: () => void }) {
  const style: CSSProperties & { [key: `--${string}`]: string } = {
    background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
    color: active ? glow : 'var(--rb3-text-faint)',
    border: `1.5px solid ${active ? glow : 'var(--rb3-line)'}`,
    fontWeight: 600,
    '--glow': glow,
    '--glow-soft': `${glow}66`,
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rb3-choice w-full py-4 px-2 text-base ${active ? 'rb3-choice--active' : ''}`}
      style={style}
    >
      {label}
    </button>
  )
}
