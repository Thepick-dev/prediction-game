'use client'

import { useEffect, useState } from 'react'

interface HeroPageProps {
  children: React.ReactNode
  wide?: boolean
  noImage?: boolean
}

const TOTAL_HEROES = 4

// Hero photos are switched off site-wide for now (copyright/licensing still
// being sorted out) — every page gets the plain background unless a future
// call site explicitly passes noImage={false}.
export default function HeroPage({ children, wide = false, noImage = true }: HeroPageProps) {
  const [showCard, setShowCard] = useState(false)
  const [heroNumber, setHeroNumber] = useState<number | null>(null)

  useEffect(() => {
    if (noImage) {
      setShowCard(true)
      return
    }
    const random = Math.floor(Math.random() * TOTAL_HEROES) + 1
    setHeroNumber(random)

    const timer = setTimeout(() => setShowCard(true), 600)
    return () => clearTimeout(timer)
  }, [noImage])

  if (!noImage && heroNumber === null) {
    return null
  }

  const padded = String(heroNumber).padStart(2, '0')
  const desktopImage = `/api/hero-image/hero-${padded}-desktop.png`
  const mobileImage = `/api/hero-image/hero-${padded}-mobile.png`

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {noImage ? (
        // Plain themed background — no photo. Used on pages reachable
        // without logging in, so there's nothing publicly reverse-
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

      <div className="relative z-10 min-h-screen flex items-start justify-center px-3 py-8">
        <div
          className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-lg shadow-2xl p-5 transition-all duration-700 ease-out border border-[#D9A441]/30 ${
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