'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

// Wraps any stat card or chart panel with a small corner button that
// captures just that card as an image and hands it to WhatsApp — same
// toPng + navigator.share (native share sheet) / download+wa.me fallback
// pattern already used for the Results ticket and the Picks page's live
// table, just scaled down to a per-card size instead of a full page.
// The button hides itself for the split second the screenshot is taken,
// so it never ends up baked into the image it triggers.
export default function ShareableCard({
  children, filename, className, style,
}: {
  children: React.ReactNode
  filename: string
  className?: string
  style?: React.CSSProperties
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [hideButton, setHideButton] = useState(false)

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    if (!cardRef.current || sharing) return
    setSharing(true)
    setHideButton(true)
    try {
      await new Promise(r => requestAnimationFrame(r))
      const node = cardRef.current
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#0A0A0A', width: node.scrollWidth, height: node.scrollHeight })
      const safeFilename = `${filename.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      if (canShareFiles) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], safeFilename, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] })
          return
        }
      }
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = safeFilename
      link.click()
      window.open(`https://wa.me/?text=${encodeURIComponent('👀 (image saved — attach it here!)')}`, '_blank')
    } catch {
      // Non-critical — a failed share just means nothing happens, never
      // worth surfacing an error over a stat card image.
    } finally {
      setHideButton(false)
      setSharing(false)
    }
  }

  return (
    <div ref={cardRef} className={`relative ${className ?? ''}`} style={style}>
      {!hideButton && (
        <button
          onClick={handleShare}
          disabled={sharing}
          className="absolute top-1.5 right-1.5 z-10 rounded-full flex items-center justify-center disabled:opacity-50"
          style={{ width: 22, height: 22, background: 'rgba(37,211,102,0.9)', fontSize: 11 }}
          title="Share to WhatsApp"
          aria-label="Share to WhatsApp"
        >
          📱
        </button>
      )}
      {children}
    </div>
  )
}
