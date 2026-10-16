'use client'

import { useEffect, useState } from 'react'
import { createClient } from './supabase'

export type Skin = 'pop-art' | 'retro'

// This browser only — never written to the DB, never read for anyone but
// an actually-confirmed admin (see below). A non-admin poking devtools to
// set this does nothing: it's simply never honoured for them.
const PREVIEW_KEY = 'lms-admin-skin-preview'

// Pulled out as a plain function (see __tests__/useSkin.test.ts) so the
// actual decision logic has real unit coverage without needing a
// React-hook-testing dependency this repo doesn't otherwise use — the
// three useEffects below are just plumbing that feed these three inputs in.
export function resolveSkin(globalSkin: Skin, isAdmin: boolean, preview: Skin | null): Skin {
  return isAdmin && preview ? preview : globalSkin
}

// Resolves which skin a page should render from three independent inputs:
// the global DB value (true for every player, every device), whether this
// user is actually an admin, and that admin's own local preview override
// if any. Each input degrades gracefully on its own (see the isolated
// try/catches below) — a problem with any one of them should never break
// the page, it should just mean everyone sees the global default.
export function useSkin(userId: string | undefined) {
  // Optimistic default while site_skin loads — the universal baseline, so
  // nobody flashes the wrong skin for the vast majority of page loads.
  const [globalSkin, setGlobalSkin] = useState<Skin>('pop-art')
  const [isAdmin, setIsAdmin] = useState(false)
  const [preview, setPreviewState] = useState<Skin | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('site_skin').select('active_skin').eq('id', 'singleton').maybeSingle()
        if (cancelled) return
        if (data?.active_skin === 'retro' || data?.active_skin === 'pop-art') {
          setGlobalSkin(data.active_skin)
        }
      } catch {
        // Table not created yet, or a network hiccup — keep the pop-art
        // default rather than breaking the page.
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('profiles').select('is_admin, is_super_admin').eq('id', userId).single()
        setIsAdmin(!!(data?.is_admin || data?.is_super_admin))
      } catch {}
    }
    load()
  }, [userId])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREVIEW_KEY)
      if (stored === 'pop-art' || stored === 'retro') setPreviewState(stored)
    } catch {
      // Private browsing / storage blocked — behave as "no override".
    }
  }, [])

  function setPreview(skin: Skin | null) {
    setPreviewState(skin)
    try {
      if (skin) localStorage.setItem(PREVIEW_KEY, skin)
      else localStorage.removeItem(PREVIEW_KEY)
    } catch {}
  }

  const resolvedSkin = resolveSkin(globalSkin, isAdmin, preview)

  return {
    skin: resolvedSkin,
    popArt: resolvedSkin === 'pop-art',
    retro: resolvedSkin === 'retro',
    globalSkin,
    preview: isAdmin ? preview : null,
    isAdmin,
    setPreview,
  }
}
