'use client'

import { useState, useCallback, useEffect } from 'react'

// The full mascot with a real player photo patched onto the front of the
// cap. Deliberately layered in code rather than baked into logo.png itself
// — swapping in a different player is just replacing the one file at
// public/mascot-cap-photo.png, no code change needed. Only ever used in
// the full-screen loading animation, never the small header logo (see
// PopArtLoading.tsx) — that split is intentional, not an oversight.
//
// Two things that both matter here, kept deliberately separate: the OUTER
// div's bounce-in/glow CSS animation (see .pop-logo-pulse in globals.css)
// always plays immediately, completely unaffected by image loading — an
// earlier version gated the whole thing on both images' onLoad, which
// meant the animation's own clock (it starts the instant the div mounts,
// visible or not) was often already partway through by the time anything
// showed, looking clipped. The two IMAGES themselves are separately held
// invisible until BOTH have loaded, then revealed together in the same
// render — without this, the smaller logo paints first and the cap photo
// visibly pops on a beat later. A short timeout forces them visible
// regardless if either one is ever slow/broken, so this can never hang.
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
      className={className}
      style={{ position: 'relative', aspectRatio: '1118 / 960', ...style }}
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
