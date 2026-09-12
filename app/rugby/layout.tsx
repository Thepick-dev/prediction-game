import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../lib/supabase-server'
import { requireAdmin } from '../lib/require-admin'
import Link from 'next/link'

const COOKIE_NAME = 'rugby_preview_ok'

// Two separate locks, both required while this is still being built:
// (1) a real admin account (same requireAdmin every other admin-only
// route uses), and (2) a temporary shared password on top of that, so a
// half-built game is never one guessed URL away from a real player.
// Both come off again once this is ready for a real launch — a later,
// separate task, not decided here.
async function unlockRugby(formData: FormData) {
  'use server'
  const password = formData.get('password') as string
  if (password && process.env.RUGBY_PREVIEW_PASSWORD && password === process.env.RUGBY_PREVIEW_PASSWORD) {
    const jar = await cookies()
    jar.set(COOKIE_NAME, 'yes', { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' })
  }
  redirect('/rugby')
}

export default async function RugbyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')

  const jar = await cookies()
  const unlocked = jar.get(COOKIE_NAME)?.value === 'yes'

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('ticker_text').eq('status', 'active').maybeSingle()
  const tickerText = competition?.ticker_text?.trim() || null

  if (!unlocked) {
    return (
      <div className="pop-art-theme min-h-screen flex items-center justify-center p-4">
        <form action={unlockRugby} className="pop-panel pop-panel--orange p-6 w-full max-w-xs space-y-3">
          <h1 className="pop-headline text-lg" style={{ color: 'var(--pop-white)' }}>🏉 Rugby — Locked</h1>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>This is still being built. Enter the temporary password to preview it.</p>
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="rounded px-3 py-2 text-sm w-full"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--pop-white)' }}
          />
          <button type="submit" className="pop-button pop-button--yellow w-full">
            Unlock
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="pop-art-theme min-h-screen">
      <header className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
        <Link href="/rugby" className="pop-headline text-lg" style={{ color: 'var(--pop-white)' }}>🏉 SIX NATIONS</Link>
        <nav className="flex items-center gap-4 text-xs flex-wrap">
          <Link href="/rugby" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.7)' }}>Home</Link>
          <Link href="/rugby/picks" className="nav-link hover:opacity-80" style={{ color: 'var(--pop-orange)', fontWeight: 700 }}>Picks</Link>
          <Link href="/rugby/squad" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.7)' }}>My Squad</Link>
          <Link href="/rugby/leaderboard" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.7)' }}>Leaderboard</Link>
          <Link href="/rugby/results" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.7)' }}>Results</Link>
          <Link href="/rugby/rules" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.7)' }}>Rules</Link>
          <Link href="/rugby/winners" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.7)' }}>Winners</Link>
          <Link href="/picks" className="nav-link hover:opacity-80" style={{ color: 'rgba(255,255,255,0.5)' }}>⚽ Football</Link>
        </nav>
      </header>
      {tickerText && (
        <div className="px-4 py-1.5 text-xs text-center" style={{ background: 'var(--pop-orange)', color: 'var(--pop-black)', fontWeight: 600 }}>
          📢 {tickerText}
        </div>
      )}
      <main>{children}</main>
    </div>
  )
}
