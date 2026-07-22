interface KitPreviewProps {
  pattern: string
  colour1: string
  colour2: string
  stars?: number
  earths?: number
  size?: number
}

// Actual repeated icons, not a "x3" count — shown prominently right next
// to the shirt (this preview has plenty of room, so a bigger size than the
// compact header/table badge).
function BadgeStats({ stars, earths }: { stars: number; earths: number }) {
  if (!stars && !earths) return null
  return (
    <div className="flex flex-col gap-1.5 text-left" style={{ fontSize: '22px' }}>
      {stars > 0 && <div style={{ color: '#D9A441' }}>{'★'.repeat(stars)}</div>}
      {earths > 0 && <div>{'🌍'.repeat(earths)}</div>}
    </div>
  )
}

export default function KitPreview({ pattern, colour1, colour2, stars = 0, earths = 0, size = 120 }: KitPreviewProps) {
  const shirtPath = "M8 2 L11 2 L12 4 L16 4 L17 2 L20 2 L26 7 L23 11 L20 9 L20 24 L8 24 L8 9 L5 11 L2 7 Z"
  const shortsPath = "M8 25 L20 25 L20 33 L15 33 L14 30 L13 33 L8 33 Z"
  const leftSockPath = "M9 34 L13 34 L13 46 L9 46 Z"
  const rightSockPath = "M15 34 L19 34 L19 46 L15 46 Z"

  const shirtClipId = `preview-shirt-${pattern}-${colour1.replace('#', '')}-${colour2.replace('#', '')}`

  function renderShirtFill() {
    switch (pattern) {
      case 'horizontal':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="28" height="5.5" fill={colour1} />
            <rect x="0" y="5.5" width="28" height="5.5" fill={colour2} />
            <rect x="0" y="11" width="28" height="5.5" fill={colour1} />
            <rect x="0" y="16.5" width="28" height="5.5" fill={colour2} />
            <rect x="0" y="22" width="28" height="6" fill={colour1} />
          </g>
        )
      case 'vertical':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="5.6" height="28" fill={colour1} />
            <rect x="5.6" y="0" width="5.6" height="28" fill={colour2} />
            <rect x="11.2" y="0" width="5.6" height="28" fill={colour1} />
            <rect x="16.8" y="0" width="5.6" height="28" fill={colour2} />
            <rect x="22.4" y="0" width="5.6" height="28" fill={colour1} />
          </g>
        )
      case 'halves':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="14" height="28" fill={colour1} />
            <rect x="14" y="0" width="14" height="28" fill={colour2} />
          </g>
        )
      case 'sleeves':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <path d="M8 2 L11 2 L12 4 L16 4 L17 2 L20 2 L20 9 L8 9 Z" fill={colour1} />
            <path d="M2 7 L5 11 L8 9 L8 2 L2 7 Z" fill={colour2} />
            <path d="M26 7 L23 11 L20 9 L20 2 L26 7 Z" fill={colour2} />
          </g>
        )
      case 'hoops':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="28" height="9.33" fill={colour1} />
            <rect x="0" y="9.33" width="28" height="9.33" fill={colour2} />
            <rect x="0" y="18.66" width="28" height="9.34" fill={colour1} />
          </g>
        )
      case 'sash':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="4,-2 9,-2 24,26 19,30" fill={colour2} />
          </g>
        )
      case 'quarters':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="14" height="14" fill={colour1} />
            <rect x="14" y="0" width="14" height="14" fill={colour2} />
            <rect x="0" y="14" width="14" height="14" fill={colour2} />
            <rect x="14" y="14" width="14" height="14" fill={colour1} />
          </g>
        )
      case 'pinstripes':
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {Array.from({ length: 9 }).map((_, i) => (
              <rect key={i} x={i * 3.1 + 0.5} y="0" width="0.8" height="28" fill={colour2} />
            ))}
          </g>
        )
      case 'solid':
      default:
        return (
          <g clipPath={`url(#${shirtClipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
          </g>
        )
    }
  }

  return (
    <div className="inline-flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 28 48" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id={shirtClipId}>
            <path d={shirtPath} />
          </clipPath>
        </defs>

        {renderShirtFill()}
        <path d={shirtPath} fill="none" stroke="#2A1F17" strokeWidth="0.6" strokeLinejoin="round" />

        <path d={shortsPath} fill={colour2} stroke="#2A1F17" strokeWidth="0.6" strokeLinejoin="round" />

        <path d={leftSockPath} fill={colour1} stroke="#2A1F17" strokeWidth="0.6" strokeLinejoin="round" />
        <path d={rightSockPath} fill={colour1} stroke="#2A1F17" strokeWidth="0.6" strokeLinejoin="round" />
      </svg>
      <BadgeStats stars={stars} earths={earths} />
    </div>
  )
}