'use client'

import { useState, useCallback, useEffect } from 'react'

// The full mascot with a real player photo patched onto the front of the
// cap. Deliberately layered in code rather than baked into logo.png itself
// — swapping in a different player is just replacing the one file at
// public/mascot-cap-photo.png, no code change needed. Only ever used in
// the full-screen loading animation, never the small header logo (see
// PopArtLoading.tsx) — that split is intentional, not an oversight.
//
// The flash-in animation (.pop-logo-flash-in, globals.css) is applied only
// once imagesReady flips true — not on mount. An earlier version played a
// fixed-timer CSS animation the instant the div mounted, fully decoupled
// from when the images actually finished loading (which can take anywhere
// from ~0ms to the 1500ms fallback below): the animation would finish
// while the images were still invisible, so what people actually saw was
// no animation at all, just an unanimated pop whenever loading happened to
// finish — exactly the "patchy/unstable" look this was rebuilt to fix.
// Tying the animation class to imagesReady means it always plays exactly
// once, exactly when the mascot actually becomes visible. The two IMAGES
// are separately held invisible until BOTH have loaded, then revealed
// together in the same render — without this, the smaller logo paints
// first and the cap photo visibly pops on a beat later. A short timeout
// forces them visible regardless if either one is ever slow/broken, so
// this can never hang.
export default function MascotWithCapPhoto({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [forceShow, setForceShow] = useState(false)
  const imagesReady = (logoLoaded && photoLoaded) || forceShow

  useEffect(() => {
    const timeout = setTimeout(() => setForceShow(true), 1500)
    return () => clearTimeout(timeout)
  }, [])

  // Ref callbacks, not just onLoad — a browser-cached image (the normal
  // case after someone's first visit, or thanks to the <link rel="preload">
  // in app/layout.tsx) can already be .complete the instant it mounts,
  // before React ever attaches the onLoad listener.
  const logoRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setLogoLoaded(true)
  }, [])
  const photoRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setPhotoLoaded(true)
  }, [])

  return (
    <div
      className={`${className ?? ''} ${imagesReady ? 'pop-logo-flash-in' : ''}`}
      style={{ position: 'relative', aspectRatio: '1118 / 960', opacity: imagesReady ? undefined : 0, ...style }}
    >
      <img
        ref={logoRef}
        src="/logo.png"
        alt=""
        onLoad={() => setLogoLoaded(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: imagesReady ? 1 : 0 }}
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
          width: '8.6%',
          aspectRatio: '220 / 278',
          objectFit: 'cover',
          borderRadius: '50%',
          border: '2.5px solid white',
          transform: 'translate(-50%, -50%) rotate(-8deg)',
          opacity: imagesReady ? 1 : 0,
        }}
      />
    </div>
  )
}
