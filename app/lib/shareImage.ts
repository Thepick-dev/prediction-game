'use client'

import { toPng } from 'html-to-image'

type ShareImageOptions = {
  filename: string
  shareTitle: string
  whatsappText: string
  pixelRatio?: number
  backgroundColor?: string
  width?: number
  height?: number
}

// Captures `node` as a PNG and hands it straight to the native share sheet
// where that's available (so it can go directly into WhatsApp), falling
// back to downloading the image and opening a WhatsApp chat ready for it
// to be attached manually — most desktop browsers can't share files via a
// plain link at all. Shared by every "Share to WhatsApp" button on the
// site (previously three separate, near-identical copies of this exact
// logic) so there's exactly one place this can go wrong, not three.
export async function shareElementAsImage(node: HTMLElement, options: ShareImageOptions) {
  const { filename, shareTitle, whatsappText, pixelRatio = 2, backgroundColor, width, height } = options
  const dataUrl = await toPng(node, { pixelRatio, backgroundColor, width, height })

  const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
  if (canShareFiles) {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], filename, { type: 'image/png' })
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: shareTitle })
      return
    }
  }

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
  window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank')
}
