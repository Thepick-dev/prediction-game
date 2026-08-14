'use client'

import { useState } from 'react'

interface StarRatingProps {
  average: number | null
  count: number
  yourRating: number | null
  onRate: (rating: number) => void
  max?: number
  popArt?: boolean
  interactive?: boolean
}

// Reused for both Wall comments and question answers — shows the live
// crowd average next to a clickable 1-7 row when the viewer is allowed to
// vote (interactive), or just the average alone when they're not (e.g. on
// their own post, where rating yourself isn't allowed).
export default function StarRating({ average, count, yourRating, onRate, max = 7, popArt = false, interactive = true }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const activeColor = popArt ? 'var(--pop-yellow)' : '#D9A441'
  const dimColor = popArt ? 'rgba(255,255,255,0.25)' : '#F5ECD933'
  const shown = hover ?? yourRating ?? 0

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {interactive && (
        <div className="flex items-center" onMouseLeave={() => setHover(null)}>
          {Array.from({ length: max }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHover(n)}
              onClick={() => onRate(n)}
              className="text-sm leading-none px-0.5"
              style={{ color: n <= shown ? activeColor : dimColor }}
              aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
            >
              ★
            </button>
          ))}
        </div>
      )}
      {count > 0 && (
        <span className="text-[10px]" style={{ color: popArt ? 'rgba(255,255,255,0.4)' : '#F5ECD966' }}>
          👥 {average!.toFixed(1)} avg ({count})
        </span>
      )}
    </div>
  )
}
