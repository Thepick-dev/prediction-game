'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { createClient } from './supabase'
import {
  resolvePopArtVariant,
  resolveLoadingAnimation,
  isLoadingAnimation,
  readCachedLoadingAnimation,
  writeCachedLoadingAnimation,
  type PopArtVariant,
  type LoadingAnimation,
} from './useSkin'

const VARIANT_PREVIEW_KEY = 'lms-admin-popart-variant-preview'
const LOADING_ANIMATION_PREVIEW_KEY = 'lms-admin-loading-animation-preview'

// Pop-art is the only theme now — Classic has been retired, including the
// admin-only escape hatch that used to allow switching to it for
// reference (see git history for that mechanism if it's ever needed
// again). Kept as a hook rather than inlining `true` everywhere so every
// page that reads `popArt` doesn't need touching if theming ever changes
// again.
//
// Still used by every page not yet migrated to useSkin() (the Retro-skin
// work's own hook) — this doesn't resolve Retro at all, only ever Pop
// Art, but it DOES need to resolve the Pop Art V2 variant and set the
// same data-pop-art-variant attribute useSkin() does. Without this, a
// page on this hook never shows V2, and worse, navigating here from a
// useSkin() page wipes the attribute via that hook's own cleanup —
// exactly the "doesn't look like every page" bug this fixes. Same
// reasoning now applies to the Futzy loading-animation toggle: most pages
// (anywhere PopArtLoading can show) are still on THIS hook, not useSkin(),
// so the admin toggle needs resolving and setting here too or it would
// only ever take effect on the three pages already migrated.
export function usePopArtTheme(userId: string | undefined) {
  const [globalPopArtVariant, setGlobalPopArtVariant] = useState<PopArtVariant>('v1')
  // Seeded from the cached last-known-good value, not hardcoded 'float' —
  // see useSkin.ts's full explanation on its own identical useState. This
  // hook is the one MOST pages actually use, so it's the more important
  // of the two to get this right in.
  const [globalLoadingAnimation, setGlobalLoadingAnimation] = useState<LoadingAnimation>(readCachedLoadingAnimation)
  const [isAdmin, setIsAdmin] = useState(false)
  const [variantPreview, setVariantPreviewState] = useState<PopArtVariant | null>(null)
  const [loadingAnimationPreview, setLoadingAnimationPreviewState] = useState<LoadingAnimation | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('site_skin').select('pop_art_variant').eq('id', 'singleton').maybeSingle()
        if (cancelled) return
        if (data?.pop_art_variant === 'v1' || data?.pop_art_variant === 'v2') {
          setGlobalPopArtVariant(data.pop_art_variant)
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Its own isolated fetch — see useSkin.ts's identical comment on why
  // this can't be bundled into the select above.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('site_skin').select('loading_animation').eq('id', 'singleton').maybeSingle()
        if (cancelled) return
        const la = data?.loading_animation
        if (isLoadingAnimation(la)) {
          setGlobalLoadingAnimation(la)
          writeCachedLoadingAnimation(la)
        }
      } catch {}
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
      const stored = localStorage.getItem(VARIANT_PREVIEW_KEY)
      if (stored === 'v1' || stored === 'v2') setVariantPreviewState(stored)
      const storedAnimation = localStorage.getItem(LOADING_ANIMATION_PREVIEW_KEY)
      if (storedAnimation === 'float' || storedAnimation === 'pixelate' || storedAnimation === 'glitch' || storedAnimation === 'assemble' || storedAnimation === 'glow') {
        setLoadingAnimationPreviewState(storedAnimation)
      }
    } catch {}
  }, [])

  const resolvedPopArtVariant = resolvePopArtVariant(globalPopArtVariant, isAdmin, variantPreview)
  const resolvedLoadingAnimation = resolveLoadingAnimation(globalLoadingAnimation, isAdmin, loadingAnimationPreview)

  useEffect(() => {
    if (resolvedPopArtVariant !== 'v1') {
      document.documentElement.dataset.popArtVariant = resolvedPopArtVariant
    } else {
      delete document.documentElement.dataset.popArtVariant
    }
    return () => { delete document.documentElement.dataset.popArtVariant }
  }, [resolvedPopArtVariant])

  // useLayoutEffect — see useSkin.ts's identical comment: applies before
  // paint, closing the race now that the initial value above is already
  // correct from cache rather than hardcoded.
  useLayoutEffect(() => {
    if (resolvedLoadingAnimation !== 'float') {
      document.documentElement.dataset.loadingAnimation = resolvedLoadingAnimation
    } else {
      delete document.documentElement.dataset.loadingAnimation
    }
    return () => { delete document.documentElement.dataset.loadingAnimation }
  }, [resolvedLoadingAnimation])

  return { popArt: true }
}
