import { createServerSupabaseClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-black text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-bold text-lg">Admin Panel</span>
          <div className="flex gap-6 text-sm">
            <a href="/admin/draft-tiers" className="hover:text-gray-300">Draft Tiers</a>
            <a href="/admin/users" className="hover:text-gray-300">Users</a>
            <a href="/admin" className="hover:text-gray-300">Dashboard</a>
            <a href="/admin/competitions" className="hover:text-gray-300">Competitions</a>
            <a href="/admin/gameweeks" className="hover:text-gray-300">Gameweeks</a>
            <a href="/admin/fixtures" className="hover:text-gray-300">Fixtures</a>
            <a href="/admin/players" className="hover:text-gray-300">Players</a>
            <a href="/admin/sync" className="hover:text-gray-300">Sync</a>
            <a href="/admin/quartiles" className="hover:text-gray-300">Quartiles</a>
            <a href="/admin/tiers" className="hover:text-gray-300">Tiers</a>
            <a href="/admin/events" className="hover:text-gray-300">Events</a>
            <a href="/admin/scoring" className="hover:text-gray-300">Scoring</a>
            <a href="/admin/postponed" className="hover:text-gray-300">Postponed</a>
            <a href="/admin/dispatch" className="hover:text-gray-300">Dispatch</a>
            <a href="/" className="hover:text-gray-300">← Back to site</a>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}