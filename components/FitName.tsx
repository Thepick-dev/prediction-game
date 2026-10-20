'use client'

import { useEffect, useRef, useState } from 'react'

// Shrinks its own font-size — down to `minSize`, never further — just
// enough that `children` renders on one line within whatever width the
// parent cell actually gives it. Most names fit at `baseSize` completely
// untouched; only a genuinely long one pays the size reduction, rather
// than every row being capped to fit the longest name on the board.
//
// Measures via an invisible twin fixed at `baseSize`, never the live
// element — mutating the live element's own style to re-measure it and
// then calling setState with the same result it already holds makes React
// bail out of re-rendering (same value in, no re-render out), which would
// leave that imperative mutation as the last word and silently undo the
// shrink. The ghost sidesteps that entirely: its size never depends on
// React state, so its scrollWidth is always a trustworthy "how wide would
// this be at full size" reading.
export default function FitName({ children, baseSize, minSize, className, style }: {
  children: React.ReactNode
  baseSize: number
  minSize: number
  className?: string
  style?: React.CSSProperties
}) {
  const ghostRef = useRef<HTMLSpanElement>(null)
  const visibleRef = useRef<HTMLSpanElement>(null)
  const [fontSize, setFontSize] = useState(baseSize)

  useEffect(() => {
    const ghost = ghostRef.current
    const parent = visibleRef.current?.parentElement
    if (!ghost || !parent) return

    function measure() {
      if (!ghost || !parent) return
      const available = parent.clientWidth
      const needed = ghost.scrollWidth
      if (available > 0 && needed > available) {
        // A 4% safety margin — scrollWidth rounds to whole pixels, so an
        // exact-fit computation can still be a sub-pixel over in reality
        // and trip the ellipsis fallback below for no visible reason.
        setFontSize(Math.max(minSize, Math.floor(baseSize * (available / needed) * 0.96)))
      } else {
        setFontSize(baseSize)
      }
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [children, baseSize, minSize])

  return (
    <>
      <span
        ref={ghostRef}
        aria-hidden="true"
        className={className}
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', fontSize: baseSize, pointerEvents: 'none', left: -9999, top: -9999 }}
      >
        {children}
      </span>
      {/* overflow/ellipsis is a backstop, not the main mechanism — shrinking
          handles every name actually in use today; this only protects
          against a hypothetical name so long even the size floor can't
          make it fit, so it clips instead of spilling into the next
          column. */}
      <span ref={visibleRef} className={className} style={{ ...style, fontSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', minWidth: 0, display: 'inline-block' }}>
        {children}
      </span>
    </>
  )
}
