// A rugby jersey rendering, deliberately distinct from components/KitPreview
// (football): a boxier body, a round neckline, and a folded-over two-flap
// collar (classic rugby shirt detail football shirts don't have) — plus a
// curated pattern set of only the designs that actually read as rugby kit
// styles (hoops, halves, quarters, sash, a contrast collar) rather than
// porting every football pattern across. Shorts and socks have their own
// independent colours (socks can be hooped), and a `view` prop switches
// between the front (plain shirt) and back (shirt + a number/letter in a
// circle or square) — the same single flat illustration redrawn from
// each side rather than two truly distinct silhouettes.

export const RUGBY_KIT_PATTERNS = [
  { value: 'solid', label: 'Solid' },
  { value: 'hoops', label: 'Hoops' },
  { value: 'horizontal', label: 'Horizontal Stripes' },
  { value: 'vertical', label: 'Vertical Stripes' },
  { value: 'halves', label: 'Halves' },
  { value: 'quarters', label: 'Quarters' },
  { value: 'sash', label: 'Sash' },
  { value: 'chest-band', label: 'Chest Band' },
  { value: 'side-panels', label: 'Side Panels' },
  { value: 'centre-stripe', label: 'Centre Stripe' },
]

interface RugbyKitPreviewProps {
  pattern: string
  colour1: string
  colour2: string
  colour3?: string | null // collar/trim colour
  shortsColour?: string | null
  socksColour?: string | null
  socksHooped?: boolean
  socksColour2?: string | null
  backText?: string | null
  backShape?: 'circle' | 'square' | null
  backShapeColour?: string | null
  backTextColour?: string | null
  view?: 'front' | 'back'
  size?: number
}

