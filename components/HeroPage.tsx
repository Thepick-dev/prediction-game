'use client'

import { useEffect, useState } from 'react'

interface HeroPageProps {
  children: React.ReactNode
  wide?: boolean
}

const TOTAL_HEROES = 4

export default function HeroPage({ children, wide = false }: HeroPageProps) {
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