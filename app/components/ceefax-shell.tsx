'use client'

import { useState } from 'react'
import Link from 'next/link'

type Props = {
  children: React.ReactNode
  active?: string
  user?: any
  displayName?: string
}

const navItems = [
  { label: 'PICK', href: '/picks' },
  { label: 'TABLE', href: '/leaderboard' },
  { label: 'RESULTS', href: '/results' },
  { label: 'RULES', href: '/rules' },
  { label: 'NEWS', href: '/news' },
  { label: 'ARCHIVE', href: '/archive' },
  { label: 'SETTINGS', href: '/settings' },
]

export default function Shell({ children, active, user, displayName }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4">

          <div className="flex items-center justify-between h-12">
            <Link href="/" className="text-lg font-bold tracking-widest uppercase">
              The Coupon
            </Link>
            <div className="flex items-center gap-3">
              {user && (
                <span className="text-xs text-gray-500 hidden sm:block uppercase font-medium tracking-wider">
                  {displayName ?? ''}
                </span>
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
                aria-label="Menu"
              >
                <span className={`block w-5 h-0.5 bg-black transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
                <span className={`block w-5 h-0.5 bg-black transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`block w-5 h-0.5 bg-black transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
              </button>
            </div>
          </div>

          <nav className="hidden md:flex gap-1 -mb-px">
            {navItems.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className={`px-4 py-2.5 text-xs font-bold tracking-widest whitespace-nowrap border-b-2 transition-colors uppercase ${
                  active === item.label
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

        </div>

        {menuOpen && (
          <div className="md:hidden border-t bg-white shadow-lg">
            {navItems.map(item => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-6 py-4 text-sm font-bold tracking-widest uppercase border-b border-gray-100 ${
                  active === item.label
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {user && (
              <div className="px-6 py-3 text-xs text-gray-400 uppercase tracking-wider">
                {displayName ?? ''}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-gray-200 py-4 mt-8 text-center">
        <span className="text-gray-400 text-xs uppercase tracking-widest">
          The Coupon — Premier League Prediction Game
        </span>
      </footer>

    </div>
  )
}