'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'

export default function PendingPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
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
          <div className="pop-panel p-8 text-center" style={{ maxWidth: 420, margin: '0 auto' }}>
            <div className="text-5xl mb-4">⏳</div>
            <h1 className="pop-hero pop-hero--pink text-3xl mb-4">Awaiting Approval</h1>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Your account is pending approval from the admin. You&apos;ll be able to access the game as soon
              as they approve it — check back soon.
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              If you&apos;ve been waiting a while, contact the game organiser directly.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell user={user} displayName={displayName}>
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-3">Awaiting Approval</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Your account is pending approval from the admin.
          You will be able to access the game once approved.
          Check back soon.
        </p>
        <p className="text-xs text-gray-400">
          If you have been waiting a while, contact the game organiser directly.
        </p>
      </div>
    </Shell>
  )
}
