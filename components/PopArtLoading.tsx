'use client'

import { useEffect, useState } from 'react'
import MascotWithCapPhoto from './MascotWithCapPhoto'

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
// Plays a very quick wobble (see .pop-logo-pulse in globals.css) on every
// single loading moment, signed-in visitors only — never for a signed-out
// one about to be bounced to /login. `label` (the rare genuine-message
// case, like "no active competition") always shows in full — it isn't
// really a loading state at all.
export default function PopArtLoading({ label }: { label?: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    if (label) return
    setSignedIn(hasSupabaseSessionCookie())
  }, [label])

  // Nothing is known yet (the instant before the effect above runs) —
  // render just the backdrop rather than guessing, so there's no flash of
  // the wrong choice.
  if (!label && signedIn === null) {
    return <div className="pop-art-theme fixed inset-0 z-[999]" style={{ background: 'var(--pop-black)' }} />
  }

  if (!label && !signedIn) {
    return <div className="pop-art-theme fixed inset-0 z-[999]" style={{ background: 'var(--pop-black)' }} />
  }

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
