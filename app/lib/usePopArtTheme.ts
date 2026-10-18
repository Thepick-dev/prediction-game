'use client'

import { useEffect, useState } from 'react'
import { createClient } from './supabase'
import { resolvePopArtVariant, type PopArtVariant } from './useSkin'

const VARIANT_PREVIEW_KEY = 'lms-admin-popart-variant-preview'

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
// exactly the "doesn't look like every page" bug this fixes.
export function usePopArtTheme(userId: string | undefined) {
  const [globalPopArtVariant, setGlobalPopArtVariant] = useState<PopArtVariant>('v1')
  const [isAdmin, setIsAdmin] = useState(false)
  const [variantPreview, setVariantPreviewState] = useState<PopArtVariant | null>(null)

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
    } catch {}
  }, [])

  const resolvedPopArtVariant = resolvePopArtVariant(globalPopArtVariant, isAdmin, variantPreview)

  useEffect(() => {
    if (resolvedPopArtVariant === 'v2') {
      document.documentElement.dataset.popArtVariant = 'v2'
    } else {
      delete document.documentElement.dataset.popArtVariant
    }
    return () => { delete document.documentElement.dataset.popArtVariant }
  }, [resolvedPopArtVariant])

  return { popArt: true }
}
