'use client'

import { useEffect, useState } from 'react'

const DISMISS_COUNT_KEY = 'lms-install-prompt-dismiss-count'
const DISMISS_AT_KEY = 'lms-install-prompt-dismissed-at'
const RENAG_AFTER_MS = 14 * 24 * 60 * 60 * 1000 // re-offer after 2 weeks, not every visit
const MAX_AUTO_DISMISSALS = 2 // dismissed twice = stop auto-offering; Settings can still bring it back

// Settings page dispatches this to bring the banner back on demand —
// the two components don't otherwise know about each other.
export const SHOW_INSTALL_PROMPT_EVENT = 'lms-show-install-prompt'

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
// installed (display-mode: standalone).
//
// Platform detection and capturing the deferred prompt event both happen
// unconditionally on every mount — Settings' "show it again" button needs
// a ready deferredPrompt/iOS flag even when the auto-show logic below has
// decided not to display anything. Auto-showing is the separate, gated
// decision: re-offered after two weeks following a single dismissal, but
// dismissing twice stops the automatic nagging entirely — from then on
// it's only reachable via Settings.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null)
  const [isIOSDevice, setIsIOSDevice] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return }
    if (isIOS()) setIsIOSDevice(true)

    function handler(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (isStandalone()) return
    let count = 0
    let dismissedAt = 0
    try {
      count = Number(localStorage.getItem(DISMISS_COUNT_KEY) ?? 0)
      dismissedAt = Number(localStorage.getItem(DISMISS_AT_KEY) ?? 0)
    } catch {
      // Private browsing / storage blocked — just treat as never dismissed.
    }
    if (count >= MAX_AUTO_DISMISSALS) return
    if (dismissedAt && Date.now() - dismissedAt < RENAG_AFTER_MS) return
    setVisible(true)
  }, [])

  useEffect(() => {
    function showHandler() { setVisible(true) }
    window.addEventListener(SHOW_INSTALL_PROMPT_EVENT, showHandler)
    return () => window.removeEventListener(SHOW_INSTALL_PROMPT_EVENT, showHandler)
  }, [])

  function dismiss() {
    try {
      const count = Number(localStorage.getItem(DISMISS_COUNT_KEY) ?? 0) + 1
      localStorage.setItem(DISMISS_COUNT_KEY, String(count))
      localStorage.setItem(DISMISS_AT_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    setVisible(false)
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  if (installed || !visible) return null

  return (
    <div
      className="fixed left-1/2 z-[240] px-4 py-3 rounded-2xl"
      style={{
        bottom: 14,
        transform: 'translateX(-50%)',
        width: 'min(92vw, 380px)',
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
      {isIOSDevice ? (
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
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {deferredPrompt ? 'Add it to your home screen for quick access.' : 'Your browser hasn’t offered an install option yet — try reloading the page.'}
            </p>
          </div>
          {deferredPrompt && (
            <button onClick={install} className="pop-button px-3 py-1.5 text-xs shrink-0">Install</button>
          )}
        </div>
      )}
    </div>
  )
}
