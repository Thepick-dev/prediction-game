'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '../app/lib/supabase'
import { computeCompletedCompetitionPodium, type PodiumEntry } from '../app/lib/podium'

type ActiveTheme = 'default' | 'christmas' | 'easter' | 'celebration'

const MEDAL_EMOJI = ['🥇', '🥈', '🥉']
const CONFETTI_COLOURS = ['#FA6100', '#CCFA00', '#00F2FA', '#A000FA', '#FA003C', '#FFD700']
const LIGHT_COLOURS = ['#FA003C', '#0F8A5F', '#FFD700', '#FA003C', '#0F8A5F']
const EASTER_EMOJI = ['🥚', '🌸', '🐰', '🦋', '🐣']

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i)
}

// Site-wide seasonal/celebratory dressing, toggled from /admin. Reads a
// single public row (site_theme) rather than anything per-page, and sets a
// data-site-theme attribute on <html> so plain CSS selectors in
// globals.css can reskin things like the hero title glow everywhere at
// once — no other page needs to know this exists.
//
// Every randomised layout (snowflake positions, confetti colours, egg
// placement) is generated exactly once via useMemo with an empty
// dependency array, NOT inline in the JSX. Shell re-renders often — its
// own countdown ticks every second — and this component isn't memoized
// against that, so generating "random" values directly in the render body
// was re-rolling every flake's position on every parent tick, making the
// whole effect visibly jump around. useMemo freezes the layout at first
// mount; only the CSS animation moves after that.
//
// Isolated from the rest of the app on purpose: a failure here (missing
// table before the migration's been run, a network hiccup) must never
// take any real page down with it.
export default function SiteThemeEffects() {
  const [theme, setTheme] = useState<ActiveTheme | null>(null)
  const [celebration, setCelebration] = useState<{ competitionName: string; podium: PodiumEntry[] } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.from('site_theme').select('active_theme, celebration_competition_id').eq('id', 'singleton').maybeSingle()
        if (cancelled || !data) return
        setTheme(data.active_theme as ActiveTheme)
        if (data.active_theme === 'celebration' && data.celebration_competition_id) {
          const [{ data: comp }, podium] = await Promise.all([
            supabase.from('competitions').select('name').eq('id', data.celebration_competition_id).maybeSingle(),
            computeCompletedCompetitionPodium(supabase, data.celebration_competition_id),
          ])
          if (!cancelled) setCelebration({ competitionName: comp?.name ?? 'Competition', podium })
        }
      } catch {
        // No theme table yet, or a network hiccup — the site just runs
        // undecorated, never a broken page over this.
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!theme || theme === 'default') return
    document.documentElement.dataset.siteTheme = theme
    return () => { delete document.documentElement.dataset.siteTheme }
  }, [theme])

  // Fewer, larger, slower flakes read as calm snowfall; the old 40-flake
  // fast fall was the other half of "annoying" (independent of the jump
  // bug above) — this is a deliberately gentler pass, not just a bugfix.
  const snowflakes = useMemo(() => range(20).map(() => ({
    left: Math.random() * 100,
    size: 10 + Math.random() * 16,
    duration: 14 + Math.random() * 12,
    delay: Math.random() * -24,
    drift: 20 + Math.random() * 40,
  })), [])

  const lights = useMemo(() => range(18).map((_, i) => ({
    colour: LIGHT_COLOURS[i % LIGHT_COLOURS.length],
    delay: Math.random() * -3,
  })), [])

  const confettiPieces = useMemo(() => range(50).map((_, i) => ({
    left: Math.random() * 100,
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    duration: 4 + Math.random() * 5,
    delay: Math.random() * -5,
  })), [])

  const easterPieces = useMemo(() => range(20).map((_, i) => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    emoji: EASTER_EMOJI[i % EASTER_EMOJI.length],
    size: 14 + Math.random() * 14,
    duration: 7 + Math.random() * 6,
    delay: Math.random() * -10,
  })), [])

  if (!theme || theme === 'default') return null

  return (
    <>
      {theme === 'christmas' && (
        <>
          <div className="site-christmas-lights" aria-hidden="true">
            {lights.map((l, i) => (
              <span
                key={i}
                className="site-christmas-light"
                style={{ background: l.colour, boxShadow: `0 0 6px ${l.colour}`, animationDelay: `${l.delay}s` }}
              />
            ))}
          </div>
          <div className="site-snowfall" aria-hidden="true">
            {snowflakes.map((f, i) => (
              <span
                key={i}
                className="site-snowflake"
                style={{
                  left: `${f.left}%`,
                  fontSize: `${f.size}px`,
                  animationDuration: `${f.duration}s`,
                  animationDelay: `${f.delay}s`,
                  ['--drift' as string]: `${f.drift}px`,
                }}
              >❄</span>
            ))}
          </div>
        </>
      )}

      {theme === 'easter' && (
        <div className="site-easter-float" aria-hidden="true">
          {easterPieces.map((p, i) => (
            <span
              key={i}
              className="site-easter-piece"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                fontSize: `${p.size}px`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            >{p.emoji}</span>
          ))}
        </div>
      )}

      {theme === 'celebration' && (
        <>
          <div className="site-confetti" aria-hidden="true">
            {confettiPieces.map((c, i) => (
              <span
                key={i}
                className="site-confetti-piece"
                style={{
                  left: `${c.left}%`,
                  background: c.colour,
                  animationDuration: `${c.duration}s`,
                  animationDelay: `${c.delay}s`,
                }}
              />
            ))}
          </div>

          {celebration && celebration.podium.length > 0 && !dismissed && (
            <div
              className="fixed left-1/2 z-[260] px-5 py-3 rounded-2xl text-center"
              style={{
                top: 8,
                transform: 'translateX(-50%)',
                maxWidth: 'min(92vw, 420px)',
                background: 'var(--pop-surface)',
                border: '2px solid var(--pop-pink)',
                boxShadow: '0 0 22px rgba(160,0,250,0.5), 0 4px 18px rgba(0,0,0,0.5)',
              }}
            >
              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="absolute top-1.5 right-2.5 text-xs font-black"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                ✕
              </button>
              <p className="text-[10px] uppercase tracking-widest font-black mb-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
                🏆 {celebration.competitionName} Champions
              </p>
              <div className="flex items-center justify-center gap-4">
                {celebration.podium.map((p, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span style={{ fontSize: i === 0 ? '28px' : '20px', lineHeight: 1 }}>{MEDAL_EMOJI[i]}</span>
                    <span className="font-black truncate" style={{ fontSize: i === 0 ? '13px' : '11px', color: 'var(--pop-white)', maxWidth: 100 }}>{p.name}</span>
                    <span className="font-bold" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>{p.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
