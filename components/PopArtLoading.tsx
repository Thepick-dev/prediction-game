import PopArtLogo from './PopArtLogo'

// Shown wherever the pop-art theme has a loading state (Picks, and
// anywhere else that adopts the theme later) instead of plain "Loading…"
// text — the badge breathes with a slow glow so it reads as "alive and
// working" rather than a frozen placeholder.
export default function PopArtLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="pop-art-theme flex flex-col items-center justify-center gap-4 py-20">
      <PopArtLogo size={150} className="pop-logo-pulse" />
      <p className="pop-headline text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
    </div>
  )
}
