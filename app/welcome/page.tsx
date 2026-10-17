'use client'

import { useState } from 'react'

type Screen = { emoji: string; title: string; body: string }

// Shown once, right after a non-code signup (one that's going to wait on
// admin approval) — not after an invite-code signup, which came from a
// mate who's presumably already explained some of this. Every existing
// player got Kit's own personal explanation; a stranger arriving cold off
// a public link doesn't, so this fills that gap. Reached mid-signup, so
// it has to be a public path in proxy.ts — see the comment there.
const SCREENS: Screen[] = [
  {
    emoji: '👋',
    title: "You're almost in",
    body: "An admin needs to approve your account first — you'll be able to log in as soon as they do. While you wait, here's a quick look at how it all works.",
  },
  {
    emoji: '⚽',
    title: 'Pick a Team, Pick Your Players',
    body: "Every gameweek, pick one team to do well and two players to score points for you. Miss a deadline and a pick is made for you automatically, so you're never skipped.",
  },
  {
    emoji: '🃏',
    title: 'The Banker',
    body: "Once a season, you can double your points for a single gameweek. Save it for a week you're confident about — or risk it early and hope for the best.",
  },
  {
    emoji: '💬',
    title: 'The Wall',
    body: "This isn't just a spreadsheet with extra steps — rate each other's picks, trade banter, and watch Futzy (our resident bot pundit) weigh in with his own takes every week.",
  },
]

export default function WelcomePage() {
  const [step, setStep] = useState(0)
  const isLast = step === SCREENS.length - 1
  const screen = SCREENS[step]

  return (
    <div className="pop-art-theme min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--pop-black)' }}>
      <div className="pop-panel p-6 sm:p-8 text-center" style={{ maxWidth: 420 }}>
        <div className="text-5xl mb-4">{screen.emoji}</div>
        <h1 className="pop-hero pop-hero--pink text-2xl sm:text-3xl mb-3 uppercase tracking-wide">{screen.title}</h1>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.7)' }}>{screen.body}</p>

        <div className="flex items-center justify-center gap-1.5 mb-6">
          {SCREENS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i === step ? 'var(--pop-pink)' : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        <button
          onClick={() => (isLast ? (window.location.href = '/pending') : setStep(s => s + 1))}
          className="pop-button w-full py-2.5 text-sm mb-3"
        >
          {isLast ? "Got It — I'm Waiting on Approval" : 'Next'}
        </button>

        {!isLast && (
          <button onClick={() => (window.location.href = '/pending')} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
