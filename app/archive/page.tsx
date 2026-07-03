import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'
import Link from 'next/link'

export default async function ArchivePage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null }

  const { data: pastCompetitions } = await supabase
    .from('competitions')
    .select('id, name, season, start_date, end_date')
    .in('status', ['completed', 'archived'])
    .order('start_date', { ascending: false })

  const { data: honours } = await supabase
    .from('honours')
    .select('season, competition_name, winner, notes')
    .order('sort_order', { ascending: false })

  return (
    <Shell active="ARCHIVE" user={user} displayName={profile?.display_name ?? undefined}>

      <h1 className="text-3xl font-bold mb-8">Archive</h1>

      <div className="max-w-2xl space-y-8">

        <section>
          <h2 className="text-lg font-bold mb-3">Past Competitions</h2>
          {(!pastCompetitions || pastCompetitions.length === 0) ? (
            <div className="bg-white border rounded-lg p-6">
              <p className="text-gray-400 text-sm">No completed competitions yet. The first one is underway.</p>
            </div>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {pastCompetitions.map(comp => (
                <Link
                  key={comp.id}
                  href={`/archive/${comp.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-bold text-sm">{comp.name}</p>
                    <p className="text-xs text-gray-400">{comp.season}</p>
                  </div>
                  <span className="text-sm text-gray-400">Final table →</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">Honours Board</h2>
          <p className="text-xs text-gray-400 mb-3">Winners from before the website era.</p>
          {(!honours || honours.length === 0) ? (
            <div className="bg-white border rounded-lg p-6">
              <p className="text-gray-400 text-sm">No historical winners recorded yet.</p>
            </div>
          ) : (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="py-2 px-4">Season</th>
                    <th className="py-2 px-4">Competition</th>
                    <th className="py-2 px-4">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {honours.map((h, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-4 text-gray-500">{h.season}</td>
                      <td className="py-2 px-4">{h.competition_name}</td>
                      <td className="py-2 px-4 font-bold">🏆 {h.winner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

    </Shell>
  )
}