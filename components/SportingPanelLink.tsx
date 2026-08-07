'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '../app/lib/supabase'
import KitBadge from './KitBadge'

type Member = {
  display_name: string
  kit_pattern: string
  kit_colour_1: string
  kit_colour_2: string
  kit_colour_3: string | null
}

// Wraps any mention of "the Sporting Panel" in the rules text — click it and
// see who's actually on it right now, with their shirt. Fetched lazily
// (only on first click), and cached after that so re-clicking any mention
// on the page doesn't re-fetch.
let cachedMembers: Member[] | null = null

const POPOVER_WIDTH = 288
const MARGIN = 8
const ESTIMATED_HEIGHT = 260

export default function SportingPanelLink({ children, popArt = false }: { children: React.ReactNode; popArt?: boolean }) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[] | null>(cachedMembers)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  function reposition() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    let left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - MARGIN)
    left = Math.max(left, MARGIN)
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow > ESTIMATED_HEIGHT + MARGIN
      ? rect.bottom + MARGIN
      : Math.max(MARGIN, rect.top - ESTIMATED_HEIGHT - MARGIN)
    setPos({ top, left })
  }

  async function openPopup() {
    reposition()
    setOpen(true)
    if (cachedMembers !== null) return
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2')
      .eq('is_sporting_panel', true)
      .order('display_name')
    // Its own request, same reason as everywhere else this session — the
    // trim colour is a newer, optional column, and a problem with it must
    // never be able to take the rest of this popup's member list down too.
    const { data: kitTrims } = await supabase.from('profiles').select('id, kit_colour_3').eq('is_sporting_panel', true)
    const kitTrimMap: Record<string, string | null> = {}
    kitTrims?.forEach(k => { kitTrimMap[k.id] = k.kit_colour_3 ?? null })
    const result = (data ?? []).map(m => ({
      display_name: m.display_name ?? 'Unknown',
      kit_pattern: m.kit_pattern ?? 'solid',
      kit_colour_1: m.kit_colour_1 ?? '#1E4D6B',
      kit_colour_2: m.kit_colour_2 ?? '#F5ECD9',
      kit_colour_3: kitTrimMap[m.id] ?? null,
    }))
    cachedMembers = result
    setMembers(result)
    setLoading(false)
  }

  // Close on a click outside, Escape, or the page scrolling/resizing under
  // it — a popover that drifts away from its trigger is worse than one that
  // just closes.
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
        className={popArt ? 'underline decoration-dotted underline-offset-2 font-black' : 'underline decoration-dotted underline-offset-2 font-bold'}
        style={{ color: popArt ? 'var(--pop-blue)' : '#D9A441' }}
      >
        {children}
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        // Portalled straight to <body> — rendering this in place would put
        // it inside HeroPage's animated card, which has a CSS transform on
        // it. A transformed ancestor becomes the containing block for any
        // `fixed` descendant (a real CSS quirk, not a bug in this component
        // specifically), which is exactly why the old centered version could
        // end up positioned against that card instead of the actual screen.
        <div
          ref={popoverRef}
          className={popArt ? 'pop-panel fixed z-50 p-4' : 'fixed z-50 rounded-lg p-4 border shadow-2xl'}
          style={{
            top: pos.top,
            left: pos.left,
            width: POPOVER_WIDTH,
            maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
            ...(popArt ? {} : { backgroundColor: '#1e1914', borderColor: 'rgba(217,164,65,0.3)' }),
          }}
        >
          <h3
            className={popArt ? 'pop-headline text-xs mb-1 leading-snug' : 'text-xs font-bold uppercase tracking-wider mb-1 leading-snug'}
            style={popArt ? undefined : { color: '#D9A441', fontFamily: 'var(--font-heading), serif' }}
          >
            The Sporting Panel for the Avoidance of Manifestly Unfair Outcomes
          </h3>
          <p
            className="text-[10px] mb-3 uppercase tracking-wider"
            style={{ color: popArt ? 'rgba(255,255,255,0.5)' : 'rgba(245,236,217,0.5)' }}
          >
            Current members
          </p>

          {loading ? (
            <p className="text-sm" style={{ color: popArt ? 'rgba(255,255,255,0.5)' : 'rgba(245,236,217,0.5)' }}>Loading...</p>
          ) : members && members.length > 0 ? (
            <div className="space-y-2">
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <KitBadge pattern={m.kit_pattern} colour1={m.kit_colour_1} colour2={m.kit_colour_2} colour3={m.kit_colour_3} size={22} />
                  <span className={popArt ? 'text-sm font-black uppercase' : 'text-sm font-bold uppercase text-[#F5ECD9]'}>{m.display_name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: popArt ? 'rgba(255,255,255,0.5)' : 'rgba(245,236,217,0.5)' }}>No panel members have been appointed yet.</p>
          )}

          <button
            onClick={() => setOpen(false)}
            className={popArt ? 'pop-button pop-button--yellow w-full mt-3 py-1.5 text-xs' : 'w-full mt-3 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider'}
            style={popArt ? undefined : { backgroundColor: '#D9A441', color: '#241a12' }}
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
