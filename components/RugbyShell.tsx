'use client'

// Rugby's own header/nav shell — its own "matchday broadcast" visual
// identity (see globals.css, .rugby-theme), completely separate from
// football's pop-art theme, wired to rugby's own tables
// (rugby.player_kits, rugby.competitions, rugby.rounds). Deliberately its
// own component rather than importing/extending football's Shell: Shell
// is hardcoded to football's data (profiles.kit_*, minigame scores, Futzy
// ticker), and this project's isolation rule is that no football-facing
// file is touched by the rugby build.

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '../app/lib/supabase'
import { useCountdown } from '../app/lib/useCountdown'
import RugbyKitPreview from './RugbyKitPreview'
import RugbyKitEditor from './RugbyKitEditor'

const KIT_POPUP_WIDTH = 288
const KIT_POPUP_MARGIN = 8

const navItems = [
  { label: 'Picks', href: '/rugby/picks' },
  { label: 'My Dream Team', href: '/rugby/dream-team' },
  { label: 'Leaderboard', href: '/rugby/leaderboard' },
  { label: 'Results', href: '/rugby/results' },
  { label: 'Stats Hub', href: '/rugby/stats' },
  { label: 'Rules', href: '/rugby/rules' },
  { label: 'Winners', href: '/rugby/winners' },
  { label: 'Settings', href: '/rugby/settings' },
]

type Kit = {
  pattern: string; colour1: string; colour2: string; colour3: string | null
  back_text: string | null; back_shape: 'circle' | 'square'; back_shape_colour: string; back_text_colour: string
  shorts_colour: string | null; socks_colour: string | null; socks_hooped: boolean; socks_colour2: string | null
}

