'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from './lib/supabase'
import Shell from './components/ceefax-shell'
import { usePopArtTheme } from './lib/usePopArtTheme'

export default function NotFound() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  // Best-effort only — a 404 has to render fine even if this fails or a
  // visitor has no session at all, so nothing here blocks the page.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setUser(data.user)
      supabase.from('profiles').select('display_name').eq('id', data.user.id).single()
        .then(({ data: profile }) => setDisplayName(profile?.display_name ?? ''))
    })
  }, [])

  if (popArt) {
    return (
      <Shell user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">
          <div className="pop-panel p-8 text-center" style={{ maxWidth: 420, margin: '0 auto' }}>
            <p className="pop-hero pop-hero--pink text-7xl sm:text-8xl mb-2">404</p>
            <h1 className="pop-headline text-xl mb-3">Page Not Found</h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
              That page doesn&apos;t exist — it may have moved, or the link&apos;s just wrong.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/" className="pop-button py-3 text-sm">
                Back to Home
              </Link>
              <Link href="/picks" className="pop-button pop-button--yellow py-3 text-sm">
                Go to Picks
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'linear-gradient(160deg, #2A1F17 0%, #1a120b 55%, #241a12 100%)' }}
      />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-3 py-8">
        <div
          className="w-full max-w-md rounded-lg shadow-2xl border border-[#D9A441]/30 p-8 text-center"
          style={{ backgroundColor: 'rgba(30, 25, 20, 0.88)' }}
        >
          <p className="text-5xl font-bold mb-3" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>404</p>
          <h1 className="text-lg font-bold uppercase tracking-wide mb-2 text-[#F5ECD9]">Page Not Found</h1>
          <p className="text-sm text-[#F5ECD9]/60 mb-6">
            That page doesn&apos;t exist — it may have moved, or the link&apos;s just wrong.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="rounded-lg py-2.5 font-bold uppercase tracking-wider text-sm"
              style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}
            >
              Back to Home
            </Link>
            <Link
              href="/picks"
              className="rounded-lg py-2.5 font-bold uppercase tracking-wider text-sm border border-[#D9A441]/40 text-[#D9A441]"
            >
              Go to Picks
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
