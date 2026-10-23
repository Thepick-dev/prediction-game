'use client'

import { useEffect, useRef, useState } from 'react'

// The piece that actually answers "jumps on loading": a page's own
// `if (loading) return <PopArtLoading/>` conditional swaps loadingView
// out and the real content in within a single React commit — an instant
// cut, since React has no concept of "unmount, but slowly." This keeps
// the loading view mounted for a brief fade-out AFTER `loading` flips
// false, revealing the real content underneath (which mounts in the
// SAME commit the fade starts, so there's never a blank gap between
// them) instead of yanking the overlay away.
export default function LoadingTransition({ loading, loadingView, children }: {
  loading: boolean
  loadingView: React.ReactNode
  children: React.ReactNode
}) {
  const [showOverlay, setShowOverlay] = useState(loading)
  const [fadingOut, setFadingOut] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (loading) {
      clearTimeout(timeoutRef.current)
      setShowOverlay(true)
      setFadingOut(false)
      return
    }
    if (showOverlay) {
      setFadingOut(true)
      timeoutRef.current = setTimeout(() => {
        setShowOverlay(false)
        setFadingOut(false)
      }, 260)
    }
    return () => clearTimeout(timeoutRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  return (
    <>
      {children}
      {showOverlay && (
        <div className="pop-loading-transition" style={{ opacity: fadingOut ? 0 : 1 }}>
          {loadingView}
        </div>
      )}
    </>
  )
}
