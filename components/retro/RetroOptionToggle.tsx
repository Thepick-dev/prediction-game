type Props = {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  onLabel?: string
  offLabel?: string
  disabled?: boolean
}

// "◄ ON ► / ◄ OFF ►"-style segmented switch, used heavily by the
// accessibility settings panel. The active side is gold; colour is never
// the only signal — the ON/OFF word itself is the real state.
export default function RetroOptionToggle({ label, value, onChange, onLabel = 'ON', offLabel = 'OFF', disabled }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(var(--retro-px) * 4)' }}>
      <span className="retro-label" style={{ color: 'var(--retro-ink)' }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className="retro-toggle"
        data-state={value ? 'on' : 'off'}
      >
        <span className="retro-toggle-arrow" aria-hidden="true">◄</span>
        <span className="retro-toggle-off">{offLabel}</span>
        <span aria-hidden="true">/</span>
        <span className="retro-toggle-on">{onLabel}</span>
        <span className="retro-toggle-arrow" aria-hidden="true">►</span>
      </button>
    </div>
  )
}