export default function RugbyShell({
  children,
  userId,
  displayName,
  tickerText,
}: {
  children: React.ReactNode
  userId?: string
  displayName?: string
  tickerText?: string | null
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [kit, setKit] = useState<Kit | null>(null)
  const [nextDeadline, setNextDeadline] = useState<{ number: number; deadline: string } | null>(null)
  const countdown = useCountdown(nextDeadline?.deadline ?? null)

  const [kitPopupOpen, setKitPopupOpen] = useState(false)
  const [kitPopupPos, setKitPopupPos] = useState<{ top: number; left: number } | null>(null)
  const kitTriggerRef = useRef<HTMLButtonElement>(null)
  const kitPopupRef = useRef<HTMLDivElement>(null)

  function openKitPopup() {
    const rect = kitTriggerRef.current?.getBoundingClientRect()
    if (!rect) return
    let left = Math.min(rect.left, window.innerWidth - KIT_POPUP_WIDTH - KIT_POPUP_MARGIN)
    left = Math.max(left, KIT_POPUP_MARGIN)
    setKitPopupPos({ top: rect.bottom + KIT_POPUP_MARGIN, left })
    setKitPopupOpen(true)
  }

  useEffect(() => {
    if (!kitPopupOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        kitPopupRef.current && !kitPopupRef.current.contains(e.target as Node) &&
        kitTriggerRef.current && !kitTriggerRef.current.contains(e.target as Node)
      ) {
        setKitPopupOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setKitPopupOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [kitPopupOpen])

  // Own isolated query, same defensive reasoning as Shell's — a problem
  // here should only mean the Admin link doesn't show, never break the
  // rest of the header. Reuses the same profiles.is_admin/is_super_admin
  // columns football's admin check uses — admin status is shared across
  // both sports, only the game data is isolated.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    supabase.from('profiles').select('is_admin, is_super_admin').eq('id', userId).single()
      .then(({ data }) => setIsAdmin(!!(data?.is_admin || data?.is_super_admin)))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    ;(async () => {
      const { data: base } = await supabase.schema('rugby').from('player_kits')
        .select('pattern, colour1, colour2, colour3').eq('user_id', userId).maybeSingle()
      if (!base) return
      // Its own separate query, deliberately not bundled with the one
      // above: these columns are newer than pattern/colour1/colour2/
      // colour3, so a problem reading them must only mean the badge falls
      // back to solid defaults for them, never that the badge disappears
      // entirely.
      const { data: extras } = await supabase.schema('rugby').from('player_kits')
        .select('back_text, back_shape, back_shape_colour, back_text_colour, shorts_colour, socks_colour, socks_hooped, socks_colour2')
        .eq('user_id', userId).maybeSingle()
      setKit({
        ...base,
        back_text: extras?.back_text ?? null,
        back_shape: (extras?.back_shape as 'circle' | 'square') ?? 'circle',
        back_shape_colour: extras?.back_shape_colour ?? '#FFFFFF',
        back_text_colour: extras?.back_text_colour ?? '#000000',
        shorts_colour: extras?.shorts_colour ?? null,
        socks_colour: extras?.socks_colour ?? null,
        socks_hooped: !!extras?.socks_hooped,
        socks_colour2: extras?.socks_colour2 ?? null,
      })
    })()
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    ;(async () => {
      const { data: comp } = await supabase.schema('rugby').from('competitions').select('id').eq('status', 'active').maybeSingle()
      if (!comp) return
      const { data: rounds } = await supabase.schema('rugby').from('rounds').select('number, deadline')
        .eq('competition_id', comp.id).order('deadline', { ascending: true })
      const upcoming = (rounds ?? []).find(r => new Date(r.deadline) > new Date())
      if (upcoming) setNextDeadline(upcoming)
    })()
  }, [userId])

  function isActive(href: string) {
    if (href === '/rugby') return pathname === '/rugby'
    return pathname === href || (pathname?.startsWith(href + '/') ?? false)
  }

  return (
    <div className="rugby-theme min-h-screen">
      <header className="sticky top-0 z-50" style={{ borderBottom: '2px solid var(--rb2-ink)', background: 'var(--rb2-paper)' }}>
        {tickerText && (
          <div className="overflow-hidden whitespace-nowrap" style={{ background: 'var(--rb2-gold)', height: 26, borderBottom: '2px solid var(--rb2-ink)' }}>
            <div
              className="pop-ticker-single inline-block py-1"
              style={{ fontSize: '12px', fontWeight: 800, color: 'var(--rb2-ink)', fontFamily: 'var(--font-rugby-cond)', animationDuration: `${Math.max(2.5, tickerText.length * 0.06)}s` }}
            >
              📢 {tickerText}
            </div>
          </div>
        )}
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex sm:grid sm:grid-cols-3 items-center justify-between h-16">
            <Link href="/rugby" className="flex items-center justify-center gap-2 sm:col-start-2 sm:justify-self-center whitespace-nowrap">
              <span className="rugby-ball-icon" aria-hidden="true" />
              <span className="inline-flex flex-col items-center leading-none">
                <span className="rb2-title" style={{ fontSize: 'clamp(15px, 4vw, 20px)', color: 'var(--rb2-ink)' }}>
                  All-Stars <span style={{ color: 'var(--rb2-gold)', WebkitTextStroke: '1px var(--rb2-ink)' }}>Rugby</span>
                </span>
                <span className="rb2-badge rb2-badge--gold" style={{ fontSize: 9, padding: '1px 8px', marginTop: 2 }}>Six Nations</span>
              </span>
            </Link>
            <div className="flex items-center gap-3 sm:col-start-3 sm:justify-self-end">
              {userId && (
                <button ref={kitTriggerRef} type="button" onClick={openKitPopup} aria-label="Change your kit">
                  <RugbyKitPreview
                    pattern={kit?.pattern ?? 'hoops'}
                    colour1={kit?.colour1 ?? '#004225'}
                    colour2={kit?.colour2 ?? '#FFFFFF'}
                    colour3={kit?.colour3 ?? null}
                    shortsColour={kit?.shorts_colour}
                    socksColour={kit?.socks_colour}
                    socksHooped={kit?.socks_hooped}
                    socksColour2={kit?.socks_colour2}
                    backText={kit?.back_text}
                    backShape={kit?.back_shape}
                    backShapeColour={kit?.back_shape_colour}
                    backTextColour={kit?.back_text_colour}
                    view="back"
                    size={40}
                  />
                </button>
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
                aria-label="Menu"
              >
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: 'var(--rb2-ink)', transform: menuOpen ? 'rotate(45deg) translateY(8px)' : undefined }} />
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: 'var(--rb2-ink)', opacity: menuOpen ? 0 : 1 }} />
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: 'var(--rb2-ink)', transform: menuOpen ? 'rotate(-45deg) translateY(-8px)' : undefined }} />
              </button>
            </div>
          </div>
          <nav className="hidden md:flex flex-wrap justify-center gap-x-4 pb-2.5">
            {navItems.map(item => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-1 py-1.5 text-[10px] lg:text-xs whitespace-nowrap font-bold uppercase tracking-wide"
                  style={{ color: active ? 'var(--rb2-ink)' : 'var(--rb2-text-faint)', borderBottom: active ? '2px solid var(--rb2-gold)' : '2px solid transparent', fontFamily: 'var(--font-rugby-cond)' }}
                >
                  {item.label}
                </Link>
              )
            })}
            {isAdmin && (
              <a href="/admin/rugby" className="px-1 py-1.5 text-[10px] lg:text-xs whitespace-nowrap font-bold uppercase tracking-wide" style={{ color: 'var(--rb2-text-faint)', fontFamily: 'var(--font-rugby-cond)' }}>
                Admin
              </a>
            )}
            <Link href="/picks" className="px-1 py-1.5 text-[10px] lg:text-xs whitespace-nowrap font-bold uppercase tracking-wide" style={{ color: '#b8bac0', fontFamily: 'var(--font-rugby-cond)' }}>
              ⚽ Football
            </Link>
            {userId && (
              <form action="/auth/signout" method="POST">
                <button type="submit" className="px-1 py-1.5 text-[10px] lg:text-xs whitespace-nowrap font-bold uppercase tracking-wide" style={{ color: '#d1293d', fontFamily: 'var(--font-rugby-cond)' }}>
                  Log Out
                </button>
              </form>
            )}
          </nav>
        </div>
        {/* Not shown on Picks itself — its own heading already states the
            same deadline, and Kit asked to cut duplicated information. */}
        {nextDeadline && countdown && !countdown.expired && pathname !== '/rugby/picks' && (
          <div style={{ background: 'var(--rb2-paper-2)', borderTop: '1px solid var(--rb2-line)' }}>
            <div className="max-w-4xl mx-auto px-4">
              <Link
                href="/rugby/picks"
                className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider hover:opacity-80 font-bold"
                style={{ color: 'var(--rb2-ink)', fontFamily: 'var(--font-rugby-cond)' }}
              >
                <span>⏱</span>
                Round {nextDeadline.number} picks close in {countdown.days > 0 ? `${countdown.days}d ` : ''}{countdown.hours}h {countdown.mins}m
              </Link>
            </div>
          </div>
        )}
        {menuOpen && (
          <div className="md:hidden border-t" style={{ borderColor: 'var(--rb2-line)', background: 'var(--rb2-paper)' }}>
            {navItems.map(item => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{ color: active ? 'var(--rb2-ink)' : 'var(--rb2-text-dim)', borderLeft: `4px solid ${active ? 'var(--rb2-gold)' : 'transparent'}`, fontFamily: 'var(--font-rugby-cond)' }}
                  className="block px-6 py-4 text-sm tracking-widest uppercase font-bold border-b"
                >
                  {item.label}
                </Link>
              )
            })}
            {isAdmin && (
              <a
                href="/admin/rugby"
                onClick={() => setMenuOpen(false)}
                style={{ color: 'var(--rb2-text-dim)', fontFamily: 'var(--font-rugby-cond)' }}
                className="block px-6 py-4 text-sm tracking-widest uppercase font-bold border-b"
              >
                Admin
              </a>
            )}
            <Link href="/picks" onClick={() => setMenuOpen(false)} style={{ color: 'var(--rb2-text-faint)', fontFamily: 'var(--font-rugby-cond)' }} className="block px-6 py-4 text-sm tracking-widest uppercase font-bold border-b">
              ⚽ Football
            </Link>
            {userId && (
              <>
                <div className="px-6 py-3 text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--rb2-text-faint)', fontFamily: 'var(--font-rugby-cond)' }}>{displayName ?? ''}</div>
                <form action="/auth/signout" method="POST">
                  <button type="submit" className="block w-full text-left px-6 py-4 text-sm tracking-widest uppercase font-bold" style={{ color: '#d1293d', fontFamily: 'var(--font-rugby-cond)' }}>
                    Log Out
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="py-4 mt-8 text-center" style={{ borderTop: '2px solid var(--rb2-line)' }}>
        <span className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--rb2-text-faint)', fontFamily: 'var(--font-rugby-cond)' }}>Six Nations — a game within All-Stars Rugby</span>
      </footer>
      {kitPopupOpen && kitPopupPos && userId && typeof document !== 'undefined' && createPortal(
        <div
          ref={kitPopupRef}
          className="rugby-theme fixed z-50 p-4"
          style={{
            top: kitPopupPos.top,
            left: kitPopupPos.left,
            width: KIT_POPUP_WIDTH,
            maxWidth: `calc(100vw - ${KIT_POPUP_MARGIN * 2}px)`,
            maxHeight: `calc(100vh - ${KIT_POPUP_MARGIN * 2}px)`,
            overflowY: 'auto',
            background: 'var(--rugby-ink-2)',
            border: '1px solid var(--rugby-line)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
            borderRadius: '16px',
          }}
        >
          <h3 className="rugby-display text-lg mb-2" style={{ color: 'var(--rugby-text)' }}>Change Your Kit</h3>
          <RugbyKitEditor
            userId={userId}
            onSaved={newKit => {
              setKit({
                pattern: newKit.pattern, colour1: newKit.colour1, colour2: newKit.colour2, colour3: newKit.colour3,
                back_text: newKit.backText, back_shape: newKit.backShape, back_shape_colour: newKit.backShapeColour, back_text_colour: newKit.backTextColour,
                shorts_colour: newKit.shortsColour, socks_colour: newKit.socksColour, socks_hooped: newKit.socksHooped, socks_colour2: newKit.socksColour2,
              })
              setTimeout(() => setKitPopupOpen(false), 900)
            }}
          />
          <button onClick={() => setKitPopupOpen(false)} className="rugby-button w-full mt-3 py-1.5 text-xs">
            Close
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
