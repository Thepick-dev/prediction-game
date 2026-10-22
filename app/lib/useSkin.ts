'use client'

import { useEffect, useState } from 'react'
import { createClient } from './supabase'

export type Skin = 'pop-art' | 'retro'
export type PopArtVariant = 'v1' | 'v2'
export type LoadingAnimation = 'float' | 'pixelate' | 'glitch' | 'assemble' | 'glow'

// This browser only — never written to the DB, never read for anyone but
// an actually-confirmed admin (see below). A non-admin poking devtools to
// set this does nothing: it's simply never honoured for them.
const PREVIEW_KEY = 'lms-admin-skin-preview'
const VARIANT_PREVIEW_KEY = 'lms-admin-popart-variant-preview'
const LOADING_ANIMATION_PREVIEW_KEY = 'lms-admin-loading-animation-preview'

// Pulled out as a plain function (see __tests__/useSkin.test.ts) so the
// actual decision logic has real unit coverage without needing a
// React-hook-testing dependency this repo doesn't otherwise use — the
// three useEffects below are just plumbing that feed these three inputs in.
export function resolveSkin(globalSkin: Skin, isAdmin: boolean, preview: Skin | null): Skin {
  return isAdmin && preview ? preview : globalSkin
}

// Same shape, same reasoning as resolveSkin — a separate, independent
// toggle (not a third Skin value) since Pop Art V2 is a colours-only
// refinement of Pop Art, not a different component set like Retro. Only
// ever visible when the resolved Skin is actually 'pop-art'; harmless
// (and ignored by every selector) otherwise.
export function resolvePopArtVariant(globalVariant: PopArtVariant, isAdmin: boolean, preview: PopArtVariant | null): PopArtVariant {
  return isAdmin && preview ? preview : globalVariant
}

// Same shape again — a fourth independent toggle, not folded into Skin or
// the Pop Art variant, since which Futzy loading animation plays has
// nothing to do with either of those.
export function resolveLoadingAnimation(globalAnimation: LoadingAnimation, isAdmin: boolean, preview: LoadingAnimation | null): LoadingAnimation {
  return isAdmin && preview ? preview : globalAnimation
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
  const [globalPopArtVariant, setGlobalPopArtVariant] = useState<PopArtVariant>('v1')
  const [globalLoadingAnimation, setGlobalLoadingAnimation] = useState<LoadingAnimation>('float')
  const [isAdmin, setIsAdmin] = useState(false)
  const [preview, setPreviewState] = useState<Skin | null>(null)
  const [variantPreview, setVariantPreviewState] = useState<PopArtVariant | null>(null)
  const [loadingAnimationPreview, setLoadingAnimationPreviewState] = useState<LoadingAnimation | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('site_skin').select('active_skin, pop_art_variant').eq('id', 'singleton').maybeSingle()
        if (cancelled) return
        if (data?.active_skin === 'retro' || data?.active_skin === 'pop-art') {
          setGlobalSkin(data.active_skin)
        }
        if (data?.pop_art_variant === 'v1' || data?.pop_art_variant === 'v2') {
          setGlobalPopArtVariant(data.pop_art_variant)
        }
      } catch {
        // Table/column not created yet, or a network hiccup — keep the
        // defaults rather than breaking the page.
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Its own isolated fetch, not bundled into the one above — loading_
  // animation is a newer column, and Supabase returns data: null for the
  // WHOLE query (not just the missing column) when a selected column
  // doesn't exist yet. Bundling it would break Skin/Variant resolution
  // too on a site that hasn't run this migration, not just leave the
  // animation at its default.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('site_skin').select('loading_animation').eq('id', 'singleton').maybeSingle()
        if (cancelled) return
        const la = data?.loading_animation
        if (la === 'float' || la === 'pixelate' || la === 'glitch' || la === 'assemble' || la === 'glow') {
          setGlobalLoadingAnimation(la)
        }
      } catch {
        // Migration not run yet, or a network hiccup — keep the default.
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
      const storedVariant = localStorage.getItem(VARIANT_PREVIEW_KEY)
      if (storedVariant === 'v1' || storedVariant === 'v2') setVariantPreviewState(storedVariant)
      const storedAnimation = localStorage.getItem(LOADING_ANIMATION_PREVIEW_KEY)
      if (storedAnimation === 'float' || storedAnimation === 'pixelate' || storedAnimation === 'glitch' || storedAnimation === 'assemble' || storedAnimation === 'glow') {
        setLoadingAnimationPreviewState(storedAnimation)
      }
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

  function setVariantPreview(variant: PopArtVariant | null) {
    setVariantPreviewState(variant)
    try {
      if (variant) localStorage.setItem(VARIANT_PREVIEW_KEY, variant)
      else localStorage.removeItem(VARIANT_PREVIEW_KEY)
    } catch {}
  }

  function setLoadingAnimationPreview(animation: LoadingAnimation | null) {
    setLoadingAnimationPreviewState(animation)
    try {
      if (animation) localStorage.setItem(LOADING_ANIMATION_PREVIEW_KEY, animation)
      else localStorage.removeItem(LOADING_ANIMATION_PREVIEW_KEY)
    } catch {}
  }

  const resolvedSkin = resolveSkin(globalSkin, isAdmin, preview)
  const resolvedPopArtVariant = resolvePopArtVariant(globalPopArtVariant, isAdmin, variantPreview)
  const resolvedLoadingAnimation = resolveLoadingAnimation(globalLoadingAnimation, isAdmin, loadingAnimationPreview)

  // Sets a data attribute on <html> so a plain CSS selector in globals.css
  // can reskin every .pop-art-theme instance on the page at once — same
  // mechanism as the seasonal site_theme decorations (see
  // SiteThemeEffects.tsx). Harmless to set even when the resolved skin is
  // Retro; the CSS it drives only ever targets .pop-art-theme elements,
  // which simply don't exist on a Retro page.
  useEffect(() => {
    if (resolvedPopArtVariant !== 'v1') {
      document.documentElement.dataset.popArtVariant = resolvedPopArtVariant
    } else {
      delete document.documentElement.dataset.popArtVariant
    }
    return () => { delete document.documentElement.dataset.popArtVariant }
  }, [resolvedPopArtVariant])

  // Same mechanism again — 'float' is the default/fallback baked directly
  // into .pop-logo-flash-in's own base rule, so (like v1 above) it's
  // simply not set as an attribute at all rather than needing its own
  // [data-loading-animation="float"] CSS block.
  useEffect(() => {
    if (resolvedLoadingAnimation !== 'float') {
      document.documentElement.dataset.loadingAnimation = resolvedLoadingAnimation
    } else {
      delete document.documentElement.dataset.loadingAnimation
    }
    return () => { delete document.documentElement.dataset.loadingAnimation }
  }, [resolvedLoadingAnimation])

  return {
    skin: resolvedSkin,
    popArt: resolvedSkin === 'pop-art',
    retro: resolvedSkin === 'retro',
    globalSkin,
    preview: isAdmin ? preview : null,
    isAdmin,
    setPreview,
    popArtVariant: resolvedPopArtVariant,
    globalPopArtVariant,
    variantPreview: isAdmin ? variantPreview : null,
    setVariantPreview,
    loadingAnimation: resolvedLoadingAnimation,
    globalLoadingAnimation,
    loadingAnimationPreview: isAdmin ? loadingAnimationPreview : null,
    setLoadingAnimationPreview,
  }
}
