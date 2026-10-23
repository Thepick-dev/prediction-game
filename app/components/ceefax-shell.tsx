'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { createClient } from '../lib/supabase'
import KitBadge from '../../components/KitBadge'
import KitEditor from '../../components/KitEditor'
import LiveMatchAlerts from '../../components/LiveMatchAlerts'
import SiteThemeEffects from '../../components/SiteThemeEffects'
import InstallPrompt from '../../components/InstallPrompt'
import GhostNoticeModal from '../../components/GhostNoticeModal'
import LoadingTransition from '../../components/LoadingTransition'
import PopArtLoading from '../../components/PopArtLoading'
import { useCountdown } from '../lib/useCountdown'
import { useRetroA11yPrefs } from '../lib/useRetroA11yPrefs'
import { RetroFutzy, RetroHud, RetroHudStat } from '../../components/retro'

const KIT_POPUP_WIDTH = 288
const KIT_POPUP_MARGIN = 8

type Props = {
  children: React.ReactNode
  active?: string
  user?: any
  displayName?: string
  // 'pop-art' or 'retro' — passed down from the page's own useSkin() call
  // (app/lib/useSkin.ts), not stored here, so Shell has no theme state of
  // its own.
  skin?: 'pop-art' | 'retro'
  // Deprecated — accepted-but-ignored, purely so pages not yet migrated to
  // the `skin` prop don't need an immediate edit. Classic itself is gone
  // (see app/lib/usePopArtTheme.ts); remove this once every call site
  // passes `skin` instead (grep for `theme={` in app/).
  theme?: 'classic' | 'pop-art'
  // The calling page's own "my content isn't ready yet" signal. Shell
  // combines this with its own header data readiness (see `shellReady`
  // below) so the loading card never fades until BOTH are done — otherwise
  // the kit badge, Admin link, Rugby link and Futzy-says ticker visibly
  // pop into the header after the page already looks loaded.
  loading?: boolean
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
  { label: 'RULES', href: '/rules' },
  { label: 'NEWS', href: '/news' },
  { label: 'THE WALL', href: '/wall' },
  { label: 'WINNERS', href: '/archive' },
  { label: 'SETTINGS', href: '/settings' },
]

