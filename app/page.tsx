import { createServerSupabaseClient } from './lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  async function signOut() {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    redirect('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Prediction Game</h1>
        {user ? (
          <div>
            <p className="mb-4">Logged in as: {user.email}</p>
            <form action={signOut}>
              <button
                type="submit"
                className="bg-black text-white rounded px-4 py-2"
              >
                Log out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="bg-black text-white rounded px-4 py-2"
          >
            Log in
          </Link>
        )}
      </div>
    </main>
  )
}