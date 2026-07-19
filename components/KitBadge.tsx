interface KitBadgeProps {
  pattern: string
  colour1: string
  colour2: string
  size?: number
}

export default function KitBadge({ pattern, colour1, colour2, size = 28 }: KitBadgeProps) {
  const shirtPath = "M8 2 L11 2 L12 4 L16 4 L17 2 L20 2 L26 7 L23 11 L20 9 L20 24 L8 24 L8 9 L5 11 L2 7 Z"

  const clipId = `kit-clip-${pattern}-${colour1.replace('#', '')}-${colour2.replace('#', '')}`

  function renderFill() {
    switch (pattern) {
      case 'horizontal':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="5.5" fill={colour1} />
            <rect x="0" y="5.5" width="28" height="5.5" fill={colour2} />
            <rect x="0" y="11" width="28" height="5.5" fill={colour1} />
            <rect x="0" y="16.5" width="28" height="5.5" fill={colour2} />
            <rect x="0" y="22" width="28" height="6" fill={colour1} />
          </g>
        )

      case 'vertical':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="5.6" height="28" fill={colour1} />
            <rect x="5.6" y="0" width="5.6" height="28" fill={colour2} />
            <rect x="11.2" y="0" width="5.6" height="28" fill={colour1} />
            <rect x="16.8" y="0" width="5.6" height="28" fill={colour2} />
            <rect x="22.4" y="0" width="5.6" height="28" fill={colour1} />
          </g>
        )

      case 'halves':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="14" height="28" fill={colour1} />
            <rect x="14" y="0" width="14" height="28" fill={colour2} />
          </g>
        )

      case 'sleeves':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <path d="M8 2 L11 2 L12 4 L16 4 L17 2 L20 2 L20 9 L8 9 Z" fill={colour1} />
            <path d="M2 7 L5 11 L8 9 L8 2 L2 7 Z" fill={colour2} />
            <path d="M26 7 L23 11 L20 9 L20 2 L26 7 Z" fill={colour2} />
          </g>
        )

      case 'hoops':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="9.33" fill={colour1} />
            <rect x="0" y="9.33" width="28" height="9.33" fill={colour2} />
            <rect x="0" y="18.66" width="28" height="9.34" fill={colour1} />
          </g>
        )

      case 'sash':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="4,-2 9,-2 24,26 19,30" fill={colour2} />
          </g>
        )

      case 'quarters':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="14" height="14" fill={colour1} />
            <rect x="14" y="0" width="14" height="14" fill={colour2} />
            <rect x="0" y="14" width="14" height="14" fill={colour2} />
            <rect x="14" y="14" width="14" height="14" fill={colour1} />
          </g>
        )

      case 'pinstripes':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {Array.from({ length: 9 }).map((_, i) => (
              <rect key={i} x={i * 3.1 + 0.5} y="0" width="0.8" height="28" fill={colour2} />
            ))}
          </g>
        )

      case 'solid':
      default:
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
          </g>
        )
    }
  }

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={clipId}>
          <path d={shirtPath} />
        </clipPath>
      </defs>
      {renderFill()}
      <path d={shirtPath} fill="none" stroke="#2A1F17" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}