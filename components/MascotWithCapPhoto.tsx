'use client'

import { useState, useCallback } from 'react'

// The full mascot with a real player photo patched onto the front of the
// cap. Deliberately layered in code rather than baked into logo.png itself
// — swapping in a different player is just replacing the one file at
// public/mascot-cap-photo.png, no code change needed. Only ever used in
// the full-screen loading animation, never the small header logo (see
// PopArtLoading.tsx) — that split is intentional, not an oversight.
//
// The two images load independently over the network, so without this
// they'd pop in one at a time (whichever finishes downloading first) —
// visibly un-smooth on a slower connection. Held at opacity 0 until BOTH
// have actually loaded, then faded in together as one composite.
export default function MascotWithCapPhoto({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const ready = logoLoaded && photoLoaded

  // Ref callbacks, not just onLoad — a browser-cached image (the normal
  // case after someone's first visit) can already be .complete the instant
  // it mounts, before React ever attaches the onLoad listener, which would
  // otherwise leave this stuck invisible forever rather than just briefly
  // un-smooth.
  const logoRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setLogoLoaded(true)
  }, [])
  const photoRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setPhotoLoaded(true)
  }, [])

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        aspectRatio: '1118 / 960',
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.2s ease',
        ...style,
      }}
    >
      <img
        ref={logoRef}
        src="/logo.png"
        alt=""
        onLoad={() => setLogoLoaded(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <img
        ref={photoRef}
        src="/mascot-cap-photo.png"
        alt=""
        onLoad={() => setPhotoLoaded(true)}
        style={{
          position: 'absolute',
          left: '40%',
          top: '12.5%',
          width: '8%',
          aspectRatio: '220 / 278',
          objectFit: 'cover',
          borderRadius: '50%',
          border: '2.5px solid white',
          transform: 'translate(-50%, -50%) rotate(-8deg)',
        }}
      />
    </div>
  )
}
