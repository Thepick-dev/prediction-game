type Props = {
  value: number
  max: number
  label?: string
}

function Heart({ state }: { state: 'full' | 'half' | 'empty' }) {
  const colour = state === 'empty' ? 'var(--retro-grey-dark)' : 'var(--retro-red)'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="2" width="4" height="2" fill={colour} />
      <rect x="10" y="2" width="4" height="2" fill={colour} />
      <rect x="1" y="4" width="6" height="2" fill={colour} />
      <rect x="9" y="4" width="6" height="2" fill={colour} />
      <rect x="1" y="6" width={state === 'half' ? 7 : 14} height="2" fill={colour} />
      <rect x="2" y="8" width={state === 'half' ? 6 : 12} height="2" fill={colour} />
      <rect x="3" y="10" width={state === 'half' ? 5 : 10} height="2" fill={colour} />
      <rect x="4" y="12" width={state === 'half' ? 4 : 8} height="2" fill={colour} />
      <rect x="6" y="14" width="4" height="2" fill={colour} />
    </svg>
  )
}

// Rows of heart sprites (full/half/empty) — the alternative to RetroMeter
// for rating-style or step-progress use cases (e.g. picks streak).
export default function RetroHearts({ value, max, label }: Props) {
  const hearts = Array.from({ length: max }, (_, i) => {
    const remaining = value - i
    if (remaining >= 1) return 'full' as const
    if (remaining >= 0.5) return 'half' as const
    return 'empty' as const
  })

  return (
    <div className="retro-hearts" role="img" aria-label={label ?? `${value} out of ${max}`}>
      {hearts.map((state, i) => (
        <Heart key={i} state={state} />
      ))}
    </div>
  )
}
