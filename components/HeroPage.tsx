'use client'

import { useEffect, useState } from 'react'

interface HeroPageProps {
  children: React.ReactNode
}

// Update this number whenever you add a new hero-XX-desktop.png / hero-XX-mobile.png pair
const TOTAL_HEROES = 4

export default function HeroPage({ children }: HeroPageProps) {
  const [showCard, setShowCard] = useState(false)
  const [heroNumber, setHeroNumber] = useState<number | null>(null)

  useEffect(() => {
    const random = Math.floor(Math.random() * TOTAL_HEROES) + 1
    setHeroNumber(random)

    const timer = setTimeout(() => setShowCard(true), 600)
    return () => clearTimeout(timer)
  }, [])

  if (heroNumber === null) {
    return null
  }

  const padded = String(heroNumber).padStart(2, '0')
  const desktopImage = `/images/heroes/hero-${padded}-desktop.png`
  const mobileImage = `/images/heroes/hero-${padded}-mobile.png`

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div
        className="hidden md:block fixed inset-0 bg-cover bg-center -z-10"
        style={{ backgroundImage: `url(${desktopImage})` }}
      />
      <div
        className="block md:hidden fixed inset-0 bg-cover bg-center -z-10"
        style={{ backgroundImage: `url(${mobileImage})` }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div
          className={`w-full max-w-lg bg-[#f5ecd9] rounded-lg shadow-2xl p-8 transition-all duration-700 ease-out ${
            showCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}