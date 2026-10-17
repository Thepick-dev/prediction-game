import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from './lib/supabase-server'
import LandingPage from '../components/LandingPage'

// Logged-in visitors always just land on /picks as before — proxy.ts
// still owns the approved/pending/paused checks for that path, this only
// decides what a logged-OUT visitor to '/' sees. '/' had to become a
// public path in proxy.ts for that branch to ever run at all; everyone
// else's path through the site is completely unchanged.
export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/picks')
  }

  // Defensive, isolated — a missing table/row/column just means "landing
  // page off", the exact behaviour this page had before it existed.
  let landingEnabled = false
  try {
    const { data } = await supabase.from('signup_settings').select('landing_page_enabled').eq('id', 'singleton').maybeSingle()
    landingEnabled = data?.landing_page_enabled ?? false
  } catch {}

  if (!landingEnabled) {
    redirect('/login')
  }

  return <LandingPage />
}
