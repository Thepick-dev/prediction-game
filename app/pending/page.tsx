'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import PopArtLoading from '../../components/PopArtLoading'
import PenaltyShootout from '../../components/PenaltyShootout'
import { usePopArtTheme } from '../lib/usePopArtTheme'

export default function PendingPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  // Whether this user's account was created after the active competition's
  // Gameweek 1 deadline had already passed — they can't join a competition
  // that's already under way, but they weren't around to have missed
  // anything either, so it gets its own explanation rather than the
  // generic "awaiting approval" message.
  const [isLateJoiner, setIsLateJoiner] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      setUser(authUser)
      const { data: profile } = await supabase.from('profiles').select('display_name, pending_since').eq('id', authUser.id).single()
      setDisplayName(profile?.display_name ?? '')

      if (profile?.pending_since) {
        const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').single()
        if (comp) {
          const { data: gw1 } = await supabase.from('gameweeks').select('deadline').eq('competition_id', comp.id).eq('number', 1).single()
          if (gw1 && new Date(profile.pending_since) > new Date(gw1.deadline)) {
            setIsLateJoiner(true)
          }
        }
      }
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
          <div className="pop-panel p-8 text-center mb-6" style={{ maxWidth: 480, margin: '0 auto' }}>
            {isLateJoiner ? (
              <>
                <div className="text-5xl mb-4">🚪</div>
                <h1 className="pop-hero pop-hero--pink text-3xl mb-4">Just Missed It!</h1>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  This competition is already under way, so you can&apos;t join it partway through — but you&apos;re
                  all signed up and ready for the next one. The admin will be in touch when it&apos;s about to start.
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  In the meantime, have a go on the mini-game below — your best score is on the board.
                </p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">⏳</div>
                <h1 className="pop-hero pop-hero--pink text-3xl mb-4">Awaiting Approval</h1>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Your account is pending approval from the admin. You&apos;ll be able to access the game as soon
                  as they approve it — check back soon.
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  If you&apos;ve been waiting a while, contact the game organiser directly.
                </p>
              </>
            )}
          </div>

          {isLateJoiner && user && (
            <div style={{ maxWidth: 480, margin: '0 auto' }}>
              <PenaltyShootout userId={user.id} />
            </div>
          )}
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
