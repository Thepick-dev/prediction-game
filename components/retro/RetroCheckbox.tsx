type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export default function RetroCheckbox({ checked, onChange, label, disabled }: Props) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'calc(var(--retro-px) * 3)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
      <span className="retro-checkbox" data-checked={checked ? 'true' : 'false'} aria-hidden="true">
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" shapeRendering="crispEdges">
            <rect x="0" y="4" width="2" height="2" fill="currentColor" />
            <rect x="2" y="6" width="2" height="2" fill="currentColor" />
            <rect x="4" y="8" width="2" height="2" fill="currentColor" />
            <rect x="6" y="4" width="2" height="2" fill="currentColor" />
            <rect x="8" y="2" width="2" height="2" fill="currentColor" />
          </svg>
        )}
      </span>
      <span className="retro-label" style={{ color: 'var(--retro-ink)' }}>{label}</span>
    </label>
  )
}
