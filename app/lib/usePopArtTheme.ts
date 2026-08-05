'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'

const STORAGE_KEY = 'lms-pop-art-picks'

// Pop-art is the real site now, not a prototype — every regular user
// always sees it, with no way to switch back. Only admins can still flip
// to Classic (for reference), and only their choice is remembered via
// localStorage; a non-admin's stored preference from back when this was
// a toggle anyone could hit is deliberately never read. Shared by every
// page that's been rebuilt in the pop-art skin, so the admin-only rule
// and the "ignore stale non-admin localStorage" rule can't drift between
// pages by only being fixed on one of them.
export function usePopArtTheme(userId: string | undefined) {
  const [popArt, setPopArt] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('is_admin, is_super_admin')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const admin = !!(data?.is_admin || data?.is_super_admin)
        setIsAdmin(admin)
        if (admin && localStorage.getItem(STORAGE_KEY) === 'false') setPopArt(false)
      })
  }, [userId])

  function toggle() {
    setPopArt(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return { popArt, isAdmin, toggle }
}