export default function Shell({ children, active, user, displayName, skin = 'pop-art', loading = false }: Props) {
  const isRetro = skin === 'retro'
  const { dataAttrs: a11yAttrs } = useRetroA11yPrefs()
  const [menuOpen, setMenuOpen] = useState(false)
  // Every independent header fetch below reports in here (success or
  // failure alike — a missing column must never keep the loading card up
  // forever) via markSettled, and shellReady only flips true once all of
  // them have. A hard 2s timeout forces it open regardless, so a fetch
  // added later without wiring in markSettled degrades to "briefly
  // jerky again" rather than "stuck behind the loading card forever".
  const [settled, setSettled] = useState<Record<string, boolean>>({})
  const [forceReady, setForceReady] = useState(false)
  function markSettled(key: string) {
    setSettled(prev => (prev[key] ? prev : { ...prev, [key]: true }))
  }
  useEffect(() => {
    const t = setTimeout(() => setForceReady(true), 2000)
    return () => clearTimeout(t)
  }, [])
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
  const [futzySaysLines, setFutzySaysLines] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showRugbyLink, setShowRugbyLink] = useState(false)
  // Reuses the existing Wall Mode setting from /admin/wall (open_auto /
  // manual_review / read_only / hidden) rather than a separate on/off
  // flag — 'hidden' is already exactly "the Wall disappears for everyone
  // but admin, nothing deleted," so a second toggle would just be two
  // sources of truth that could disagree.
  const [wallMode, setWallMode] = useState<'open_auto' | 'manual_review' | 'read_only' | 'hidden'>('manual_review')
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
    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('is_admin, is_super_admin')
          .eq('id', user.id)
          .single()
        setIsAdmin(!!(data?.is_admin || data?.is_super_admin))
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('admin')
      }
    })()
  }, [user?.id])

  // Only fetched once we know the user's actually an admin — a normal
  // player never hits this endpoint at all.
  useEffect(() => {
    if (!isAdmin) return
    ;(async () => {
      try {
        const res = await fetch('/api/admin/pending-count')
        const data = await res.json()
        setPendingCount(data.count ?? 0)
      } catch {
        // isolated — a problem here should only mean the badge doesn't show
      } finally {
        markSettled('pendingCount')
      }
    })()
  }, [isAdmin])

  // Its own isolated query into a whole separate Postgres schema — a
  // problem here (rugby not launched yet, the column missing, whatever)
  // must never be able to take the rest of the football header down with
  // it, same reasoning as every other optional fetch in this file. Shown
  // to any signed-in visitor once admin has opened rugby.competitions'
  // public_signups_enabled toggle on /admin/rugby.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .schema('rugby')
          .from('competitions')
          .select('public_signups_enabled')
          .eq('status', 'active')
          .maybeSingle()
        setShowRugbyLink(data?.public_signups_enabled === true)
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('rugby')
      }
    })()
  }, [user?.id])

  // Defaults to 'manual_review' (shown, same as the column's own default
  // on /admin/wall) — a problem reading this should never accidentally
  // hide The Wall nav item for everyone.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('competitions')
          .select('wall_mode')
          .eq('status', 'active')
          .maybeSingle()
        setWallMode(data?.wall_mode ?? 'manual_review')
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('wallMode')
      }
    })()
  }, [user?.id])

  // Deliberately its own query, independent of the kit fetch below — if the
  // competition/gameweek lookup ever fails, it should only mean no deadline
  // strip shows, never take the kit badge or the rest of the header with it.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    ;(async () => {
      try {
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
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('deadline')
      }
    })()
  }, [user?.id])

  // Same isolation reasoning as the deadline lookup just above — a brand
  // new, purely decorative feature, so a problem here must never take the
  // rest of the header down with it. Shown to any signed-in visitor, same
  // as the header itself, not gated on being on a "pop-art" page.
  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('competitions')
          .select('futzy_says_text')
          .eq('status', 'active')
          .single()
        const lines = (data?.futzy_says_text ?? '').split('\n').map((l: string) => l.trim()).filter(Boolean)
        setFutzySaysLines(lines)
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('futzy')
      }
    })()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const supabase = createClient()

    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('kit_pattern, kit_colour_1, kit_colour_2')
          .eq('id', user.id)
          .single()
        if (data) {
          setKitBase({
            pattern: data.kit_pattern ?? 'solid',
            colour1: data.kit_colour_1 ?? '#1E4D6B',
            colour2: data.kit_colour_2 ?? '#F5ECD9',
          })
        }
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('kitBase')
      }
    })()

    // Kept as its own request, deliberately separate from the query above:
    // if these columns ever have a problem, it should only affect the
    // sleeve badges, never take down the kit shirt itself with it.
    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('kit_stars, kit_earths')
          .eq('id', user.id)
          .single()
        if (data) {
          setKitStars(data.kit_stars ?? 0)
          setKitEarths(data.kit_earths ?? 0)
        }
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('kitBadges')
      }
    })()

    // Also its own request, same reason as kit_stars/kit_earths above — the
    // trim colour is a newer, optional column, and this must never be able
    // to take the shirt/stars/earths down with it if it's missing.
    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('kit_colour_3')
          .eq('id', user.id)
          .single()
        if (data) {
          setKitColour3(data.kit_colour_3 ?? null)
        }
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('kitColour3')
      }
    })()

    // Also its own request, same reason — the minigame score shirt number
    // is a separate feature entirely, so a problem with it must never be
    // able to take the shirt itself down with it.
    ;(async () => {
      try {
        const { data } = await supabase
          .from('minigame_penalty_scores')
          .select('best_score')
          .eq('user_id', user.id)
          .single()
        setTopScore(data?.best_score ?? 0)
      } catch {
        // isolated — see Props.loading comment above
      } finally {
        markSettled('topScore')
      }
    })()
  }, [user?.id])

  // Computed once, used by both the retro and pop-art branches below —
  // when Wall Mode is set to "hidden" (see /admin/wall), it simply isn't
  // in the list for anyone but admin, same bypass reasoning as the Wall
  // page's own "hidden" block (admin still needs a way back in to turn
  // it back on).
  const visibleNavItems = navItems.filter(item => wallMode !== 'hidden' || isAdmin || item.href !== '/wall')

  // Everything this header fetches independently above (admin status,
  // pending count if admin, rugby link, wall mode, deadline, Futzy-says
  // ticker, kit) must ALL have reported in — not just the page's own
  // `loading` prop — before the card fades, or the header keeps visibly
  // assembling itself underneath after content already looks ready.
  const requiredSettleKeys = user?.id
    ? ['admin', 'rugby', 'wallMode', 'deadline', 'futzy', 'kitBase', 'kitBadges', 'kitColour3', 'topScore', ...(isAdmin ? ['pendingCount'] : [])]
    : []
  const shellReady = forceReady || requiredSettleKeys.every(k => settled[k])

  if (isRetro) {
    return (
      <LoadingTransition loading={loading || !shellReady} loadingView={<PopArtLoading />}>
      <div className="retro-theme min-h-screen flex flex-col" {...a11yAttrs}>
        <div className="retro-crt-layer" aria-hidden="true" />
        <InstallPrompt />
        <GhostNoticeModal userId={user?.id} />
        <header className="sticky top-0 z-50" style={{ background: 'var(--retro-bg)', borderBottom: `var(--retro-px) solid var(--retro-border)` }}>
          {futzySaysLines.length > 0 && (
            <div
              className="whitespace-nowrap overflow-hidden text-ellipsis px-4 py-1"
              style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 16, color: 'var(--retro-blue-light)', borderBottom: 'var(--retro-px) solid var(--retro-border)' }}
            >
              FUTZY SAYS: {futzySaysLines.join(' • ')}
            </div>
          )}
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex items-center justify-between h-16 gap-3">
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <RetroFutzy size={36} />
                <span
                  className="hidden sm:inline"
                  style={{ fontFamily: 'var(--font-retro-display)', fontSize: 12, color: 'var(--retro-gold)', textShadow: 'var(--retro-px) var(--retro-px) 0 #000' }}
                >
                  LMS ALL-STARS
                </span>
              </Link>

              <RetroHud className="flex-1 justify-center hidden sm:flex">
                {nextDeadline && countdown && !countdown.expired && (
                  <RetroHudStat
                    label={`GW${nextDeadline.number}`}
                    value={`${countdown.days > 0 ? `${countdown.days}D ` : ''}${countdown.hours}H ${countdown.mins}M`}
                  />
                )}
              </RetroHud>

              <div className="flex items-center gap-3 shrink-0">
                {user && kit && (
                  <button ref={kitTriggerRef} type="button" onClick={openKitPopup} aria-label="Change your kit">
                    <KitBadge
                      pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2} colour3={kit.colour3}
                      stars={kit.stars} earths={kit.earths}
                      size={36} iconTextClass="text-[10px] sm:text-sm"
                      topScore={topScore}
                    />
                  </button>
                )}
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
                  aria-label="Menu"
                >
                  <span className="block w-5 h-0.5" style={{ background: 'var(--retro-ink)' }} />
                  <span className="block w-5 h-0.5" style={{ background: 'var(--retro-ink)' }} />
                  <span className="block w-5 h-0.5" style={{ background: 'var(--retro-ink)' }} />
                </button>
              </div>
            </div>

            <nav className="hidden md:flex flex-wrap justify-center gap-x-1 pb-2">
              {visibleNavItems.map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="retro-button retro-button--menu"
                  data-active={active === item.label ? 'true' : 'false'}
                  style={{ fontSize: 9 }}
                >
                  {item.label}
                </Link>
              ))}
              {showRugbyLink && (
                <a href="/rugby" className="retro-button retro-button--menu" style={{ fontSize: 9, color: 'var(--retro-blue-light)' }}>
                  RUGBY
                </a>
              )}
              {isAdmin && (
                <a href="/admin" className="retro-button retro-button--menu" style={{ fontSize: 9, color: 'var(--retro-blue-light)' }}>
                  ADMIN{pendingCount > 0 ? ` (${pendingCount > 9 ? '9+' : pendingCount})` : ''}
                </a>
              )}
              {user && (
                <form action="/auth/signout" method="POST">
                  <button type="submit" className="retro-button retro-button--menu" style={{ fontSize: 9, color: 'var(--retro-red-light)' }}>
                    LOG OUT
                  </button>
                </form>
              )}
            </nav>
          </div>

          {menuOpen && (
            <div className="md:hidden retro-menu px-4 py-3" style={{ background: 'var(--retro-panel-mid)', borderTop: 'var(--retro-px) solid var(--retro-border)' }}>
              {visibleNavItems.map(item => (
                <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="retro-menu-item" data-active={active === item.label ? 'true' : 'false'}>
                  <span className="retro-menu-cursor" aria-hidden="true">▶</span>
                  {item.label}
                </Link>
              ))}
              {showRugbyLink && (
                <a href="/rugby" onClick={() => setMenuOpen(false)} className="retro-menu-item">
                  <span className="retro-menu-cursor" aria-hidden="true">▶</span>
                  RUGBY
                </a>
              )}
              {isAdmin && (
                <a href="/admin" onClick={() => setMenuOpen(false)} className="retro-menu-item">
                  <span className="retro-menu-cursor" aria-hidden="true">▶</span>
                  ADMIN{pendingCount > 0 ? ` (${pendingCount > 9 ? '9+' : pendingCount})` : ''}
                </a>
              )}
              {user && (
                <form action="/auth/signout" method="POST">
                  <button type="submit" className="retro-menu-item">
                    <span className="retro-menu-cursor" aria-hidden="true">▶</span>
                    LOG OUT
                  </button>
                </form>
              )}
            </div>
          )}
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full">
          {children}
        </main>

        <footer className="py-4 text-center" style={{ borderTop: 'var(--retro-px) solid var(--retro-border)' }}>
          <span style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 14, color: 'var(--retro-grey-light)' }}>
            © LMS ALL-STARS
          </span>
          <div className="flex items-center justify-center gap-4 mt-2">
            {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Cookies', '/cookies']].map(([label, href]) => (
              <a key={href} href={href} style={{ fontFamily: 'var(--font-retro-mono)', fontSize: 14, color: 'var(--retro-grey-light)' }}>
                {label}
              </a>
            ))}
          </div>
        </footer>

        {kitPopupOpen && kitPopupPos && user && typeof document !== 'undefined' && createPortal(
          <div
            ref={kitPopupRef}
            className="retro-window fixed z-50"
            style={{
              top: kitPopupPos.top,
              left: kitPopupPos.left,
              width: KIT_POPUP_WIDTH,
              maxWidth: `calc(100vw - ${KIT_POPUP_MARGIN * 2}px)`,
              maxHeight: `calc(100vh - ${KIT_POPUP_MARGIN * 2}px)`,
              overflowY: 'auto',
            }}
          >
            {/* KitEditor hasn't been migrated to the retro skin yet — it
                still only knows 'classic'/'pop-art'. Deliberately rendered
                pop-art-styled inside this retro window for now (same kind
                of "island" as the Penalty Shootout minigame) rather than
                half-reskinning it; a real pass is a separate task. */}
            <div className="pop-art-theme" style={{ background: 'transparent' }}>
              <h3 className="pop-headline text-lg mb-2">Change Your Kit</h3>
              <KitEditor
                userId={user.id}
                compact
                theme="pop-art"
                onSaved={newKit => {
                  setKitBase({ pattern: newKit.pattern, colour1: newKit.colour1, colour2: newKit.colour2 })
                  setKitColour3(newKit.colour3 ?? null)
                  setTimeout(() => setKitPopupOpen(false), 1200)
                }}
              />
            </div>
            <button onClick={() => setKitPopupOpen(false)} className="retro-button retro-button--select w-full mt-3">
              Close
            </button>
          </div>,
          document.body
        )}
      </div>
      </LoadingTransition>
    )
  }

  const barColor = 'var(--pop-white)'

  return (
    <LoadingTransition loading={loading || !shellReady} loadingView={<PopArtLoading />}>
    <div className="min-h-screen pop-art-theme">
      <LiveMatchAlerts />
      <SiteThemeEffects />
      <InstallPrompt />
      <GhostNoticeModal userId={user?.id} />
      <header
        className="sticky top-0 z-50"
        style={{ borderBottom: '2px solid rgba(255,255,255,0.15)' }}
      >
        {futzySaysLines.length > 0 && (
          // Admin-editable, one line each — see /admin/competitions. Full-
          // width and outside the max-w-4xl wrapper below on purpose, so it
          // reads as its own banner rather than being boxed in with the nav.
          <div className="overflow-hidden whitespace-nowrap" style={{ background: 'rgba(160,0,250,0.18)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div
              className="pop-ticker-track inline-flex items-center py-1 font-black uppercase"
              style={{ fontSize: '11px', color: 'var(--pop-green)', animationDuration: `${Math.max(15, futzySaysLines.join(' ').length * 0.2)}s` }}
            >
              {[0, 1].map(dup => (
                <span key={dup} className="inline-flex items-center shrink-0">
                  {futzySaysLines.map((line, i) => (
                    <span key={i} className="inline-flex items-center shrink-0">
                      <span className="mx-4">Futzy says: {line}</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex sm:grid sm:grid-cols-3 items-center justify-between h-14">
            <Link
              href="/"
              className="whitespace-nowrap sm:col-start-2 sm:text-center sm:justify-self-center flex items-center justify-center gap-2"
            >
              <img src="/logo.png" alt="" width={1118} height={960} className="w-[54px] sm:w-9 h-auto" />
              <span className="pop-hero pop-hero--pink inline-block text-lg sm:text-2xl tracking-wide uppercase">
                LMS All-Stars
              </span>
            </Link>
            <div className="flex items-center gap-3 sm:col-start-3 sm:justify-self-end">
              {user && (
                <div className="flex items-center">
                  {/* Stars and globes flank the shirt (same style as the
                      Leaderboard), sized to fit this narrow bar on mobile
                      while still growing a bit on wider screens. */}
                  {kit && (
                    <button ref={kitTriggerRef} type="button" onClick={openKitPopup} aria-label="Change your kit">
                      <KitBadge
                        pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2} colour3={kit.colour3}
                        stars={kit.stars} earths={kit.earths}
                        size={40} iconTextClass="text-[10px] sm:text-sm"
                        starColor="var(--pop-green)"
                        topScore={topScore}
                      />
                    </button>
                  )}
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
            {visibleNavItems.map((item, i) => {
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
            {showRugbyLink && (
              <a
                href="/rugby"
                className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase"
                style={{ color: 'var(--pop-orange)' }}
              >
                🏉 Rugby
              </a>
            )}
            {isAdmin && (
              <a
                href="/admin"
                className="pop-nav-link px-1 py-1.5 text-[10px] lg:text-xs font-bold tracking-wide whitespace-nowrap uppercase inline-flex items-center gap-1"
                style={{ color: 'var(--pop-blue)', borderBottomColor: active === 'ADMIN' ? 'var(--pop-blue)' : 'transparent' }}
              >
                Admin
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white" style={{ width: 16, height: 16, fontSize: 9, fontWeight: 900 }}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
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
          </nav>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t" style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'var(--pop-surface)' }}>
            {visibleNavItems.map((item, i) => {
              const isActive = active === item.label
              const accent = popNavAccents[i % popNavAccents.length]
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    color: isActive ? 'var(--pop-white)' : 'rgba(255,255,255,0.65)',
                    borderLeft: `4px solid ${isActive ? accent : 'transparent'}`,
                  }}
                  className="block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10"
                >
                  {item.label}
                </Link>
              )
            })}
            {showRugbyLink && (
              <a
                href="/rugby"
                onClick={() => setMenuOpen(false)}
                style={{ color: 'var(--pop-orange)', borderLeft: '4px solid transparent' }}
                className="flex items-center gap-2 px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10"
              >
                🏉 Rugby
              </a>
            )}
            {isAdmin && (
              <a
                href="/admin"
                onClick={() => setMenuOpen(false)}
                style={{ color: 'var(--pop-blue)', borderLeft: `4px solid ${active === 'ADMIN' ? 'var(--pop-blue)' : 'transparent'}` }}
                className="flex items-center gap-2 px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-white/10"
              >
                Admin
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white" style={{ width: 18, height: 18, fontSize: 10, fontWeight: 900 }}>
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </a>
            )}
            {user && (
              <>
                <div className="px-6 py-3 text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {displayName ?? ''}
                </div>
                <form action="/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="block w-full text-left px-6 py-4 text-sm font-bold tracking-widest uppercase"
                    style={{ color: 'var(--pop-red)' }}
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
        className="py-4 mt-8 text-center"
        style={{ borderTop: '2px solid rgba(255,255,255,0.15)' }}
      >
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          LMS All-Stars Predictions
        </span>
        <div className="flex items-center justify-center gap-4 mt-2">
          {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Cookies', '/cookies']].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-xs uppercase tracking-widest"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              {label}
            </a>
          ))}
        </div>
      </footer>
      {kitPopupOpen && kitPopupPos && user && typeof document !== 'undefined' && createPortal(
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
            // Deliberately NOT the .pop-panel class here — it sets
            // position: relative, which (being defined later in the
            // cascade than Tailwind's .fixed utility) would silently
            // override this popup's fixed positioning and break it. Same
            // visual look via explicit styles instead.
            background: 'var(--pop-surface)', border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', borderRadius: '16px',
          }}
        >
          <h3 className="pop-headline text-lg mb-2">
            Change Your Kit
          </h3>
          <KitEditor
            userId={user.id}
            compact
            theme="pop-art"
            onSaved={newKit => {
              setKitBase({ pattern: newKit.pattern, colour1: newKit.colour1, colour2: newKit.colour2 })
              setKitColour3(newKit.colour3 ?? null)
              // Comic Mode gets a beat to show its "Kit Saved!" celebration
              // before the popup vanishes — closing instantly would mean
              // nobody ever sees it.
              setTimeout(() => setKitPopupOpen(false), 1200)
            }}
          />
          <button
            onClick={() => setKitPopupOpen(false)}
            className="pop-button pop-button--blue w-full mt-3 py-1.5 text-xs"
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </div>
    </LoadingTransition>
  )
}
