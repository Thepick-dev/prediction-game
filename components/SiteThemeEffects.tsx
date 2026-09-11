'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '../app/lib/supabase'
import { computeCompletedCompetitionPodium, type PodiumEntry } from '../app/lib/podium'
import { bonusCardDisplayName } from '../app/lib/players'

export type ActiveTheme =
  | 'default' | 'christmas' | 'easter' | 'halloween' | 'chanukah' | 'diwali' | 'eid'
  | 'newseason' | 'bonfire' | 'aprilfools' | 'valentines' | 'stpatricks' | 'bonuscard' | 'celebration'

const MEDAL_EMOJI = ['🥇', '🥈', '🥉']
const CONFETTI_COLOURS = ['#FA6100', '#CCFA00', '#00F2FA', '#A000FA', '#FA003C', '#FFD700']

// Ambient scattered emoji, gently bobbing in place — shared mechanism
// across every theme in this family; what makes each one actually feel
// distinct is the icon set and colour, not a bespoke animation per theme.
const FLOAT_CONFIG: Partial<Record<ActiveTheme, string[]>> = {
  easter: ['🥚', '🌸', '🐰', '🦋', '🐣'],
  halloween: ['🦇', '🎃', '👻', '🕷️'],
  chanukah: ['🕎', '✨', '🔷'],
  diwali: ['🪔', '✨', '🎇'],
  eid: ['🌙', '⭐', '✨'],
  aprilfools: ['🤡', '🙃', '🎉', '🃏'],
  valentines: ['💕', '💖', '🌹', '💘'],
  stpatricks: ['🍀', '☘️', '🌈'],
}

// "Festival of lights" themes get the same twinkling strip as Christmas,
// just recoloured — genuinely fitting for Chanukah/Diwali specifically,
// not just a reused effect for its own sake.
const LIGHTS_CONFIG: Partial<Record<ActiveTheme, string[]>> = {
  christmas: ['#FA003C', '#0F8A5F', '#FFD700'],
  chanukah: ['#4A90D9', '#C0C0C0', '#FFFFFF'],
  diwali: ['#FFB800', '#D9284B', '#FF7A00'],
}

const FIREWORK_CONFIG: Partial<Record<ActiveTheme, string[]>> = {
  newseason: ['#00F2FA', '#CCFA00', '#FA6100', '#A000FA'],
  bonfire: ['#D9284B', '#B8860B', '#FA6100', '#7B2FF7'],
}

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i)
}

