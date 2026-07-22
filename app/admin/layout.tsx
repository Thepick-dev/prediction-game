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
      <nav className="bg-black text-white px-6 py-3 print:hidden">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-lg uppercase tracking-wider">Admin</span>
            <a href="/" className="text-xs text-gray-400 hover:text-white uppercase tracking-wider">← Back to site</a>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-2 text-xs text-gray-300 pb-1">

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Navigation</p>
              <div className="space-y-1.5">
                <a href="/admin" className="block hover:text-white">Dashboard</a>
                <a href="/admin/summary" className="block hover:text-white">Summary</a>
              </div>
            </div>

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Competition</p>
              <div className="space-y-1.5">
                <a href="/admin/competitions" className="block hover:text-white">Competitions</a>
                <a href="/admin/gameweeks" className="block hover:text-white">Gameweeks</a>
                <a href="/admin/fixtures" className="block hover:text-white">Fixtures</a>
                <a href="/admin/postponed" className="block hover:text-white">Postponed</a>
              </div>
            </div>

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Weekly</p>
              <div className="space-y-1.5">
                <a href="/admin/events" className="block hover:text-white">Events</a>
                <a href="/admin/scoring" className="block hover:text-white">Scoring</a>
                <a href="/admin/picks-log" className="block hover:text-white">Picks Log</a>
                <a href="/admin/print-grid" className="block hover:text-white">Print Grid</a>
                <a href="/admin/edit-pick" className="block hover:text-white">Edit Pick</a>
              </div>
            </div>

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Setup</p>
              <div className="space-y-1.5">
                <a href="/admin/quartiles" className="block hover:text-white">Quartiles</a>
                <a href="/admin/draft-tiers" className="block hover:text-white">Draft Tiers</a>
                <a href="/admin/tiers" className="block hover:text-white">Tiers</a>
                <a href="/admin/standings" className="block hover:text-white">Standings</a>
              </div>
            </div>

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Data</p>
              <div className="space-y-1.5">
                <a href="/admin/sync" className="block hover:text-white">Sync</a>
                <a href="/admin/teams" className="block hover:text-white">Teams</a>
                <a href="/admin/players" className="block hover:text-white">Players</a>
              </div>
            </div>

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Other</p>
              <div className="space-y-1.5">
                <a href="/admin/users" className="block hover:text-white">Users</a>
                <a href="/admin/dispatch" className="block hover:text-white">News</a>
                <a href="/admin/archive" className="block hover:text-white">Archive</a>
              </div>
            </div>

            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Help</p>
              <div className="space-y-1.5">
                <a href="/admin/help/weekly" className="block hover:text-white">Weekly Routine</a>
                <a href="/admin/help/pre-season" className="block hover:text-white">New Season Setup</a>
              </div>
            </div>

          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8 print:max-w-none print:px-0 print:py-0">
        {children}
      </main>
    </div>
  )
}