export default function RugbyKitPreview({
  pattern, colour1, colour2, colour3,
  shortsColour, socksColour, socksHooped, socksColour2,
  backText, backShape, backShapeColour, backTextColour,
  view = 'front', size = 120,
}: RugbyKitPreviewProps) {
  // Boxier silhouette than a football shirt, round neckline (no deep V),
  // short sleeves set slightly lower/wider.
  const shirtPath = "M7 6 L10 4 L18 4 L21 6 L26 10 L22 14 L20 12 L20 26 L8 26 L8 12 L6 14 L2 10 Z"
  const shortsPath = "M8 27 L20 27 L20 35 L15 35 L14 32 L13 35 L8 35 Z"
  const leftSockPath = "M9 36 L13 36 L13 46 L9 46 Z"
  const rightSockPath = "M15 36 L19 36 L19 46 L15 46 Z"
  // Folded-over collar: two flaps meeting at the centre of the neckline,
  // pointing down and out — the one detail that reliably reads "rugby"
  // rather than "football" at a glance.
  const collarLeftPath = "M10 4 L7 6 L9.5 8.5 L13 6.5 Z"
  const collarRightPath = "M18 4 L21 6 L18.5 8.5 L15 6.5 Z"

  const clipId = `rugby-kit-${pattern}-${colour1.replace('#', '')}-${colour2.replace('#', '')}`
  const socksClipId = `${clipId}-socks`
  const collarColour = colour3 || colour1
  const finalShortsColour = shortsColour || colour2
  const finalSocksColour = socksColour || colour1
  const finalSocksColour2 = socksColour2 || colour2

  function renderFill() {
    switch (pattern) {
      case 'hoops':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="8.67" fill={colour1} />
            <rect x="0" y="8.67" width="28" height="8.66" fill={colour2} />
            <rect x="0" y="17.33" width="28" height="8.67" fill={colour1} />
          </g>
        )
      case 'horizontal':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="5.2" fill={colour1} />
            <rect x="0" y="5.2" width="28" height="5.2" fill={colour2} />
            <rect x="0" y="10.4" width="28" height="5.2" fill={colour1} />
            <rect x="0" y="15.6" width="28" height="5.2" fill={colour2} />
            <rect x="0" y="20.8" width="28" height="5.2" fill={colour1} />
          </g>
        )
      case 'vertical':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="5.6" height="26" fill={colour1} />
            <rect x="5.6" y="0" width="5.6" height="26" fill={colour2} />
            <rect x="11.2" y="0" width="5.6" height="26" fill={colour1} />
            <rect x="16.8" y="0" width="5.6" height="26" fill={colour2} />
            <rect x="22.4" y="0" width="5.6" height="26" fill={colour1} />
          </g>
        )
      case 'halves':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="14" height="26" fill={colour1} />
            <rect x="14" y="0" width="14" height="26" fill={colour2} />
          </g>
        )
      case 'quarters':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="14" height="13" fill={colour1} />
            <rect x="14" y="0" width="14" height="13" fill={colour2} />
            <rect x="0" y="13" width="14" height="13" fill={colour2} />
            <rect x="14" y="13" width="14" height="13" fill={colour1} />
          </g>
        )
      case 'sash':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="26" fill={colour1} />
            <polygon points="4,-2 9,-2 24,24 19,28" fill={colour2} />
          </g>
        )
      case 'chest-band':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="26" fill={colour1} />
            <rect x="0" y="9" width="28" height="4" fill={colour2} />
          </g>
        )
      case 'side-panels':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="26" fill={colour1} />
            <rect x="0" y="0" width="4" height="26" fill={colour2} />
            <rect x="24" y="0" width="4" height="26" fill={colour2} />
          </g>
        )
      case 'centre-stripe':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="26" fill={colour1} />
            <rect x="11" y="0" width="6" height="26" fill={colour2} />
          </g>
        )
      case 'solid':
      default:
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="26" fill={colour1} />
          </g>
        )
    }
  }

  function renderSocks() {
    if (!socksHooped) {
      return (
        <>
          <path d={leftSockPath} fill={finalSocksColour} stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
          <path d={rightSockPath} fill={finalSocksColour} stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
        </>
      )
    }
    // Three alternating hoop bands per sock, clipped to each sock's shape.
    const bandHeight = 10 / 3
    return (
      <>
        <g clipPath={`url(#${socksClipId}-l)`}>
          <rect x="9" y="36" width="4" height={bandHeight} fill={finalSocksColour} />
          <rect x="9" y={36 + bandHeight} width="4" height={bandHeight} fill={finalSocksColour2} />
          <rect x="9" y={36 + bandHeight * 2} width="4" height={bandHeight} fill={finalSocksColour} />
        </g>
        <g clipPath={`url(#${socksClipId}-r)`}>
          <rect x="15" y="36" width="4" height={bandHeight} fill={finalSocksColour} />
          <rect x="15" y={36 + bandHeight} width="4" height={bandHeight} fill={finalSocksColour2} />
          <rect x="15" y={36 + bandHeight * 2} width="4" height={bandHeight} fill={finalSocksColour} />
        </g>
        <path d={leftSockPath} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
        <path d={rightSockPath} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
      </>
    )
  }

  const showBackDetail = view === 'back' && backText

  return (
    <svg width={size} height={size} viewBox="0 0 28 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={clipId}>
          <path d={shirtPath} />
        </clipPath>
        {socksHooped && (
          <>
            <clipPath id={`${socksClipId}-l`}><path d={leftSockPath} /></clipPath>
            <clipPath id={`${socksClipId}-r`}><path d={rightSockPath} /></clipPath>
          </>
        )}
      </defs>
      {renderFill()}
      <path d={collarLeftPath} fill={collarColour} stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" strokeLinejoin="round" />
      <path d={collarRightPath} fill={collarColour} stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" strokeLinejoin="round" />
      <path d={shirtPath} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
      {showBackDetail && (
        backShape === 'square' ? (
          <rect x="9.5" y="10.5" width="9" height="9" fill={backShapeColour || '#FFFFFF'} stroke="rgba(0,0,0,0.25)" strokeWidth="0.3" />
        ) : (
          <circle cx="14" cy="15" r="5" fill={backShapeColour || '#FFFFFF'} stroke="rgba(0,0,0,0.25)" strokeWidth="0.3" />
        )
      )}
      {showBackDetail && (
        <text x="14" y="17.5" textAnchor="middle" fontSize="6" fontWeight="700" fill={backTextColour || '#000000'} fontFamily="Arial, sans-serif">
          {backText!.slice(0, 2)}
        </text>
      )}
      <path d={shortsPath} fill={finalShortsColour} stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
      {renderSocks()}
    </svg>
  )
}
