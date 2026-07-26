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
const TOTAL_HEROES: number = 20

export default function HeroPage({ children, wide = false, noImage = false, heroOverride }: HeroPageProps) {
  const [showCard, setShowCard] = useState(false)
  const [heroNumber, setHeroNumber] = useState<number | null>(null)
  const [imageReady, setImageReady] = useState(false)

  const poolEmpty = !heroOverride && TOTAL_HEROES === 0
  const effectiveNoImage = noImage || poolEmpty

  useEffect(() => {
    if (!effectiveNoImage && !heroOverride) {
      const random = Math.floor(Math.random() * TOTAL_HEROES) + 1
      setHeroNumber(random)
    }
  }, [effectiveNoImage, heroOverride])

  // The random pick only exists client-side (picking it during the server
  // render would mean the server and the browser's first paint disagree on
  // which photo to show, which React flags as a hydration error) — so
  // there's an unavoidable gap before heroNumber lands. A heroOverride
  // (fixed slug, not random) needs no such gap and resolves immediately.
  const heroSlug = heroOverride ?? (heroNumber !== null ? String(heroNumber).padStart(2, '0') : null)
  const desktopImage = !effectiveNoImage && heroSlug ? `/api/hero-image/hero-${heroSlug}-desktop.png` : null
  const mobileImage = !effectiveNoImage && heroSlug ? `/api/hero-image/hero-${heroSlug}-mobile.png` : null

  // A CSS background-image has no load event of its own — without this,
  // the photo div would sit there fully transparent (showing the plain
  // dark backgroundColor beneath it) for however long the download took,
  // which is exactly what read as a stuck dark patch rather than a smooth
  // reveal. This preloads whichever image this screen will actually show
  // and only flips imageReady once it's genuinely finished, so the fade-in
  // below only starts once there's really something to fade in.
  useEffect(() => {
    if (!desktopImage || !mobileImage) return
    setImageReady(false)
    const isDesktop = window.matchMedia('(min-width: 768px)').matches
    const img = new Image()
    img.onload = () => setImageReady(true)
    img.onerror = () => setImageReady(true) // don't get stuck on the gradient forever if a photo fails to load
    img.src = isDesktop ? desktopImage : mobileImage
    return () => { img.onload = null; img.onerror = null }
  }, [desktopImage, mobileImage])

  useEffect(() => {
    if (effectiveNoImage) {
      setShowCard(true)
      return
    }
    if (!imageReady) return
    // 1.25 seconds so visitors actually get to see the photo behind the
    // header before the content card slides in over it — the whole point
    // of having a hero image at all.
    const timer = setTimeout(() => setShowCard(true), 1250)
    return () => clearTimeout(timer)
  }, [effectiveNoImage, imageReady])

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
      {/* The themed gradient is a permanent base layer, not just a "no
          image" fallback — it's what shows on the very first paint (before
          the random pick even lands), and it stays put underneath the
          photo layer below while that's still downloading, fading out of
          view only once the real photo has actually faded in on top of
          it. That's what keeps the header and *some* background appearing
          together instantly, with nothing ever looking like a stuck gap. */}
      <div
        className="hero-bg-height fixed top-0 left-0 right-0 -z-10"
        style={{ background: 'linear-gradient(160deg, #2A1F17 0%, #1a120b 55%, #241a12 100%)' }}
      />
      {desktopImage && mobileImage && (
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
            className={`hero-bg-height hidden md:block fixed top-0 left-0 right-0 bg-cover bg-center -z-10 transition-opacity duration-700 ${imageReady ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundImage: `url(${desktopImage})` }}
          />
          <div
            className={`hero-bg-height block md:hidden fixed top-0 left-0 right-0 bg-cover bg-center -z-10 transition-opacity duration-700 ${imageReady ? 'opacity-100' : 'opacity-0'}`}
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
