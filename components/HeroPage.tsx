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
const TOTAL_HEROES = 0

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

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
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
              when the browser's address bar shows/hides on scroll */}
          <div
            className="block md:hidden absolute inset-0 bg-cover bg-center -z-10"
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
