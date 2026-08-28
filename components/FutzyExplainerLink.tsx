'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// A small "?" next to Futzy's name — click it and see a plain-English
// explanation of how he actually picks. Same popover mechanics as
// SportingPanelLink (portalled to <body> to escape any transformed
// ancestor, same position/outside-click/escape/scroll handling), just with
// static text instead of a data fetch — the explanation never changes at
// runtime, so there's nothing to load.
const POPOVER_WIDTH = 288
const MARGIN = 8
const ESTIMATED_HEIGHT = 260

export default function FutzyExplainerLink({ popArt = false }: { popArt?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  function openPopup(e: React.MouseEvent) {
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    let left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN)
    left = Math.max(left, MARGIN)
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow > ESTIMATED_HEIGHT + MARGIN
      ? rect.bottom + MARGIN
      : Math.max(MARGIN, rect.top - ESTIMATED_HEIGHT - MARGIN)
    setPos({ top, left })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handleScrollOrResize() {
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPopup}
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: 15, height: 15, fontSize: '10px', fontWeight: 900, lineHeight: 1,
          background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)',
        }}
        title="How does Futzy pick?"
        aria-label="How does Futzy pick?"
      >
        ?
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        // Portalled straight to <body>, same reasoning as SportingPanelLink —
        // literal hex colours throughout since --pop-* variables are scoped
        // to .pop-art-theme and don't reach a body-level portal.
        <div
          ref={popoverRef}
          className="fixed z-50 p-4 rounded-2xl border-2"
          style={{
            top: pos.top,
            left: pos.left,
            width: POPOVER_WIDTH,
            maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
            ...(popArt
              ? { background: '#1B1B1B', borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }
              : { backgroundColor: '#1e1914', borderColor: 'rgba(217,164,65,0.3)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }),
          }}
        >
          <h3
            className="text-xs font-black uppercase tracking-wider mb-2 leading-snug"
            style={{ color: popArt ? '#FFFFFF' : '#D9A441', fontFamily: popArt ? undefined : 'var(--font-heading), serif' }}
          >
            🤖 How Futzy Picks
          </h3>
          <p className="text-xs leading-relaxed mb-2" style={{ color: popArt ? 'rgba(255,255,255,0.75)' : 'rgba(245,236,217,0.8)' }}>
            He&apos;s not a chatbot deciding — it&apos;s a maths formula. His team is whichever&apos;s projected to
            score the most points, based on real Premier League history. His two players come from expected
            goals/assists, adjusted for injury doubt, form, and how good this week&apos;s fixture looks for them.
          </p>
          <p className="text-xs leading-relaxed" style={{ color: popArt ? 'rgba(255,255,255,0.5)' : 'rgba(245,236,217,0.55)' }}>
            The only AI part is his one-line Wall comment, written after the pick&apos;s already made — it has no
            say in what he picks. He can never be crowned the winner, even if he tops the table.
          </p>
          <button
            onClick={() => setOpen(false)}
            className="w-full mt-3 rounded-lg py-1.5 text-xs font-black uppercase tracking-wider"
            style={{ backgroundColor: popArt ? '#7D37A5' : '#D9A441', color: popArt ? '#FFFFFF' : '#241a12' }}
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
