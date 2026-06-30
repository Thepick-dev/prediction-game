import { createServerSupabaseClient } from './lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: competition } = await supabase
    .from('competitions')
    .select('name, status')
    .eq('status', 'active')
    .single()

  const isJoined = user && competition ? await supabase
    .from('competition_entries')
    .select('id')
    .eq('user_id', user.id)
    .single()
    .then(({ data }) => !!data) : false

  async function signOut() {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    redirect('/')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <h1 className="text-3xl font-bold mb-2">Prediction Game</h1>

        {competition && (
          <p className="text-gray-500 mb-8">{competition.name} is active</p>
        )}

        {user ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-4">Logged in as {user.email}</p>
            {competition && !isJoined && (
              <Link href="/join" className="block w-full bg-black text-white rounded-lg px-4 py-3 font-medium">
                Join Competition
              </Link>
            )}
            {isJoined && (
              <Link href="/picks" className="block w-full bg-black text-white rounded-lg px-4 py-3 font-medium">
                Make Your Pick
              </Link>
            )}
            <Link href="/leaderboard" className="block w-full border rounded-lg px-4 py-3 font-medium hover:border-black">
              Leaderboard
            </Link>
            <form action={signOut}>
              <button type="submit" className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">
                Log out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="bg-black text-white rounded-lg px-6 py-3 font-medium inline-block">
            Log in to play
          </Link>
        )}
      </div>
    </main>
  )
}