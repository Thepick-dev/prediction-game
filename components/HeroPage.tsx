'use client'

import { useEffect, useState } from 'react'

interface HeroPageProps {
  children: React.ReactNode
  wide?: boolean
  noImage?: boolean
  // A fixed image slug (e.g. "trophy") instead of a random pick from the
  // rotating pool — for a page that wants its own specific, permanent image
  // rather than one of the general background photos.
  heroOverride?: string
}

// Bump this once new cropped images actually exist in private/hero-images/
// (see docs/SEASON-GUIDE.md) — until then it stays 0 so every page that
// wants a photo safely falls back to the plain gradient instead of
// requesting a file that doesn't exist yet.
// Typed explicitly as `number` — as a bare `const`, TypeScript narrows this
// to whatever literal value it's currently set to (e.g. the type `1`), which
// then makes the `=== 0` check below a compile error every time this isn't
// literally zero.
const TOTAL_HEROES: number = 4

export default function HeroPage({ children, wide = false, noImage = false, heroOverride }: HeroPageProps) {
  const [showCard, setShowCard] = useState(false)
  const [heroNumber, setHeroNumber] = useState<number | null>(null)

  const poolEmpty = !heroOverride && TOTAL_HEROES === 0
  const effectiveNoImage = noImage || poolEmpty

  useEffect(() => {
    if (effectiveNoImage) {
      setShowCard(true)
      return
    }
    if (!heroOverride) {
      const random = Math.floor(Math.random() * TOTAL_HEROES) + 1
      setHeroNumber(random)
    }

    const timer = setTimeout(() => setShowCard(true), 600)
    return () => clearTimeout(timer)
  }, [effectiveNoImage, heroOverride])

  if (!effectiveNoImage && !heroOverride && heroNumber === null) {
    return null
  }

  const heroSlug = heroOverride ?? String(heroNumber).padStart(2, '0')
  const desktopImage = `/api/hero-image/hero-${heroSlug}-desktop.png`
  const mobileImage = `/api/hero-image/hero-${heroSlug}-mobile.png`

  // isolate is load-bearing, not decorative: without it, this div's own
  // backgroundColor has no stacking context of its own, so the -z-10 image
  // children behind it resolve their stacking against the nearest ancestor
  // that DOES form one (way up at the document root) instead of just this
  // component — which put this backgroundColor ABOVE the image entirely,
  // hiding it completely on both mobile and desktop. Confirmed by
  // reproducing the exact bug, then confirming isolate fixes it, before
  // shipping this.
  return (
    <div className="relative isolate min-h-screen w-full overflow-hidden" style={{ backgroundColor: '#1a120b' }}>
      {effectiveNoImage ? (
        // Plain themed background — no photo. Used on pages reachable
        // without logging in (login, news), and anywhere the pool is
        // currently empty, so there's nothing publicly reverse-
        // image-searchable back to an uncertain source/licence.
        <div
          className="fixed inset-0 -z-10"
          style={{ background: 'linear-gradient(160deg, #2A1F17 0%, #1a120b 55%, #241a12 100%)' }}
        />
      ) : (
        <>
          <div
            className="hidden md:block fixed inset-0 bg-cover bg-center -z-10"
            style={{ backgroundImage: `url(${desktopImage})` }}
          />
          {/* absolute, not fixed — on mobile, `fixed` backgrounds visibly jump
              when the browser's address bar shows/hides on scroll. But
              `absolute` combined with `inset-0` stretches to match this
              *whole* container, which grows to fit the page's content — on
              anything taller than one screen (most pages, on a narrow
              phone), that stretched the photo to "cover" several screens'
              worth of height, burying the actual crop far down the page
              and leaving only an unrecognisable sliver visible on load.
              Pinning the height to exactly one screen (rather than
              inset-0's full-container height) fixes that while keeping the
              no-jump behaviour — the backgroundColor above covers anything
              that scrolls past it.

              left-1/2 + w-screen + -ml-[50vw] is a standard full-bleed
              breakout: this component is nested inside Shell's
              `<main class="... px-4">`, which is `absolute`'s actual
              containing block (unlike the desktop layer above, which is
              `fixed` and always escapes to the true viewport regardless).
              Without the breakout, inset-x-0 only reaches that padded
              main's edges, leaving a ~16px strip of the page's plain
              background showing on each side. */}
          <div
            className="block md:hidden absolute top-0 left-1/2 w-screen h-screen -ml-[50vw] bg-cover bg-center -z-10"
            style={{ backgroundImage: `url(${mobileImage})` }}
          />
        </>
      )}

      {/* Wide (table-heavy) pages get noticeably tighter side padding on
          mobile — every pixel matters when a table has 6+ columns on a
          360px screen. Non-wide pages (forms, settings) keep the roomier
          padding since they're not fighting for horizontal space. */}
      <div className={`relative z-10 min-h-screen flex items-start justify-center py-8 ${wide ? 'px-1.5 sm:px-3' : 'px-3'}`}>
        <div
          className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-lg shadow-2xl transition-all duration-700 ease-out border border-[#D9A441]/30 ${wide ? 'p-2.5 sm:p-5' : 'p-5'} ${
            showCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ backgroundColor: 'rgba(30, 25, 20, 0.88)' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
