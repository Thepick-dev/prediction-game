'use client'

import { useState } from 'react'
import RulesModal from './RulesModal'

// Shown at '/' only to a logged-out visitor, and only once an admin has
// switched signup_settings.landing_page_enabled on (see app/page.tsx) —
// until then '/' just redirects straight to /login, same as before this
// existed. Pop-art only, same reasoning as RulesModal: nobody reaches this
// page already logged in, so there's no "classic"/retro variant to support.
export default function LandingPage() {
  const [showRules, setShowRules] = useState(false)

  return (
    <div className="pop-art-theme min-h-screen" style={{ background: 'var(--pop-black)' }}>
      <div className="max-w-xl mx-auto px-4 py-10 sm:py-16">

        <h1 className="pop-hero pop-hero--pink text-5xl sm:text-6xl text-center uppercase tracking-wide mb-3">
          LMS All-Stars
        </h1>
        <p className="text-center text-base sm:text-lg font-bold mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
          A Premier League prediction game, played with mates — picks, banter, and bragging rights on the line every gameweek.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <a href="/login?join=1" className="pop-button pop-button--yellow flex-1 py-3 text-sm text-center">
            Join the Competition
          </a>
          <a href="/login" className="pop-button pop-button--blue flex-1 py-3 text-sm text-center">
            Log In
          </a>
        </div>

        <div className="space-y-4 mb-10">
          <div className="pop-panel pop-panel--pink p-5">
            <h2 className="pop-headline text-sm mb-1">⚽ Pick a Team, Pick Your Players</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Every gameweek, pick one team to do well and two players to score points for you. Get it right and climb
              the table — get it wrong and your rivals won&apos;t let you forget it.
            </p>
          </div>
          <div className="pop-panel pop-panel--blue p-5">
            <h2 className="pop-headline text-sm mb-1">🃏 The Banker</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Once a season, double your points for a single gameweek. Save it for a week you&apos;re confident about —
              or risk it early and hope for the best.
            </p>
          </div>
          <div className="pop-panel pop-panel--green p-5">
            <h2 className="pop-headline text-sm mb-1">💬 The Wall</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              This isn&apos;t just a spreadsheet with extra steps — it&apos;s a proper community. Rate each other&apos;s
              picks, trade banter, and watch Futzy (our resident bot pundit) weigh in with his own takes every week.
            </p>
          </div>
          <div className="pop-panel pop-panel--yellow p-5">
            <h2 className="pop-headline text-sm mb-1">🏆 Leaderboard &amp; Awards</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Track the table all season long, then settle the score at the end with a full set of awards — Golden
              Boot, Wooden Spoon, and everything in between.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowRules(true)}
          className="block w-full text-center text-xs mb-6"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          Read the Full Rules
        </button>

        <div className="flex items-center justify-center gap-4">
          {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Cookies', '/cookies']].map(([label, href]) => (
            <a key={href} href={href} className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}
