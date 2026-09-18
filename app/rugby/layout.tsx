import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../lib/supabase-server'
import { requireAdmin } from '../lib/require-admin'
import RugbyShell from '../../components/RugbyShell'

const COOKIE_NAME = 'rugby_preview_ok'

// Two separate locks. (1) WHO is allowed to even attempt this layout:
// admins always; everyone else only once the active competition's
// public_signups_enabled is on (the admin-facing "launch" toggle on
// /admin/rugby). (2) the temporary shared preview password — deliberately
// NOT tied to that toggle at all, by explicit instruction: it stays a hard
// requirement for literally everyone (admin included) until it's removed
// as its own separate, later decision, so turning signups on can be used
// as a "let people in to preview with the password" step without that
// being the same moment the site goes fully public.
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

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('ticker_text, public_signups_enabled').eq('status', 'active').maybeSingle()
  const tickerText = competition?.ticker_text?.trim() || null
  const publicOpen = competition?.public_signups_enabled === true

  if (!admin && !publicOpen) redirect('/')

  const jar = await cookies()
  const unlocked = jar.get(COOKIE_NAME)?.value === 'yes'

  const { data: { user } } = await supabase.auth.getUser()
  let displayName: string | undefined
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
    displayName = profile?.display_name ?? undefined
  }

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
    <RugbyShell userId={user?.id} displayName={displayName} tickerText={tickerText}>
      {children}
    </RugbyShell>
  )
}
