interface PopArtLogoProps {
  size?: number
  // Curved text reads fine at badge size but turns to mush much below
  // ~90px, so the header uses the icon alone (paired with the existing
  // glowing text wordmark) while bigger moments — the loading screen —
  // get the full crest treatment.
  showText?: boolean
  className?: string
}

// The emblem itself (lizards, violin, football, ring) lives in
// /public/logo.png, generated with generous transparent padding baked
// in — that padding is what gives the arced text room to sit in its own
// ring around the image without needing to know its exact pixel bounds.
export default function PopArtLogo({ size = 120, showText = true, className }: PopArtLogoProps) {
  const textPathId = 'pop-art-logo-text-arc'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="LMS All-Stars"
      role="img"
    >
      {showText && (
        <>
          <defs>
            <path id={textPathId} d="M 8,100 A 92,92 0 0 1 192,100" fill="none" />
          </defs>
          <text
            fill="var(--pop-pink, #D5006D)"
            fontSize="15"
            fontWeight="800"
            letterSpacing="2.5"
            style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', textTransform: 'uppercase' }}
          >
            <textPath href={`#${textPathId}`} startOffset="50%" textAnchor="middle">
              LMS ALL-STARS
            </textPath>
          </text>
        </>
      )}
      <image href="/logo.png" x="25" y="25" width="150" height="150" />
    </svg>
  )
}
