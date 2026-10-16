type Props = {
  label: string
  value: number
  max: number
  segments?: number
}

// Segmented HP/XP-style progress bar — colour by remaining percentage
// (green > 50%, gold 20-50%, red < 20%), threshold also stated in the
// text label so colour alone never carries the meaning.
export default function RetroMeter({ label, value, max, segments = 10 }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const filledSegments = Math.round(pct * segments)
  const colour = pct > 0.5 ? 'var(--retro-green)' : pct > 0.2 ? 'var(--retro-gold)' : 'var(--retro-red)'

  return (
    <div className="retro-meter">
      <span className="retro-meter-label">{label}</span>
      <div
        className="retro-meter-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="retro-meter-segment"
            data-filled={i < filledSegments ? 'true' : 'false'}
            style={{ '--seg-colour': colour } as React.CSSProperties}
          />
        ))}
      </div>
      <span className="retro-meter-label">
        {value}/{max}
      </span>
    </div>
  )
}
