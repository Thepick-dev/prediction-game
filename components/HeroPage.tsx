'use client'

import { useEffect, useState } from 'react'

interface HeroPageProps {
  desktopImage: string
  mobileImage: string
  children: React.ReactNode
}

export default function HeroPage({ desktopImage, mobileImage, children }: HeroPageProps) {
  const [showCard, setShowCard] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowCard(true), 600)
    return () => clearTimeout(timer)
  }, [])

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