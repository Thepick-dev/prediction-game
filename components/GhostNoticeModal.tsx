'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../app/lib/supabase'

// Per-browser, not per-account — same reasoning as the admin skin-preview
// overrides in useSkin.ts: this is a one-off "don't bother me again"
// personal preference, not state anyone else (or Claude, or an admin)
// ever needs to read back, so there's no need for a schema change or an
// RLS self-update path just to remember it.
const DISMISS_KEY_PREFIX = 'lms-ghost-notice-dismissed-'

// Shown once to a ghost player (someone who joined after the competition
// had already started, carrying a backfilled starting total — see
// Rules > Ghost Players) explaining what that means for them, specifically
// that they can't be crowned the winner, win an award, or appear on a
// podium. Mounted once in the Shell so it appears regardless of which
// page a ghost happens to land on first after logging in, not tied to
// any one page. Self-contained inline styling (not .pop-panel/.pop-button)
// since Shell mounts this under both the Pop Art and Retro branches, and
// those classes only resolve correctly inside .pop-art-theme.
export default function GhostNoticeModal({ userId }: { userId: string | undefined }) {
  const [isGhost, setIsGhost] = useState(false)
  const [visible, setVisible] = useState(false)
  const [minimised, setMinimised] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').maybeSingle()
        if (!comp) return
        const { data: entry } = await supabase
          .from('competition_entries')
          .select('is_ghost')
          .eq('competition_id', comp.id)
          .eq('user_id', userId)
          .maybeSingle()
        if (cancelled || !entry?.is_ghost) return
        setIsGhost(true)
        let dismissed = false
        try { dismissed = localStorage.getItem(DISMISS_KEY_PREFIX + userId) === '1' } catch {}
        if (!dismissed) setVisible(true)
      } catch {
        // is_ghost column/table not there yet, or a network hiccup — no
        // popup is a safe default, same as everywhere else this pattern
        // shows up on this site.
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  if (!isGhost || !visible || minimised) return null

  function dismissForever() {
    try { localStorage.setItem(DISMISS_KEY_PREFIX + (userId ?? ''), '1') } catch {}
    setVisible(false)
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 998, background: 'rgba(0,0,0,0.65)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Ghost player notice"
    >
      <div
        className="w-full"
        style={{
          maxWidth: 380,
          background: '#1B1B1B',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16,
          padding: 20,
          color: '#fff',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontSize: 28, lineHeight: 1 }}>👻</span>
          <h2 className="font-black uppercase" style={{ fontSize: 15, letterSpacing: '0.02em' }}>You&apos;re a Ghost Player</h2>
        </div>
        <p className="text-sm leading-relaxed mb-2.5" style={{ color: 'rgba(255,255,255,0.8)' }}>
          You joined after this competition had already started, so you&apos;ve been given a backfilled starting
          total — the average of everyone else&apos;s score so far — rather than starting on zero.
        </p>
        <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.8)' }}>
          Everything else works normally from here — your picks, Banker (one rather than the usual two), Bonus Card
          and All or Nothing all count. But you <strong>can&apos;t be crowned the winner, win an award, or appear on
          a podium</strong> this competition, since part of your total was never actually earned by you. Full
          details are on the Rules page.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setMinimised(true)}
            className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          >
            Minimise
          </button>
          <button
            type="button"
            onClick={dismissForever}
            className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded"
            style={{ background: '#fff', color: '#000' }}
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  )
}
