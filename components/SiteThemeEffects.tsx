'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../app/lib/supabase'
import { computeCompletedCompetitionPodium, type PodiumEntry } from '../app/lib/podium'

type ActiveTheme = 'default' | 'christmas' | 'celebration'

const MEDAL_EMOJI = ['🥇', '🥈', '🥉']
const CONFETTI_COLOURS = ['#FA6100', '#CCFA00', '#00F2FA', '#A000FA', '#FA003C', '#FFD700']

// Site-wide seasonal/celebratory dressing, toggled from /admin. Reads a
// single public row (site_theme) rather than anything per-page, and sets a
// data-site-theme attribute on <html> so plain CSS selectors in
// globals.css can reskin things like the hero title glow everywhere at
// once — no other page needs to know this exists. The confetti/snow are
// lightweight CSS-animated spans (randomised per mount), not a canvas or
// a new library, matching how every other ambient effect on this site is
// built. Isolated from the rest of the app on purpose: a failure here
// (missing table before the migration's been run, a network hiccup) must
// never take any real page down with it.
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

  if (!theme || theme === 'default') return null

  return (
    <>
      {theme === 'christmas' && (
        <div className="site-snowfall" aria-hidden="true">
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="site-snowflake"
              style={{
                left: `${Math.random() * 100}%`,
                fontSize: `${8 + Math.random() * 14}px`,
                animationDuration: `${6 + Math.random() * 8}s`,
                animationDelay: `${Math.random() * -8}s`,
              }}
            >❄</span>
          ))}
        </div>
      )}

      {theme === 'celebration' && (
        <>
          <div className="site-confetti" aria-hidden="true">
            {Array.from({ length: 50 }).map((_, i) => (
              <span
                key={i}
                className="site-confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
                  animationDuration: `${4 + Math.random() * 5}s`,
                  animationDelay: `${Math.random() * -5}s`,
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
