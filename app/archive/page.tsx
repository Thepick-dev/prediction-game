import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import Link from 'next/link'

export default async function ArchivePage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null }

  const { data: pastCompetitions } = await supabase
    .from('competitions')
    .select('id, name, season, start_date, end_date, manual_winner, manual_winner_note')
    .in('status', ['completed', 'archived'])
    .eq('hidden', false)
    .order('start_date', { ascending: false })

  const { data: honours } = await supabase
    .from('honours')
    .select('season, competition_name, winner, notes')
    .order('sort_order', { ascending: false })

  const cardClass = "bg-white/5 border border-white/10 rounded-lg"

  return (
    <Shell active="TROPHY ROOM" user={user} displayName={profile?.display_name ?? undefined}>
      <HeroPage wide heroOverride="trophy">
        <div className="w-full text-[#F5ECD9]">
          <h1 className="text-3xl font-bold mb-8" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Trophy Room</h1>

          <div className="space-y-8">

            <section>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]" style={{ fontFamily: 'var(--font-heading), serif' }}>Past Competitions</h2>
              {(!pastCompetitions || pastCompetitions.length === 0) ? (
                <div className={cardClass + ' p-6'}>
                  <p className="text-[#F5ECD9]/50 text-sm">No completed competitions yet. The first one is underway.</p>
                </div>
              ) : (
                <div className={cardClass + ' divide-y divide-white/10'}>
                  {pastCompetitions.map(comp => (
                    <Link
                      key={comp.id}
                      href={`/archive/${comp.id}`}
                      className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    >
                      <div>
                        <p className="font-bold text-sm">{comp.name}</p>
                        <p className="text-xs text-[#F5ECD9]/40">{comp.season}</p>
                        {(comp as any).manual_winner && (
                          <p className="text-xs text-[#D9A441] mt-0.5">🏆 {(comp as any).manual_winner}</p>
                        )}
                      </div>
                      <span className="text-sm text-[#F5ECD9]/40">Final table →</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]" style={{ fontFamily: 'var(--font-heading), serif' }}>Honours Board</h2>
              <p className="text-xs text-[#F5ECD9]/40 mb-3">Winners from before the website era.</p>
              {(!honours || honours.length === 0) ? (
                <div className={cardClass + ' p-6'}>
                  <p className="text-[#F5ECD9]/50 text-sm">No historical winners recorded yet.</p>
                </div>
              ) : (
                <div className={cardClass + ' overflow-hidden'}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#F5ECD9]/50 border-b border-white/10" style={{ backgroundColor: '#241a12' }}>
                        <th className="py-2 px-4">Season</th>
                        <th className="py-2 px-4">Competition</th>
                        <th className="py-2 px-4">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {honours.map((h, i) => (
                        <tr key={i} className="border-b border-white/10 last:border-0">
                          <td className="py-2 px-4 text-[#F5ECD9]/50">{h.season}</td>
                          <td className="py-2 px-4">{h.competition_name}</td>
                          <td className="py-2 px-4 font-bold text-[#D9A441]">🏆 {h.winner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        </div>
      </HeroPage>
    </Shell>
  )
}