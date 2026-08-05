import PopArtLogo from './PopArtLogo'

// Shown wherever the pop-art theme has a loading state (Picks, and
// anywhere else that adopts the theme later). Full-screen takeover on
// purpose — fixed, covers the header/nav too, so the mark is genuinely
// the only thing on screen. No caption by default — the mark itself, mid-
// pulse, is the whole point; "Loading…" underneath was competing with it.
// `label` stays available (unused by the plain loading case) for the rare
// genuine-message case like "no active competition", which isn't really
// a loading state at all.
export default function PopArtLoading({ label }: { label?: string }) {
  return (
    <div
      className="pop-art-theme fixed inset-0 z-[999] flex flex-col items-center justify-center gap-6"
      style={{ background: 'var(--pop-black)' }}
    >
      <PopArtLogo size={280} showText={false} className="pop-logo-pulse" />
      {label && (
        <p className="pop-headline text-sm tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
      )}
    </div>
  )
}
