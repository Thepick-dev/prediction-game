import MascotWithCapPhoto from './MascotWithCapPhoto'

// Shown wherever the pop-art theme has a loading state — every page that
// uses this requires login, which is exactly why this is the one place the
// real player-photo cap patch is allowed to appear; the small header logo
// everywhere else stays the plain mascot. Full-screen takeover on purpose
// — fixed, covers the header/nav too, so the mark is genuinely the only
// thing on screen.
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
