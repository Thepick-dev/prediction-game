import PopArtLogo from './PopArtLogo'

// Shown wherever the pop-art theme has a loading state (Picks, and
// anywhere else that adopts the theme later) instead of plain "Loading…"
// text. Full-screen takeover on purpose — fixed, covers the header/nav
// too, so the badge is genuinely the only thing on screen rather than
// competing with a page still visible around it. The pulse is deliberately
// large (scale + glow both swing hard) so it reads as alive, not a static
// placeholder someone forgot to animate.
export default function PopArtLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="pop-art-theme fixed inset-0 z-[999] flex flex-col items-center justify-center gap-6"
      style={{ background: 'var(--pop-black)' }}
    >
      <PopArtLogo size={260} className="pop-logo-pulse" />
      <p className="pop-headline text-sm tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</p>
    </div>
  )
}
