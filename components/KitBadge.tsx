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
  // Its own id, same colour-qualified reasoning as clipId — a page can
  // render many badges at once (Leaderboard, Wall), and SVG id references
  // resolve to the first matching id anywhere in the document, so an
  // unqualified id would make every fade badge after the first show the
  // first badge's colours instead of its own.
  const gradientId = `kit-fade-${colour1.replace('#', '')}-${colour2.replace('#', '')}`

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
            <polygon points="4.5,-2 8.5,-2 23.5,26 19.5,30" fill={colour2} />
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
            {Array.from({ length: 7 }).map((_, i) => (
              <rect key={i} x={i * 4 + 1.2} y="0" width="1.6" height="28" fill={colour2} />
            ))}
          </g>
        )

      case 'checkered':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {Array.from({ length: 7 }).map((_, row) =>
              Array.from({ length: 7 }).map((_, col) =>
                (row + col) % 2 === 1 ? <rect key={`${row}-${col}`} x={col * 4} y={row * 4} width="4" height="4" fill={colour2} /> : null
              )
            )}
          </g>
        )

      case 'diagonal':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="0,28 28,28 28,0" fill={colour2} />
          </g>
        )

      case 'chest-bands':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <rect x="0" y="3.5" width="28" height="1.6" fill={colour2} />
            <rect x="0" y="6.5" width="28" height="1.6" fill={colour2} />
          </g>
        )

      case 'lightning':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="15,3 9,14 13,14 12,21 19,10 15,10" fill={colour2} />
          </g>
        )

      case 'zigzag':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {Array.from({ length: 8 }).map((_, i) => {
              const x = i * 3.5 + 1
              return (
                <polyline
                  key={i}
                  points={`${x},0 ${x + 1},3.5 ${x},7 ${x + 1},10.5 ${x},14 ${x + 1},17.5 ${x},21 ${x + 1},24.5 ${x},28`}
                  fill="none"
                  stroke={colour2}
                  strokeWidth="1"
                />
              )
            })}
          </g>
        )

      case 'v-stripe':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="3,2 7,2 14,17 21,2 25,2 14,23" fill={colour2} />
          </g>
        )

      case 'fade':
        return (
          <g clipPath={`url(#${clipId})`}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colour1} />
                <stop offset="100%" stopColor={colour2} />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="28" height="28" fill={`url(#${gradientId})`} />
          </g>
        )

      case 'centre-stripe':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <rect x="11" y="0" width="6" height="28" fill={colour2} />
          </g>
        )

      case 'polka':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 4 }).map((_, col) => (
                <circle key={`${row}-${col}`} cx={col * 7 + (row % 2 === 0 ? 3.5 : 7)} cy={row * 6 + 2} r="1.8" fill={colour2} />
              ))
            )}
          </g>
        )

      case 'argyle':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 4 }).map((_, col) => {
                const cx = col * 7 + (row % 2 === 0 ? 3.5 : 7)
                const cy = row * 6 + 2
                return <polygon key={`${row}-${col}`} points={`${cx},${cy - 3} ${cx + 3},${cy} ${cx},${cy + 3} ${cx - 3},${cy}`} fill={colour2} />
              })
            )}
          </g>
        )

      case 'rings':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <circle cx="14" cy="13" r="10" fill={colour2} />
            <circle cx="14" cy="13" r="7" fill={colour1} />
            <circle cx="14" cy="13" r="4" fill={colour2} />
          </g>
        )

      case 'side-panels':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <rect x="0" y="0" width="4" height="28" fill={colour2} />
            <rect x="24" y="0" width="4" height="28" fill={colour2} />
          </g>
        )

      case 'hem-band':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <rect x="0" y="19" width="28" height="3" fill={colour2} />
          </g>
        )

      case 'racing-stripes':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <rect x="8" y="0" width="2.5" height="28" fill={colour2} />
            <rect x="12" y="0" width="2.5" height="28" fill={colour2} />
          </g>
        )

      case 'shoulder-yoke':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <rect x="0" y="2" width="28" height="5" fill={colour2} />
          </g>
        )

      case 'camo':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <ellipse cx="8" cy="7" rx="5" ry="3.5" fill={colour2} transform="rotate(-20 8 7)" />
            <ellipse cx="19" cy="9" rx="4.5" ry="3" fill={colour2} transform="rotate(15 19 9)" />
            <ellipse cx="10" cy="17" rx="4" ry="3" fill={colour2} transform="rotate(30 10 17)" />
            <ellipse cx="20" cy="19" rx="5" ry="3.5" fill={colour2} transform="rotate(-10 20 19)" />
            <ellipse cx="14" cy="13" rx="3.5" ry="2.5" fill={colour2} transform="rotate(45 14 13)" />
          </g>
        )

      case 'marl':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {[[6, 4], [11, 3], [17, 5], [22, 4], [4, 9], [9, 8], [15, 10], [20, 9], [25, 11], [7, 14], [13, 15], [18, 13], [23, 16], [5, 19], [10, 20], [16, 21], [21, 19], [8, 24], [14, 23], [19, 24]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="0.9" fill={colour2} />
            ))}
          </g>
        )

      case 'double-diagonal':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="2,-2 5,-2 20,26 17,30" fill={colour2} />
            <polygon points="9,-2 12,-2 27,26 24,30" fill={colour2} />
          </g>
        )

      case 'wavy-halves':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <path d="M14,0 Q18,4 14,8 Q10,12 14,16 Q18,20 14,24 Q10,26 14,28 L28,28 L28,0 Z" fill={colour2} />
          </g>
        )

      case 'sleeve-stripe':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            <polygon points="2.5,6.2 6.5,10.8 8,10 4,5.4" fill={colour2} />
            <polygon points="25.5,6.2 21.5,10.8 20,10 24,5.4" fill={colour2} />
          </g>
        )

      case 'pixel-noise':
        return (
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="28" height="28" fill={colour1} />
            {[[0, 0], [2, 1], [5, 0], [1, 3], [4, 3], [6, 2], [3, 5], [0, 6], [5, 5], [2, 7], [6, 7], [1, 1], [3, 2], [5, 4], [0, 4], [6, 5], [2, 3], [4, 6], [1, 6], [3, 0]].map(([col, row], i) => (
              <rect key={i} x={col * 4} y={row * 4} width="4" height="4" fill={colour2} />
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