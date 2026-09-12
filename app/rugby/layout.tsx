import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../lib/supabase-server'
import { requireAdmin } from '../lib/require-admin'

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

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <form action={unlockRugby} className="bg-white border rounded-lg p-6 w-full max-w-xs space-y-3">
          <h1 className="font-bold text-lg">🏉 Rugby — locked</h1>
          <p className="text-xs text-gray-500">This is still being built. Enter the temporary password to preview it.</p>
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="border rounded px-3 py-2 text-sm w-full"
          />
          <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm font-bold w-full">
            Unlock
          </button>
        </form>
      </div>
    )
  }

  return <>{children}</>
}
