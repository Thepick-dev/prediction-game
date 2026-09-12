'use client'

// Rugby's own header/nav shell, built to visually match football's
// components/ceefax-shell.tsx (Shell) pop-art rendering — same header
// layout, kit badge, deadline countdown strip, mobile menu, Admin link —
// but wired to rugby's own tables (rugby.player_kits, rugby.competitions,
// rugby.rounds) instead of football's. Deliberately its own component
// rather than importing/extending Shell: Shell is hardcoded to football's
// data (profiles.kit_*, minigame scores, Futzy ticker), and this project's
// isolation rule is that no football-facing file is touched by the rugby
// build.

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

// Same rotation football's Shell uses for the nav underline accent.
const popNavAccents = ['var(--pop-pink)', 'var(--pop-blue)', 'var(--pop-green)', 'var(--pop-orange)']

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
    <div className="pop-art-theme min-h-screen">
      <header className="sticky top-0 z-50" style={{ borderBottom: '2px solid rgba(255,255,255,0.15)' }}>
        {tickerText && (
          <div className="overflow-hidden whitespace-nowrap" style={{ background: 'var(--pop-orange)', height: 28 }}>
            <div
              className="pop-ticker-single pop-name inline-block py-1.5"
              style={{ fontSize: '14px', color: 'var(--pop-black)', animationDuration: `${Math.max(2.5, tickerText.length * 0.06)}s` }}
            >
              📢 {tickerText}
            </div>
          </div>
        )}
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex sm:grid sm:grid-cols-3 items-center justify-between h-14">
            <Link href="/rugby" className="flex items-center justify-center gap-2 sm:col-start-2 sm:justify-self-center whitespace-nowrap">
              <span className="pop-hero pop-hero--pink inline-block text-lg sm:text-2xl tracking-wide uppercase">🏉 Six Nations</span>
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
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: 'var(--pop-white)', transform: menuOpen ? 'rotate(45deg) translateY(8px)' : undefined }} />
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: 'var(--pop-white)', opacity: menuOpen ? 0 : 1 }} />
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: 'var(--pop-white)', transform: menuOpen ? 'rotate(-45deg) translateY(-8px)' : undefined }} />
              </button>
            </div>
          </div>
          <nav className="hidden md:flex flex-wrap justify-center gap-x-3 pb-2">
            {navItems.map((item, i) => {
              const active = isActive(item.href)
              const accent = popNavAccents[i % popNavAccents.length]
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase ${active ? 'pop-nav-link--active' : ''}`}
                  style={{ borderBottomColor: active ? accent : 'transparent' }}
                >
                  {item.label}
                </Link>
              )
            })}
            {isAdmin && (
              <a
                href="/admin/rugby"
                className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase"
                style={{ color: 'var(--pop-blue)' }}
              >
                Admin
              </a>
            )}
            <Link href="/picks" className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ⚽ Football
            </Link>
            {userId && (
              <form action="/auth/signout" method="POST">
                <button type="submit" className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase" style={{ color: 'var(--pop-red)' }}>
                  Log Out
                </button>
              </form>
            )}
          </nav>
        </div>
        {nextDeadline && countdown && !countdown.expired && (
          <div style={{ background: 'rgba(255,255,255,0.06)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="max-w-4xl mx-auto px-4">
              <Link
                href="/rugby/picks"
                className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider hover:opacity-80"
                style={{ color: 'var(--pop-orange)' }}
              >
                <span>⏱</span>
                Round {nextDeadline.number} picks close in {countdown.days > 0 ? `${countdown.days}d ` : ''}{countdown.hours}h {countdown.mins}m
              </Link>
            </div>
          </div>
        )}
        {menuOpen && (
          <div className="md:hidden border-t" style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'var(--pop-surface)' }}>
            {navItems.map((item, i) => {
              const active = isActive(item.href)
              const accent = popNavAccents[i % popNavAccents.length]
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{ color: active ? 'var(--pop-white)' : 'rgba(255,255,255,0.65)', borderLeft: `4px solid ${active ? accent : 'transparent'}` }}
                  className="block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10"
                >
                  {item.label}
                </Link>
              )
            })}
            {isAdmin && (
              <a
                href="/admin/rugby"
                onClick={() => setMenuOpen(false)}
                style={{ color: 'var(--pop-blue)' }}
                className="block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10"
              >
                Admin
              </a>
            )}
            <Link href="/picks" onClick={() => setMenuOpen(false)} style={{ color: 'rgba(255,255,255,0.5)' }} className="block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10">
              ⚽ Football
            </Link>
            {userId && (
              <>
                <div className="px-6 py-3 text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>{displayName ?? ''}</div>
                <form action="/auth/signout" method="POST">
                  <button type="submit" className="block w-full text-left px-6 py-4 text-sm font-bold tracking-widest uppercase" style={{ color: 'var(--pop-red)' }}>
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
      <footer className="py-4 mt-8 text-center" style={{ borderTop: '2px solid rgba(255,255,255,0.15)' }}>
        <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>Six Nations — part of LMS All-Stars</span>
      </footer>
      {kitPopupOpen && kitPopupPos && userId && typeof document !== 'undefined' && createPortal(
        <div
          ref={kitPopupRef}
          className="pop-art-theme fixed z-50 rounded-lg p-4"
          style={{
            top: kitPopupPos.top,
            left: kitPopupPos.left,
            width: KIT_POPUP_WIDTH,
            maxWidth: `calc(100vw - ${KIT_POPUP_MARGIN * 2}px)`,
            maxHeight: `calc(100vh - ${KIT_POPUP_MARGIN * 2}px)`,
            overflowY: 'auto',
            background: 'var(--pop-surface)',
            border: '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
            borderRadius: '16px',
          }}
        >
          <h3 className="pop-headline text-lg mb-2" style={{ color: 'var(--pop-white)' }}>Change Your Kit</h3>
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
          <button onClick={() => setKitPopupOpen(false)} className="pop-button pop-button--blue w-full mt-3 py-1.5 text-xs">
            Close
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
