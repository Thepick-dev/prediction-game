'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { createClient } from '../lib/supabase'
import KitBadge from '../../components/KitBadge'
import KitEditor from '../../components/KitEditor'
import { useCountdown } from '../lib/useCountdown'

const KIT_POPUP_WIDTH = 288
const KIT_POPUP_MARGIN = 8

type Props = {
  children: React.ReactNode
  active?: string
  user?: any
  displayName?: string
}

const navItems = [
  { label: 'PICKS', href: '/picks' },
  { label: 'LEADERBOARD', href: '/leaderboard' },
  { label: 'RESULTS', href: '/results' },
  { label: 'STATS HUB', href: '/stats' },
  { label: 'LAWS OF THE GAME', href: '/rules' },
  { label: 'MATCHDAY PROGRAMME', href: '/news' },
  { label: 'TROPHY ROOM', href: '/archive' },
  { label: 'SETTINGS', href: '/settings' },
]

export default function Shell({ children, active, user, displayName }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [kit, setKit] = useState<{ pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number } | null>(null)
  const [nextDeadline, setNextDeadline] = useState<{ number: number; deadline: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
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

  // Same click-outside/Escape/scroll-to-close behaviour as the Sporting
  // Panel popup, and the same reason for portalling to document.body: a
  // `position: fixed` popup nested inside an animated (transformed)
  // ancestor is positioned relative to THAT ancestor, not the real
  // viewport — this header isn't inside one, but the pages it sits above
  // (HeroPage's entrance-animated card) are, so staying consistent here
  // avoids re-discovering that bug in a different component.
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
    // Deliberately no scroll/resize-to-close here (unlike the Sporting Panel
    // popup this pattern is borrowed from) — this popup's own content can
    // be taller than the screen and needs to scroll internally, and a
    // capturing window scroll listener can't tell that apart from the page
    // itself scrolling, so it was closing the popup the instant anyone
    // tried to scroll inside it. It's `position: fixed` (and the header
    // it's anchored to is `sticky`), so it stays put regardless of scroll
    // position anyway — only clicking outside, Escape, or Save should
    // close it now.
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [kitPopupOpen])

  // Its own query, same defensive-isolation reason as the others in this
  // file — if this ever has a problem, it should only mean the Admin link
  // doesn't show, never take the rest of the header with it.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('is_admin, is_super_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setIsAdmin(!!(data?.is_admin || data?.is_super_admin)))
  }, [user?.id])

  // Deliberately its own query, independent of the kit fetch below — if the
  // competition/gameweek lookup ever fails, it should only mean no deadline
  // strip shows, never take the kit badge or the rest of the header with it.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    ;(async () => {
      const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').single()
      if (!comp) return
      const { data: gws } = await supabase
        .from('gameweeks')
        .select('number, deadline')
        .eq('competition_id', comp.id)
        .in('status', ['upcoming', 'open'])
        .order('deadline', { ascending: true })
        .limit(1)
      const gw = gws?.[0]
      if (gw && new Date(gw.deadline) > new Date()) setNextDeadline(gw)
    })()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('kit_pattern, kit_colour_1, kit_colour_2')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setKit({
            pattern: data.kit_pattern ?? 'solid',
            colour1: data.kit_colour_1 ?? '#1E4D6B',
            colour2: data.kit_colour_2 ?? '#F5ECD9',
            colour3: null,
            stars: 0,
            earths: 0,
          })
        }
      })
    // Kept as its own request, deliberately separate from the query above:
    // if these columns ever have a problem, it should only affect the
    // sleeve badges, never take down the kit shirt itself with it.
    supabase
      .from('profiles')
      .select('kit_stars, kit_earths')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setKit(prev => prev ? { ...prev, stars: data.kit_stars ?? 0, earths: data.kit_earths ?? 0 } : prev)
        }
      })
    // Also its own request, same reason as kit_stars/kit_earths above — the
    // trim colour is a newer, optional column, and this must never be able
    // to take the shirt/stars/earths down with it if it's missing.
    supabase
      .from('profiles')
      .select('kit_colour_3')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setKit(prev => prev ? { ...prev, colour3: data.kit_colour_3 ?? null } : prev)
        }
      })
  }, [user?.id])

  return (
    <div className="min-h-screen">
      <header className="bg-[#2A1F17] border-b-4 border-[#D9A441] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex sm:grid sm:grid-cols-3 items-center justify-between h-14">
            <Link
              href="/"
              className="text-base sm:text-2xl tracking-wide uppercase whitespace-nowrap sm:col-start-2 sm:text-center sm:justify-self-center"
              style={{ fontFamily: 'var(--font-heading), serif', color: '#F5ECD9' }}
            >
              LMS All-Stars
            </Link>
            <div className="flex items-center gap-3 sm:col-start-3 sm:justify-self-end">
              {user && (
                <div className="flex flex-col items-center gap-0.5">
                  {/* Stars and globes flank the shirt (same style as the
                      Leaderboard), sized to fit this narrow bar on mobile
                      while still growing a bit on wider screens. */}
                  {kit && (
                    <button ref={kitTriggerRef} type="button" onClick={openKitPopup} aria-label="Change your kit">
                      <KitBadge
                        pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2} colour3={kit.colour3}
                        stars={kit.stars} earths={kit.earths}
                        size={36} iconTextClass="text-[10px] sm:text-sm"
                      />
                    </button>
                  )}
                  <span className="text-[10px] text-[#D9A441] uppercase font-medium tracking-wider leading-none">
                    {displayName ?? ''}
                  </span>
                </div>
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
                aria-label="Menu"
              >
                <span className={`block w-5 h-0.5 bg-[#D9A441] transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
                <span className={`block w-5 h-0.5 bg-[#D9A441] transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`block w-5 h-0.5 bg-[#D9A441] transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
              </button>
            </div>
          </div>
          <nav className="hidden md:flex flex-wrap justify-center gap-x-1">
            {navItems.map(item => (
              <Link
                key={item.label}
                href={item.href}
                style={{ color: active === item.label ? '#D9A441' : '#F5ECD9' }}
                className={`px-2.5 lg:px-3 py-2.5 text-xs font-bold tracking-widest whitespace-nowrap border-b-2 transition-colors uppercase ${
                  active === item.label
                    ? 'border-[#D9A441]'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <a
                href="/admin"
                style={{ color: active === 'ADMIN' ? '#D9A441' : '#F5ECD9' }}
                className={`px-2.5 lg:px-3 py-2.5 text-xs font-bold tracking-widest whitespace-nowrap border-b-2 transition-colors uppercase ${
                  active === 'ADMIN' ? 'border-[#D9A441]' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                Admin
              </a>
            )}
            {user && (
              <form action="/auth/signout" method="POST">
                <button
                  type="submit"
                  className="px-2.5 lg:px-3 py-2.5 text-xs font-bold tracking-widest whitespace-nowrap border-b-2 border-transparent opacity-70 hover:opacity-100 transition-colors uppercase"
                  style={{ color: '#F5ECD9' }}
                >
                  Log Out
                </button>
              </form>
            )}
          </nav>
        </div>
        {nextDeadline && countdown && !countdown.expired && (
          <div className="bg-[#D9A441]/10 border-t border-[#D9A441]/20">
            <div className="max-w-4xl mx-auto px-4">
              <Link
                href="/picks"
                className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D9A441] hover:text-[#F5ECD9] transition-colors"
              >
                <span>⏱</span>
                GW{nextDeadline.number} picks close in {countdown.days > 0 ? `${countdown.days}d ` : ''}{countdown.hours}h {countdown.mins}m
              </Link>
            </div>
          </div>
        )}
        {menuOpen && (
          <div className="md:hidden border-t border-[#D9A441] bg-[#2A1F17] shadow-lg">
            {navItems.map(item => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  color: active === item.label ? '#2A1F17' : '#F5ECD9',
                  backgroundColor: active === item.label ? '#D9A441' : 'transparent'
                }}
                className="block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-[#3d2f22]"
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <a
                href="/admin"
                onClick={() => setMenuOpen(false)}
                style={{
                  color: active === 'ADMIN' ? '#2A1F17' : '#F5ECD9',
                  backgroundColor: active === 'ADMIN' ? '#D9A441' : 'transparent'
                }}
                className="block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-[#3d2f22]"
              >
                Admin
              </a>
            )}
            {user && (
              <>
                <div className="px-6 py-3 text-xs text-[#D9A441] uppercase tracking-wider">
                  {displayName ?? ''}
                </div>
                <form action="/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="block w-full text-left px-6 py-4 text-sm font-bold tracking-widest uppercase text-[#F5ECD9]"
                  >
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
      <footer className="border-t border-gray-200 py-4 mt-8 text-center">
        <span className="text-gray-400 text-xs uppercase tracking-widest">
          LMS All-Stars Predictions
        </span>
      </footer>
      {kitPopupOpen && kitPopupPos && user && typeof document !== 'undefined' && createPortal(
        <div
          ref={kitPopupRef}
          className="fixed z-50 rounded-lg p-4 border shadow-2xl"
          style={{
            top: kitPopupPos.top,
            left: kitPopupPos.left,
            width: KIT_POPUP_WIDTH,
            maxWidth: `calc(100vw - ${KIT_POPUP_MARGIN * 2}px)`,
            maxHeight: `calc(100vh - ${KIT_POPUP_MARGIN * 2}px)`,
            overflowY: 'auto',
            backgroundColor: '#1e1914',
            borderColor: 'rgba(217,164,65,0.3)',
          }}
        >
          <h3
            className="text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: '#D9A441', fontFamily: 'var(--font-heading), serif' }}
          >
            Change Your Kit
          </h3>
          <KitEditor
            userId={user.id}
            compact
            onSaved={newKit => {
              setKit(prev => (prev ? { ...prev, ...newKit } : prev))
              setKitPopupOpen(false)
            }}
          />
          <button
            onClick={() => setKitPopupOpen(false)}
            className="w-full mt-3 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: 'rgba(245,236,217,0.1)', color: '#F5ECD9' }}
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}