// Site-wide seasonal/celebratory dressing, toggled from /admin. Reads a
// single public row (site_theme) rather than anything per-page, and sets a
// data-site-theme attribute on <html> so plain CSS selectors in
// globals.css can reskin things like the hero title glow everywhere at
// once — no other page needs to know this exists.
//
// Every randomised layout is generated via useMemo keyed on `theme` (not
// inline in JSX, and not on every render) — Shell re-renders often (its
// own countdown ticks every second) and this component isn't memoised
// against that, so generating "random" values directly in the render body
// re-rolled every particle's position on every parent tick, making the
// whole effect visibly jump. useMemo freezes the layout once theme
// settles; only the CSS animation moves after that.
//
// Isolated from the rest of the app on purpose: a failure here (missing
// table, a network hiccup) must never take any real page down with it.
export default function SiteThemeEffects() {
  const [theme, setTheme] = useState<ActiveTheme | null>(null)
  const [celebration, setCelebration] = useState<{ competitionName: string; podium: PodiumEntry[] } | null>(null)
  const [bonusCardCelebration, setBonusCardCelebration] = useState<{ userName: string; cardLabel: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.from('site_theme').select('active_theme, celebration_competition_id, bonus_card_user_id').eq('id', 'singleton').maybeSingle()
        if (cancelled || !data) return
        setTheme(data.active_theme as ActiveTheme)
        if (data.active_theme === 'celebration' && data.celebration_competition_id) {
          const [{ data: comp }, podium] = await Promise.all([
            supabase.from('competitions').select('name').eq('id', data.celebration_competition_id).maybeSingle(),
            computeCompletedCompetitionPodium(supabase, data.celebration_competition_id),
          ])
          if (!cancelled) setCelebration({ competitionName: comp?.name ?? 'Competition', podium })
        }
        if (data.active_theme === 'bonuscard' && data.bonus_card_user_id) {
          const [{ data: profile }, { data: comp }] = await Promise.all([
            supabase.from('profiles').select('display_name').eq('id', data.bonus_card_user_id).maybeSingle(),
            supabase.from('competitions').select('bonus_card_name, bonus_card_player_id').eq('status', 'active').maybeSingle(),
          ])
          let playerName: string | null = null
          if (comp?.bonus_card_player_id) {
            const { data: player } = await supabase.from('players').select('name').eq('id', comp.bonus_card_player_id).maybeSingle()
            playerName = player?.name ?? null
          }
          if (!cancelled) {
            setBonusCardCelebration({
              userName: profile?.display_name ?? 'Someone',
              cardLabel: bonusCardDisplayName(comp?.bonus_card_name, playerName),
            })
          }
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

  const snowflakes = useMemo(() => {
    if (theme !== 'christmas') return []
    return range(20).map(() => ({
      left: Math.random() * 100,
      size: 10 + Math.random() * 16,
      duration: 14 + Math.random() * 12,
      delay: Math.random() * -24,
      drift: 20 + Math.random() * 40,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  const floatEmoji = theme ? FLOAT_CONFIG[theme] : undefined
  const floatPieces = useMemo(() => {
    if (!floatEmoji) return []
    return range(20).map((_, i) => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      emoji: floatEmoji[i % floatEmoji.length],
      size: 14 + Math.random() * 14,
      duration: 7 + Math.random() * 6,
      delay: Math.random() * -10,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  const lightColours = theme ? LIGHTS_CONFIG[theme] : undefined
  const lights = useMemo(() => {
    if (!lightColours) return []
    return range(18).map((_, i) => ({ colour: lightColours[i % lightColours.length], delay: Math.random() * -3 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  const fireworkColours = theme ? FIREWORK_CONFIG[theme] : undefined
  const fireworkBursts = useMemo(() => {
    if (!fireworkColours) return []
    return range(6).map((_, gi) => ({
      originX: 10 + Math.random() * 80,
      originY: 12 + Math.random() * 45,
      colour: fireworkColours[gi % fireworkColours.length],
      delay: -(gi * 1.3 + Math.random()),
      particles: range(12).map(() => {
        const angle = Math.random() * Math.PI * 2
        const distance = 36 + Math.random() * 46
        return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance }
      }),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  const confettiPieces = useMemo(() => {
    if (theme !== 'celebration') return []
    return range(50).map((_, i) => ({
      left: Math.random() * 100,
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
      duration: 4 + Math.random() * 5,
      delay: Math.random() * -5,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // Same falling-confetti motion as Celebration, but small photo thumbnails
  // of the current Bonus Card player instead of coloured rectangles — the
  // same public/bonus-card-player.png admin already keeps up to date for
  // the Bonus Card feature itself elsewhere on the site.
  const photoConfettiPieces = useMemo(() => {
    if (theme !== 'bonuscard') return []
    return range(30).map(() => ({
      left: Math.random() * 100,
      duration: 4.5 + Math.random() * 5,
      delay: Math.random() * -5,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  if (!theme || theme === 'default') return null

  return (
    <>
      {lights.length > 0 && (
        <div className="site-lights" aria-hidden="true">
          {lights.map((l, i) => (
            <span key={i} className="site-light" style={{ background: l.colour, boxShadow: `0 0 6px ${l.colour}`, animationDelay: `${l.delay}s` }} />
          ))}
        </div>
      )}

      {theme === 'christmas' && (
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
      )}

      {floatPieces.length > 0 && (
        <div className="site-float-layer" aria-hidden="true">
          {floatPieces.map((p, i) => (
            <span
              key={i}
              className="site-float-piece"
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

      {fireworkBursts.length > 0 && (
        <div className="site-firework-layer" aria-hidden="true">
          {fireworkBursts.map((burst, gi) => (
            <div key={gi} className="site-firework-group" style={{ left: `${burst.originX}%`, top: `${burst.originY}%` }}>
              {burst.particles.map((pt, pi) => (
                <span
                  key={pi}
                  className="site-firework-particle"
                  style={{
                    background: burst.colour,
                    boxShadow: `0 0 4px ${burst.colour}`,
                    animationDuration: '6.5s',
                    animationDelay: `${burst.delay}s`,
                    ['--dx' as string]: `${pt.dx}px`,
                    ['--dy' as string]: `${pt.dy}px`,
                  }}
                />
              ))}
            </div>
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
                width: 'min(92vw, 420px)',
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

      {theme === 'bonuscard' && (
        <>
          <div className="site-confetti" aria-hidden="true">
            {photoConfettiPieces.map((c, i) => (
              <img
                key={i}
                src="/bonus-card-player.png"
                alt=""
                className="site-photo-confetti-piece"
                style={{
                  left: `${c.left}%`,
                  animationDuration: `${c.duration}s`,
                  animationDelay: `${c.delay}s`,
                }}
              />
            ))}
          </div>

          {bonusCardCelebration && !dismissed && (
            <div
              className="fixed left-1/2 z-[260] px-5 py-3 rounded-2xl text-center"
              style={{
                top: 8,
                transform: 'translateX(-50%)',
                width: 'min(92vw, 380px)',
                background: 'var(--pop-surface)',
                border: '2px solid var(--pop-orange)',
                boxShadow: '0 0 22px rgba(250,97,0,0.5), 0 4px 18px rgba(0,0,0,0.5)',
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
              <div className="flex items-center justify-center gap-3">
                <img src="/bonus-card-player.png" alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--pop-orange)' }} />
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-widest font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>🃏 {bonusCardCelebration.cardLabel} Strikes!</p>
                  <p className="font-black text-sm" style={{ color: 'var(--pop-white)' }}>{bonusCardCelebration.userName}&apos;s Bonus Card came up big!</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
