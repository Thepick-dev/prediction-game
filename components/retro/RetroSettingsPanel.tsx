'use client'

import { useRetroA11yPrefs } from '../../app/lib/useRetroA11yPrefs'
import RetroWindow from './RetroWindow'
import RetroOptionToggle from './RetroOptionToggle'

// The accessibility settings panel — scanlines, readable-text mode,
// reduced-motion override, sound mute (stubbed, sound itself is phase 2).
// Lives on /settings, visible to every player once Retro is their active
// skin, not admin-only.
export default function RetroSettingsPanel() {
  const { prefs, setPref, loaded } = useRetroA11yPrefs()

  if (!loaded) return null

  return (
    <RetroWindow title="Display Settings">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--retro-px) * 5)' }}>
        <RetroOptionToggle
          label="Scanlines"
          value={prefs.scanlines}
          onChange={v => setPref('scanlines', v)}
        />
        <RetroOptionToggle
          label="Readable text"
          value={prefs.readableText}
          onChange={v => setPref('readableText', v)}
        />
        <RetroOptionToggle
          label="Reduce motion"
          value={prefs.reducedMotion}
          onChange={v => setPref('reducedMotion', v)}
        />
        <RetroOptionToggle
          label="Sound"
          value={!prefs.soundMuted}
          onLabel="ON"
          offLabel="MUTED"
          onChange={v => setPref('soundMuted', !v)}
          disabled
        />
        <p style={{ fontFamily: 'var(--font-retro-body)', fontSize: 14, color: 'var(--retro-grey-light)' }}>
          Sound effects are coming in a later update — muted for now regardless of this setting.
        </p>
      </div>
    </RetroWindow>
  )
}
