type Props = {
  size?: number
  className?: string
}

// A simple, original pixel portrait of Futzy for the retro skin — a
// FIRST DRAFT, not a final asset. Every existing appearance of Futzy
// (BotAvatar.tsx, MascotWithCapPhoto.tsx) renders a smooth vector logo,
// so this isn't a re-skin of existing art, it's a new drawing built from
// scratch to fit the pixel grid. Phase 1 only: a static head with a
// slow, infrequent 2-frame idle blink — the full idle/walk/celebrate
// sprite sheet is phase 2, alongside sound/parallax/transitions.
export default function RetroFutzy({ size = 64, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="Futzy"
    >
      {/* Gold helmet/head */}
      <rect x="4" y="1" width="8" height="1" fill="#f8b800" />
      <rect x="3" y="2" width="10" height="7" fill="#f8b800" />
      <rect x="4" y="9" width="8" height="1" fill="#f8b800" />
      {/* Antenna */}
      <rect x="7" y="0" width="2" height="1" fill="#3cbcfc" />
      {/* Visor band */}
      <rect x="3" y="5" width="10" height="2" fill="#101878" />
      {/* Eyes (open frame) */}
      <g className="retro-futzy-eyes-open">
        <rect x="5" y="5" width="2" height="2" fill="#fcfcfc" />
        <rect x="9" y="5" width="2" height="2" fill="#fcfcfc" />
      </g>
      {/* Eyes (closed frame) — hidden by default, flashes briefly */}
      <g className="retro-futzy-eyes-closed" opacity="0">
        <rect x="5" y="6" width="2" height="1" fill="#fcfcfc" />
        <rect x="9" y="6" width="2" height="1" fill="#fcfcfc" />
      </g>
      {/* Chin strap / mouth */}
      <rect x="6" y="8" width="4" height="1" fill="#101878" />
      {/* Body hint (shoulders) */}
      <rect x="2" y="10" width="12" height="4" fill="#3cbcfc" />
      <rect x="2" y="10" width="12" height="1" fill="#fcfcfc" />
      <style>{`
        .retro-futzy-eyes-open { animation: retro-futzy-blink-open 4s steps(1) infinite; }
        .retro-futzy-eyes-closed { animation: retro-futzy-blink-closed 4s steps(1) infinite; }
        @keyframes retro-futzy-blink-open { 0%, 95% { opacity: 1; } 96%, 100% { opacity: 0; } }
        @keyframes retro-futzy-blink-closed { 0%, 95% { opacity: 0; } 96%, 100% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .retro-futzy-eyes-open, .retro-futzy-eyes-closed { animation: none !important; }
        }
      `}</style>
    </svg>
  )
}
