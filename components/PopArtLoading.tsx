import MascotWithCapPhoto from './MascotWithCapPhoto'

// Shown wherever the pop-art theme has a loading state — every page that
// uses this requires login, which is exactly why this is the one place the
// real player-photo cap patch is allowed to appear; the small header logo
// everywhere else stays the plain mascot.
//
// Rebuilt from a full-bleed solid-black takeover to a smaller, calmer
// card with a blurred dim backdrop — the full-screen version was the
// actual source of "feels amateur," independent of whatever animation
// played on the mascot itself: a solid wall blotting out the whole
// screen, including the header, on every single navigation, reads as a
// takeover no matter how the character on it moves. A professional
// loading state is quiet — it tells you something is happening without
// demanding the whole screen to do it. The card keeps the brand/fun
// personality (the mascot, kept, just smaller and calmer) while a plain
// indeterminate progress bar — not a bouncing character — carries the
// "something is happening" job, the same way most polished apps do it.
//
// Still fixed/inset-0 (a half-ready page underneath can't be shown), but
// now backdrop-blurred and semi-transparent rather than opaque, so it
// reads as an overlay settling over the page rather than a wall
// replacing it — set up for ceefax-shell.tsx's LoadingTransition
// wrapper to cross-fade this out instead of yanking it away instantly.
//
// Deliberately renders the exact same, unconditional JSX every time —
// no client-only state deciding what shows. Two earlier versions both
// branched on client-only information (an in-session "already shown"
// flag, then a signed-in-or-not cookie check) to try to hide the mascot
// from a signed-out visitor's brief pre-redirect moment. Both looked
// janky in practice: most navigations in this app go through a full
// `window.location.href` redirect (not a client-side route change), which
// means a fresh server render every time — and a branch that depends on
// browser-only state (cookies, sessionStorage) inevitably renders
// differently server-side than it does the instant the client takes over,
// which is a hydration mismatch. React recovers by discarding and
// rebuilding that whole subtree, which is its own visible stutter — worse
// than the thing it was trying to avoid. The mascot itself isn't
// sensitive information, so there's nothing actually at risk in simply
// always showing it; a signed-out visitor sees it for the same brief
// instant they always would, before their own auth check bounces them to
// /login. `label` (the rare genuine-message case, like "no active
// competition") renders in the same tree either way.
export default function PopArtLoading({ label }: { label?: string }) {
  return (
    <div
      className="pop-art-theme fixed inset-0 z-[999] flex items-center justify-center p-6"
      style={{ background: 'rgba(10,10,10,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
    >
      <div
        className="pop-loading-card flex flex-col items-center gap-4"
        style={{
          background: 'var(--pop-surface)',
          borderRadius: 20,
          padding: '28px 32px',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <MascotWithCapPhoto className="w-[225px] sm:w-[250px]" />
        <div className="pop-loading-bar" style={{ width: 120, height: 3, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.1)' }}>
          <div className="pop-loading-bar-fill" style={{ height: '100%', width: '40%', borderRadius: 2, background: 'var(--pop-blue)' }} />
        </div>
        {label && (
          <p className="pop-headline text-xs tracking-widest text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
        )}
      </div>
    </div>
  )
}
