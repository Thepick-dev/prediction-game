'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'lms-install-prompt-dismissed-at'
const RENAG_AFTER_MS = 14 * 24 * 60 * 60 * 1000 // re-offer after 2 weeks, not every visit

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

// A small, dismissible "add to your home screen" banner. Chrome/Edge/
// Android fire a real beforeinstallprompt event we can hook a native
// install flow to; iOS Safari never fires that event at all (Apple's own
// restriction) and Add to Home Screen is manual-only there, so it gets a
// plain instruction banner instead. Skipped entirely once already running
// installed (display-mode: standalone), and only re-offered every couple
// of weeks after a dismissal rather than nagging on every visit.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (isStandalone()) return
    let dismissedAt = 0
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    } catch {
      // Private browsing / storage blocked — just treat as never dismissed.
    }
    if (dismissedAt && Date.now() - dismissedAt < RENAG_AFTER_MS) return

    if (isIOS()) {
      setShowIOSHint(true)
      setVisible(true)
      return
    }

    function handler(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> })
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setVisible(false)
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setDeferredPrompt(null)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed left-1/2 z-[240] px-4 py-3 rounded-2xl"
      style={{
        bottom: 14,
        transform: 'translateX(-50%)',
        maxWidth: 'min(92vw, 380px)',
        background: 'var(--pop-surface)',
        border: '2px solid var(--pop-blue)',
        boxShadow: '0 0 18px rgba(0,242,250,0.4), 0 4px 18px rgba(0,0,0,0.5)',
      }}
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-1.5 right-2.5 text-xs font-black"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        ✕
      </button>
      {showIOSHint ? (
        <>
          <p className="font-black text-sm mb-1 pr-4" style={{ color: 'var(--pop-white)' }}>📲 Add to Home Screen</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> to install LMS All-Stars like an app.
          </p>
        </>
      ) : (
        <div className="flex items-center gap-3 pr-4">
          <div className="flex-1">
            <p className="font-black text-sm" style={{ color: 'var(--pop-white)' }}>📲 Install LMS All-Stars</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Add it to your home screen for quick access.</p>
          </div>
          <button onClick={install} className="pop-button px-3 py-1.5 text-xs shrink-0">Install</button>
        </div>
      )}
    </div>
  )
}
