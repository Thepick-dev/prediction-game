'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'

export default function CancelledPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      setUser(authUser)
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    // Its own isolated query — a problem reading the admin's optional
    // explanation must never be able to stop this page from at least
    // showing the plain "Game Cancelled" message.
    const { data: comp } = await supabase.from('competitions').select('paused_message').eq('status', 'active').single()
    setMessage(comp?.paused_message ?? null)
    setLoading(false)
  }

  if (loading) {
    return (
      <Shell theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">
          <div className="pop-panel pop-panel--red p-8 text-center" style={{ maxWidth: 480, margin: '0 auto' }}>
            <div className="text-5xl mb-4">🚫</div>
            <h1 className="pop-hero pop-hero--pink text-3xl mb-4">Game Cancelled</h1>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {message || "The game has been paused by the admin. Check back soon — nothing you've done so far is lost."}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Contact the admin if you have questions.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell user={user} displayName={displayName}>
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold mb-3">Game Cancelled</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          {message || "The game has been paused by the admin. Check back soon — nothing you've done so far is lost."}
        </p>
        <p className="text-xs text-gray-400">Contact the admin if you have questions.</p>
      </div>
    </Shell>
  )
}
