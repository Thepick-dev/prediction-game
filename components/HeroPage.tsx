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
const TOTAL_HEROES: number = 14

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

    // A full second so visitors actually get to see the photo behind the
    // header before the content card slides in over it — the whole point
    // of having a hero image at all.
    const timer = setTimeout(() => setShowCard(true), 1000)
    return () => clearTimeout(timer)
  }, [effectiveNoImage, heroOverride])

  // The random pick only exists client-side (picking it during the server
  // render would mean the server and the browser's first paint disagree on
  // which photo to show, which React flags as a hydration error) — so
  // there's an unavoidable one-frame gap before heroNumber lands. Previously
  // this whole component rendered nothing at all during that gap (a blank
  // flash before the header/hero/card all suddenly appeared together).
  // Instead, that gap now shows the same plain gradient as a true "no
  // image" page, so the header and *a* background always appear on the
  // very first paint, with the actual photo swapping in moments later —
  // never a blank page. A heroOverride (fixed slug, not random) needs no
  // such gap and resolves immediately on every render.
  const showGradientOnly = effectiveNoImage || (!heroOverride && heroNumber === null)
  const heroSlug = heroOverride ?? (heroNumber !== null ? String(heroNumber).padStart(2, '0') : null)
  const desktopImage = heroSlug ? `/api/hero-image/hero-${heroSlug}-desktop.png` : null
  const mobileImage = heroSlug ? `/api/hero-image/hero-${heroSlug}-mobile.png` : null

  // isolate is load-bearing, not decorative: without it, this div's own
  // backgroundColor has no stacking context of its own, so the -z-10 image
  // children behind it resolve their stacking against the nearest ancestor
  // that DOES form one (way up at the document root) instead of just this
  // component — which put this backgroundColor ABOVE the image entirely,
  // hiding it completely. overflow-hidden is safe alongside fixed
  // positioning (unlike absolute) — a fixed element's containing block is
  // the viewport itself, not this div, so an ancestor's overflow-hidden
  // doesn't clip it.
  return (
    <div className="relative isolate overflow-hidden min-h-screen w-full" style={{ backgroundColor: '#1a120b' }}>
      {showGradientOnly || !desktopImage || !mobileImage ? (
        // Plain themed background — no photo. Used on pages reachable
        // without logging in (login, news), anywhere the pool is
        // currently empty (nothing publicly reverse-image-searchable back
        // to an uncertain source/licence), and briefly on every other page
        // while the random pick above resolves.
        <div
          className="hero-bg-height fixed top-0 left-0 right-0 -z-10"
          style={{ background: 'linear-gradient(160deg, #2A1F17 0%, #1a120b 55%, #241a12 100%)' }}
        />
      ) : (
        <>
          {/* Both breakpoints use the exact same fixed positioning —
              always the true screen edges, regardless of how tall the
              page's content is or how much padding sits between this
              component and the viewport. This is what desktop always did
              and always looked right.

              Height comes from the hero-bg-height class (see globals.css),
              not `inset-0` — on mobile, the browser's address bar resizes
              the viewport as it animates in/out on scroll, and a plain
              vh-based height recalculates every frame of that animation,
              which is exactly what showed up as the background visibly
              hopping while scrolling. hero-bg-height uses the static
              `lvh` unit instead, which doesn't recalculate mid-scroll. */}
          <div
            className="hero-bg-height hidden md:block fixed top-0 left-0 right-0 bg-cover bg-center -z-10"
            style={{ backgroundImage: `url(${desktopImage})` }}
          />
          <div
            className="hero-bg-height block md:hidden fixed top-0 left-0 right-0 bg-cover bg-center -z-10"
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
