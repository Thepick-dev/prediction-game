'use client'

import { useEffect, useState } from 'react'
import MascotWithCapPhoto from './MascotWithCapPhoto'

const SESSION_KEY = 'lms-intro-shown'

// A quick, synchronous stand-in for "is someone actually signed in" — the
// real answer needs an async Supabase call, which is exactly what's still
// loading at the moment this component is asked to render. @supabase/ssr
// (see app/lib/supabase.ts) always stores the session in a cookie named
// sb-<project-ref>-auth-token, so its mere presence is a reliable enough
// signal to gate on without waiting: every page this renders on requires
// login and redirects to /login the instant its own auth check comes back
// empty, so a visitor with no session cookie was never going to see real
// content here regardless.
function hasSupabaseSessionCookie(): boolean {
  return /(?:^|; )sb-[^=]*-auth-token=/.test(document.cookie)
}

// Shown wherever the pop-art theme has a loading state — every page that
// uses this requires login, which is exactly why this is the one place the
// real player-photo cap patch is allowed to appear; the small header logo
// everywhere else stays the plain mascot. Full-screen takeover on purpose
// — fixed, covers the header/nav too, so the mark is genuinely the only
// thing on screen.
//
// The full wobble-in intro only plays once per browser tab (sessionStorage,
// not localStorage — a deliberate "once per visit", not "once ever") and
// only for someone who already has a session — never for a signed-out
// visitor about to be bounced to /login, and never again once they've
// already seen it navigating around the site this session. Every other
// loading moment gets a small, quiet spinner instead of the full takeover.
// `label` (the rare genuine-message case, like "no active competition")
// always shows in full — it isn't really a loading state at all.
export default function PopArtLoading({ label }: { label?: string }) {
  const [phase, setPhase] = useState<'pending' | 'intro' | 'quiet'>('pending')

  useEffect(() => {
    if (label) return
    if (!hasSupabaseSessionCookie()) { setPhase('quiet'); return }
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
        setPhase('quiet')
      } else {
        sessionStorage.setItem(SESSION_KEY, '1')
        setPhase('intro')
      }
    } catch {
      // Private-browsing/storage-blocked contexts can throw on access —
      // default to showing the intro rather than guessing at session state.
      setPhase('intro')
    }
  }, [label])

  // Nothing is known yet (the instant before the effect above runs) —
  // render just the backdrop rather than guessing, so there's no flash of
  // the wrong choice.
  if (!label && phase === 'pending') {
    return <div className="pop-art-theme fixed inset-0 z-[999]" style={{ background: 'var(--pop-black)' }} />
  }

  if (label || phase === 'intro') {
    return (
      <div
        className="pop-art-theme fixed inset-0 z-[999] flex flex-col items-center justify-center gap-6"
        style={{ background: 'var(--pop-black)' }}
      >
        <MascotWithCapPhoto className="pop-logo-pulse w-[330px] sm:w-[220px]" />
        {label && (
          <p className="pop-headline text-sm tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
        )}
      </div>
    )
  }

  return (
    <div className="pop-art-theme fixed inset-0 z-[999] flex items-center justify-center" style={{ background: 'var(--pop-black)' }}>
      <div
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--pop-blue)',
          animation: 'pop-quiet-spin 0.7s linear infinite',
        }}
      />
    </div>
  )
}
