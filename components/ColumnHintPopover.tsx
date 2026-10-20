'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// An abbreviated table header that reveals its full title (plus an
// optional one-line explanation) on click — same proven popover mechanics
// as FutzyExplainerLink (portalled to <body>, clamped to the viewport,
// dismissed on outside click/Escape/scroll), just generic over any label
// instead of Futzy's fixed text. Pop-art colours only; this table has no
// other skin.
const POPOVER_WIDTH = 220
const MARGIN = 8

export default function ColumnHintPopover({ abbr, full, hint }: { abbr: string; full: string; hint?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    let left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN)
    left = Math.max(left, MARGIN)
    setPos({ top: rect.bottom + MARGIN, left })
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
    function handleEscape(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function handleScrollOrResize() { setOpen(false) }
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
    <button
      type="button"
      ref={triggerRef}
      onClick={toggle}
      className="uppercase tracking-wider"
      style={{ font: 'inherit', color: 'inherit', textDecoration: 'underline dotted', textDecorationColor: 'rgba(255,255,255,0.35)', textUnderlineOffset: '3px' }}
      title={full}
    >
      {abbr}
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50 rounded-xl px-3 py-2"
          style={{
            top: pos.top,
            left: pos.left,
            width: POPOVER_WIDTH,
            maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
            background: '#1B1B1B',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
          }}
        >
          <p className="font-black uppercase tracking-wide" style={{ fontSize: '11px', color: '#FFFFFF' }}>{full}</p>
          {hint && <p className="font-normal normal-case mt-1" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', letterSpacing: 'normal' }}>{hint}</p>}
        </div>,
        document.body
      )}
    </button>
  )
}
