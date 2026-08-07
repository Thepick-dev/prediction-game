interface KitBadgeProps {
  pattern: string
  colour1: string
  colour2: string
  // Optional trim (collar + cuffs) — omitted entirely (no colour3) renders
  // exactly as before, so every existing kit looks unchanged unless its
  // owner deliberately picks a trim colour in Settings.
  colour3?: string | null
  stars?: number
  earths?: number
  size?: number
  // Tailwind text-size classes for the icon rows — takes a responsive pair
  // (e.g. "text-[9px] sm:text-sm") so mobile and desktop can each get a
  // sensible size without any JS, rather than one fixed pixel value.
  iconTextClass?: string
  // Override the default gold star colour — the gold reads fine on the
  // classic dark header, but disappears against the pop-art theme's yellow
  // header bar, so that caller passes something with actual contrast.
  starColor?: string
  // Extra className applied to the star span (e.g. a twinkle animation) —
  // kept opt-in so every other caller renders exactly as before.
  starClassName?: string
  // The player's penalty shootout personal best — shown as a shirt number
  // in the top-right corner when set, coloured with the kit's own trim
  // colour (falling back to the site's gold when no trim is set) so it
  // reads as part of the kit rather than a bolted-on UI badge. Omitted
  // entirely (undefined/0) renders exactly as before.
  topScore?: number
}

// Actual repeated icons, not a "x3" count — genuinely readable, flanking
// the shirt (stars on the left, globes on the right) rather than drawn on
// it or listed after it.
function StarIcons({ stars, className, color, extraClassName }: { stars: number; className: string; color: string; extraClassName?: string }) {
  if (!stars) return null
  return <span className={`leading-none ${className} ${extraClassName ?? ''}`} style={{ color }}>{'★'.repeat(stars)}</span>
}

function GlobeIcons({ earths, className }: { earths: number; className: string }) {
  if (!earths) return null
  return <span className={`leading-none ${className}`}>{'🌍'.repeat(earths)}</span>
}

export default function KitBadge({ pattern, colour1, colour2, colour3, stars = 0, earths = 0, size = 28, iconTextClass = 'text-sm', starColor = '#D9A441', starClassName, topScore }: KitBadgeProps) {
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
    <div className="inline-flex items-center gap-1 sm:gap-1.5">
      <StarIcons stars={stars} className={iconTextClass} color={starColor} extraClassName={starClassName} />
      <svg width={size} height={size} viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <defs>
          <clipPath id={clipId}>
            <path d={shirtPath} />
          </clipPath>
        </defs>
        {renderFill()}
        {colour3 && (
          <g>
            <path d="M11 2 L12 4 L16 4 L17 2" fill="none" stroke={colour3} strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M2 7 L5 11" fill="none" stroke={colour3} strokeWidth="1.4" />
            <path d="M26 7 L23 11" fill="none" stroke={colour3} strokeWidth="1.4" />
          </g>
        )}
        <path d={shirtPath} fill="none" stroke="#2A1F17" strokeWidth="1" strokeLinejoin="round" />
        {typeof topScore === 'number' && topScore > 0 && (
          <text
            x="17.2"
            y="8"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="4.6"
            fontWeight="700"
            fontFamily="var(--font-mono, monospace)"
            fill={colour3 || '#ffffff'}
            stroke="#000000"
            strokeWidth="0.35"
            paintOrder="stroke"
          >
            {topScore}
          </text>
        )}
      </svg>
      <GlobeIcons earths={earths} className={iconTextClass} />
    </div>
  )
}