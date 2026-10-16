'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'lms-retro-a11y-prefs'

type Prefs = {
  scanlines: boolean
  readableText: boolean
  reducedMotion: boolean
  soundMuted: boolean
}

// Scanlines, readable-text mode, reduced-motion override, sound mute
// (stubbed — sound itself is phase 2). Per-device cosmetic prefs, same
// localStorage idiom as components/InstallPrompt.tsx — no schema change,
// no admin SQL step, works even for a signed-out visitor on the pre-auth
// pages. Trade-off: doesn't follow a player to a second device/browser;
// fine for prefs this low-stakes.
const DEFAULT_PREFS: Prefs = {
  scanlines: true,
  readableText: false,
  reducedMotion: false,
  soundMuted: true,
}

export function useRetroA11yPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) })
    } catch {
      // Private browsing / storage blocked / corrupt JSON — just use defaults.
    } finally {
      setLoaded(true)
    }
  }, [])

  function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs(prev => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // The data-attribute values the CSS in globals.css actually branches on
  // (see .retro-theme[data-retro-*] rules).
  const dataAttrs = {
    'data-retro-scanlines': prefs.scanlines ? 'on' : 'off',
    'data-retro-readable': prefs.readableText ? 'on' : 'off',
    'data-retro-motion': prefs.reducedMotion ? 'reduced' : 'normal',
    'data-retro-sound': prefs.soundMuted ? 'muted' : 'on',
  } as const

  return { prefs, setPref, dataAttrs, loaded }
}
