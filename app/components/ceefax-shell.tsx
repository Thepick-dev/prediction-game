'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../lib/supabase'
import KitBadge from '../../components/KitBadge'
import { useCountdown } from '../lib/useCountdown'

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
  const [kit, setKit] = useState<{ pattern: string; colour1: string; colour2: string; stars: number; earths: number } | null>(null)
  const [nextDeadline, setNextDeadline] = useState<{ number: number; deadline: string } | null>(null)
  const countdown = useCountdown(nextDeadline?.deadline ?? null)

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
  }, [user?.id])

  return (
    <div className="min-h-screen">
      <header className="bg-[#2A1F17] border-b-4 border-[#D9A441] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link
              href="/"
              className="text-base sm:text-2xl tracking-wide uppercase whitespace-nowrap"
              style={{ fontFamily: 'var(--font-heading), serif', color: '#F5ECD9' }}
            >
              LMS All-Stars
            </Link>
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex flex-col items-center gap-0.5">
                  {/* Stars and globes flank the shirt (same style as the
                      Leaderboard), sized to fit this narrow bar on mobile
                      while still growing a bit on wider screens. */}
                  {kit && (
                    <KitBadge
                      pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2}
                      stars={kit.stars} earths={kit.earths}
                      size={36} iconTextClass="text-[10px] sm:text-sm"
                    />
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
            {user && (
              <div className="px-6 py-3 text-xs text-[#D9A441] uppercase tracking-wider">
                {displayName ?? ''}
              </div>
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
    </div>
  )
}