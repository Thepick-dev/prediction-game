'use client'

import type { CSSProperties } from 'react'

// Vaporwave / Outrun (Kit, 2026-09-25): a skewed neon tube, quiet — that
// choice's own colour as a thin outline only — until it's actually
// picked, then it floods solid with that colour and glows. Text sits in
// a counter-skewed <span> so it reads upright despite the button itself
// being skewed.
export default function ChoiceButton({ label, active, glow, onClick }: { label: string; active: boolean; glow: string; onClick: () => void }) {
  const style: CSSProperties & { [key: `--${string}`]: string } = {
    background: active ? glow : 'transparent',
    color: active ? '#000000' : glow,
    borderColor: glow,
    '--glow': glow,
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rb4-choice w-full py-4 px-4 text-base border-2 ${active ? 'rb4-choice--active' : ''}`}
      style={style}
    >
      <span>{label}</span>
    </button>
  )
}
