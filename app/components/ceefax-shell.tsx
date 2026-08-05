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
  // 'pop-art' switches the whole header (title, nav, deadline strip) to
  // match the Picks page's comic theme toggle — passed down from there,
  // not stored here, so this component has no theme state of its own and
  // every other page (which never passes it) renders exactly as before.
  theme?: 'classic' | 'pop-art'
}

// Cycled across nav items as an underline accent colour only — never a
// filled background — so the header stays quiet (white/grey text on
// black) until you look at which page is active. Admin and Log Out get
// their own fixed colours below instead of joining this rotation, since
// their colour is semantic (info / danger) rather than decorative.
const popNavAccents = ['var(--pop-pink)', 'var(--pop-blue)', 'var(--pop-green)', 'var(--pop-orange)']

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

export default function Shell({ children, active, user, displayName, theme = 'classic' }: Props) {
  const isPopArt = theme === 'pop-art'
  const [menuOpen, setMenuOpen] = useState(false)
  // Each optional piece of the kit is tracked in its own slot rather than
  // one merged object, because the three queries below race each other —
  // whichever resolves first used to bail out via `setKit(prev => prev ? ... : prev)`
  // when `prev` was still null, silently dropping stars/earths (or the trim
  // colour) forever whenever that query happened to win the race. Deriving
  // `kit` from independent slots means arrival order can never lose data.
  const [kitBase, setKitBase] = useState<{ pattern: string; colour1: string; colour2: string } | null>(null)
  const [kitColour3, setKitColour3] = useState<string | null>(null)
  const [kitStars, setKitStars] = useState(0)
  const [kitEarths, setKitEarths] = useState(0)
  const [topScore, setTopScore] = useState(0)
  const kit = kitBase ? { ...kitBase, colour3: kitColour3, stars: kitStars, earths: kitEarths } : null
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
          setKitBase({
            pattern: data.kit_pattern ?? 'solid',
            colour1: data.kit_colour_1 ?? '#1E4D6B',
            colour2: data.kit_colour_2 ?? '#F5ECD9',
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
          setKitStars(data.kit_stars ?? 0)
          setKitEarths(data.kit_earths ?? 0)
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
          setKitColour3(data.kit_colour_3 ?? null)
        }
      })
    // Also its own request, same reason — the minigame score shirt number
    // is a separate feature entirely, so a problem with it must never be
    // able to take the shirt itself down with it.
    supabase
      .from('minigame_penalty_scores')
      .select('best_score')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setTopScore(data?.best_score ?? 0)
      })
  }, [user?.id])

  const barColor = isPopArt ? 'var(--pop-white)' : '#D9A441'

  return (
    <div className={`min-h-screen ${isPopArt ? 'pop-art-theme' : ''}`}>
      <header
        className={isPopArt ? 'sticky top-0 z-50' : 'bg-[#2A1F17] border-b-4 border-[#D9A441] sticky top-0 z-50'}
        style={isPopArt ? { borderBottom: '2px solid rgba(255,255,255,0.15)' } : undefined}
      >
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex sm:grid sm:grid-cols-3 items-center justify-between h-14">
            <Link
              href="/"
              className={`whitespace-nowrap sm:col-start-2 sm:text-center sm:justify-self-center ${isPopArt ? 'flex items-center justify-center gap-2' : 'text-base sm:text-2xl tracking-wide uppercase'}`}
              style={isPopArt ? undefined : { fontFamily: 'var(--font-heading), serif', color: '#F5ECD9' }}
            >
              {isPopArt ? (
                <>
                  <img src="/logo.png" alt="" width={36} height={31} style={{ width: 36, height: 'auto' }} />
                  <span className="pop-hero pop-hero--pink inline-block text-lg sm:text-2xl tracking-wide uppercase">
                    LMS All-Stars
                  </span>
                </>
              ) : 'LMS All-Stars'}
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
                        starColor={isPopArt ? 'var(--pop-pink)' : undefined}
                        topScore={topScore}
                      />
                    </button>
                  )}
                  <span
                    className="text-[10px] uppercase font-medium tracking-wider leading-none"
                    style={{ color: isPopArt ? 'rgba(255,255,255,0.7)' : '#D9A441' }}
                  >
                    {displayName ?? ''}
                  </span>
                </div>
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
                aria-label="Menu"
              >
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: barColor, transform: menuOpen ? 'rotate(45deg) translateY(8px)' : undefined }}></span>
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: barColor, opacity: menuOpen ? 0 : 1 }}></span>
                <span className="block w-5 h-0.5 transition-all duration-200" style={{ backgroundColor: barColor, transform: menuOpen ? 'rotate(-45deg) translateY(-8px)' : undefined }}></span>
              </button>
            </div>
          </div>
          <nav className="hidden md:flex flex-wrap justify-center gap-x-3 pb-2">
            {isPopArt ? (
              <>
                {navItems.map((item, i) => {
                  const isActive = active === item.label
                  const accent = popNavAccents[i % popNavAccents.length]
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase ${isActive ? 'pop-nav-link--active' : ''}`}
                      style={{ borderBottomColor: isActive ? accent : 'transparent' }}
                    >
                      {item.label}
                    </Link>
                  )
                })}
                {isAdmin && (
                  <a
                    href="/admin"
                    className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase"
                    style={{ color: 'var(--pop-blue)', borderBottomColor: active === 'ADMIN' ? 'var(--pop-blue)' : 'transparent' }}
                  >
                    Admin
                  </a>
                )}
                {user && (
                  <form action="/auth/signout" method="POST">
                    <button
                      type="submit"
                      className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase"
                      style={{ color: 'var(--pop-red)' }}
                    >
                      Log Out
                    </button>
                  </form>
                )}
              </>
            ) : navItems.map(item => (
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
            {!isPopArt && isAdmin && (
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
            {!isPopArt && user && (
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
        {/* Comic Mode drops this strip entirely — the Picks page already
            has its own big countdown clock front and centre, so this was
            just a redundant sub-header eating space under the nav. */}
        {!isPopArt && nextDeadline && countdown && !countdown.expired && (
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
          <div className={isPopArt ? 'md:hidden border-t' : 'md:hidden border-t border-[#D9A441] bg-[#2A1F17] shadow-lg'} style={isPopArt ? { borderColor: 'rgba(255,255,255,0.15)', background: 'var(--pop-surface)' } : undefined}>
            {navItems.map((item, i) => {
              const isActive = active === item.label
              const accent = popNavAccents[i % popNavAccents.length]
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={isPopArt
                    ? {
                        color: isActive ? 'var(--pop-white)' : 'rgba(255,255,255,0.65)',
                        borderLeft: `4px solid ${isActive ? accent : 'transparent'}`,
                      }
                    : {
                        color: active === item.label ? '#2A1F17' : '#F5ECD9',
                        backgroundColor: active === item.label ? '#D9A441' : 'transparent'
                      }}
                  className={isPopArt
                    ? 'block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10'
                    : 'block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-[#3d2f22]'}
                >
                  {item.label}
                </Link>
              )
            })}
            {isAdmin && (
              <a
                href="/admin"
                onClick={() => setMenuOpen(false)}
                style={isPopArt
                  ? { color: 'var(--pop-blue)', borderLeft: `4px solid ${active === 'ADMIN' ? 'var(--pop-blue)' : 'transparent'}` }
                  : {
                      color: active === 'ADMIN' ? '#2A1F17' : '#F5ECD9',
                      backgroundColor: active === 'ADMIN' ? '#D9A441' : 'transparent'
                    }}
                className={isPopArt
                  ? 'block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10'
                  : 'block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-[#3d2f22]'}
              >
                Admin
              </a>
            )}
            {user && (
              <>
                <div className={isPopArt ? 'px-6 py-3 text-xs uppercase tracking-wider' : 'px-6 py-3 text-xs text-[#D9A441] uppercase tracking-wider'} style={isPopArt ? { color: 'rgba(255,255,255,0.5)' } : undefined}>
                  {displayName ?? ''}
                </div>
                <form action="/auth/signout" method="POST">
                  <button
                    type="submit"
                    className={isPopArt ? 'block w-full text-left px-6 py-4 text-sm font-bold tracking-widest uppercase' : 'block w-full text-left px-6 py-4 text-sm font-bold tracking-widest uppercase text-[#F5ECD9]'}
                    style={isPopArt ? { color: 'var(--pop-red)' } : undefined}
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
      <footer
        className={isPopArt ? 'py-4 mt-8 text-center' : 'border-t border-gray-200 py-4 mt-8 text-center'}
        style={isPopArt ? { borderTop: '2px solid rgba(255,255,255,0.15)' } : undefined}
      >
        <span
          className={isPopArt ? 'text-xs uppercase tracking-widest' : 'text-gray-400 text-xs uppercase tracking-widest'}
          style={isPopArt ? { color: 'rgba(255,255,255,0.5)' } : undefined}
        >
          LMS All-Stars Predictions
        </span>
      </footer>
      {kitPopupOpen && kitPopupPos && user && typeof document !== 'undefined' && createPortal(
        <div
          ref={kitPopupRef}
          className={isPopArt ? 'pop-art-theme fixed z-50 rounded-lg p-4' : 'fixed z-50 rounded-lg p-4 border shadow-2xl'}
          style={{
            top: kitPopupPos.top,
            left: kitPopupPos.left,
            width: KIT_POPUP_WIDTH,
            maxWidth: `calc(100vw - ${KIT_POPUP_MARGIN * 2}px)`,
            maxHeight: `calc(100vh - ${KIT_POPUP_MARGIN * 2}px)`,
            overflowY: 'auto',
            // Deliberately NOT the .pop-panel class here — it sets
            // position: relative, which (being defined later in the
            // cascade than Tailwind's .fixed utility) would silently
            // override this popup's fixed positioning and break it. Same
            // visual look via explicit styles instead.
            ...(isPopArt
              ? { background: 'var(--pop-surface)', border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', borderRadius: '16px' }
              : { backgroundColor: '#1e1914', borderColor: 'rgba(217,164,65,0.3)' }),
          }}
        >
          <h3
            className={isPopArt ? 'pop-headline text-lg mb-3' : 'text-xs font-bold uppercase tracking-wider mb-3'}
            style={isPopArt ? undefined : { color: '#D9A441', fontFamily: 'var(--font-heading), serif' }}
          >
            Change Your Kit
          </h3>
          <KitEditor
            userId={user.id}
            compact
            theme={theme}
            onSaved={newKit => {
              setKitBase({ pattern: newKit.pattern, colour1: newKit.colour1, colour2: newKit.colour2 })
              setKitColour3(newKit.colour3 ?? null)
              // Comic Mode gets a beat to show its "Kit Saved!" celebration
              // before the popup vanishes — closing instantly would mean
              // nobody ever sees it.
              if (isPopArt) {
                setTimeout(() => setKitPopupOpen(false), 1200)
              } else {
                setKitPopupOpen(false)
              }
            }}
          />
          <button
            onClick={() => setKitPopupOpen(false)}
            className={isPopArt ? 'pop-button pop-button--blue w-full mt-3 py-1.5 text-xs' : 'w-full mt-3 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider'}
            style={isPopArt ? undefined : { backgroundColor: 'rgba(245,236,217,0.1)', color: '#F5ECD9' }}
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}