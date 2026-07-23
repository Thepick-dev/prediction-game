'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

type Props = {
  eyebrow: string
  title: string
  subtitle?: string
  filenameBase: string
  onClose: () => void
  children: React.ReactNode
  footerNote?: string
}

// Shared "matchday ticket" chrome (scalloped edges, dashed dividers, cream
// card) plus a share mechanism, used everywhere something needs to be
// shareable as an image: the pick confirmation slip, the gameweek recap,
// and the leaderboard snapshot. One implementation so all three actually
// look identical, not just "similar".
export default function TicketModal({ eyebrow, title, subtitle, filenameBase, onClose, children, footerNote }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleShare() {
    if (!cardRef.current) return
    setSaving(true)
    setError(null)
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 })
      const filename = `${filenameBase}.png`

      // Mobile browsers with the Web Share API can hand the image straight
      // to WhatsApp (or anything else) via the native share sheet.
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      if (canShareFiles) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title })
          setSaving(false)
          return
        }
      }

      // Most desktop browsers don't support sharing files at all — there's
      // no way to hand WhatsApp an image via a plain link on desktop, so
      // the honest fallback is: download the image, then open a WhatsApp
      // chat ready-to-go so it's still just one manual attach away, rather
      // than a button that silently does nothing.
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      link.click()
      const text = encodeURIComponent(`${title}${subtitle ? ` — ${subtitle}` : ''} 🏆 (image saved — attach it here!)`)
      window.open(`https://wa.me/?text=${text}`, '_blank')
    } catch {
      setError('Could not generate the image — try again.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-xs" onClick={e => e.stopPropagation()}>

        <div ref={cardRef} className="relative shadow-2xl" style={{ backgroundColor: '#F5ECD9', color: '#241a12' }}>
          <div className="absolute -top-2 left-0 right-0 flex justify-between px-1" style={{ height: '16px' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-full" style={{ width: '10px', height: '10px', backgroundColor: '#1e1914' }} />
            ))}
          </div>

          <div className="px-5 pt-6 pb-4 text-center border-b-2 border-dashed" style={{ borderColor: '#241a1733' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: '#B5493C' }}>{eyebrow}</p>
            <p className="text-xl font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-heading), serif' }}>{title}</p>
            {subtitle && <p className="text-xs uppercase tracking-widest mt-1" style={{ color: '#241a1799' }}>{subtitle}</p>}
          </div>

          {children}

          <div className="relative border-t-2 border-dashed" style={{ borderColor: '#241a1733' }}>
            <div className="absolute -left-2 -top-2 rounded-full" style={{ width: '16px', height: '16px', backgroundColor: '#1e1914' }} />
            <div className="absolute -right-2 -top-2 rounded-full" style={{ width: '16px', height: '16px', backgroundColor: '#1e1914' }} />
          </div>

          <div className="px-5 py-3 text-center">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>{footerNote ?? 'LMS All-Stars Predictions'}</p>
          </div>

          <div className="absolute -bottom-2 left-0 right-0 flex justify-between px-1" style={{ height: '16px' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-full" style={{ width: '10px', height: '10px', backgroundColor: '#1e1914' }} />
            ))}
          </div>
        </div>

        {error && <p className="text-red-300 text-xs text-center mt-3">{error}</p>}

        <button
          onClick={handleShare}
          disabled={saving}
          className="w-full rounded-lg py-3 mt-5 font-bold uppercase tracking-wider text-sm shadow-lg disabled:opacity-60"
          style={{ backgroundColor: '#25D366', color: '#0b1a12', fontFamily: 'var(--font-heading), serif' }}
        >
          {saving ? 'Preparing...' : '📱 Share to WhatsApp'}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-lg py-2.5 mt-2 font-bold uppercase tracking-wider text-xs"
          style={{ color: '#F5ECD9' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
