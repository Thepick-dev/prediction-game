'use client'

import { useState } from 'react'

// Per-browser, same reasoning as GhostNoticeModal.tsx's identical key —
// a one-off "don't bother me again" preference, not state anyone else
// needs to read back.
const DISMISS_KEY = 'lms-ghost-visibility-notice-dismissed'

// The companion to GhostNoticeModal.tsx: that one explains ghost status
// TO a ghost; this one explains it to everyone ELSE, the first time they
// actually switch the "Show ghost players" toggle on (Leaderboard and
// Results both have their own copy of that toggle — this hook is shared
// between them so the dismissal and the wording stay one thing, not two
// that could drift apart). Never shown on page load — only the moment
// someone actively turns ghosts on, which is also the first moment
// they'd see anything different.
export function useGhostVisibilityNotice() {
  const [visible, setVisible] = useState(false)

  function maybeShow() {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {}
    setVisible(true)
  }

  function minimise() {
    setVisible(false)
  }

  function dismissForever() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setVisible(false)
  }

  return { visible, maybeShow, minimise, dismissForever }
}

export default function GhostVisibilityNotice({ visible, onMinimise, onDismissForever }: {
  visible: boolean
  onMinimise: () => void
  onDismissForever: () => void
}) {
  if (!visible) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 998, background: 'rgba(0,0,0,0.65)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Ghost player visibility notice"
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
          <h2 className="font-black uppercase" style={{ fontSize: 15, letterSpacing: '0.02em' }}>About Ghost Players</h2>
        </div>
        <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.8)' }}>
          A player marked with 👻 joined after the competition had already started, so they&apos;ve been given a
          backfilled starting total — the average of everyone else&apos;s score so far — rather than starting on
          zero. They play normally from the gameweek they joined onward, but{' '}
          <strong>can&apos;t be crowned the winner, win an award, or appear on a podium</strong> this competition,
          since part of their total was never actually earned by them.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onMinimise}
            className="text-xs font-bold uppercase tracking-wider px-3 py-2 rounded"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          >
            Minimise
          </button>
          <button
            type="button"
            onClick={onDismissForever}
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
