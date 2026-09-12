import { createServerSupabaseClient } from '../../lib/supabase-server'
import { computeRugbyGrandTotals } from '../../lib/rugbyLeaderboard'

type Competition = { id: string; name: string; season: string }
type Entry = { user_id: string }
type Profile = { id: string; display_name: string }

async function podiumFor(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, competition: Competition) {
  const { data: entries } = await supabase.schema('rugby').from('competition_entries').select('user_id').eq('competition_id', competition.id) as unknown as { data: Entry[] | null }
  const entriesList = entries ?? []
  const userIds = entriesList.map(e => e.user_id)
  if (userIds.length === 0) return []

  const [{ data: profiles }, grandTotals] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as Promise<{ data: Profile[] | null }>,
    computeRugbyGrandTotals(supabase, competition.id, userIds),
  ])
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.display_name]))

  return Array.from(grandTotals.values())
    .map(row => ({ name: nameById.get(row.userId) ?? 'Unknown', points: row.total }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
}

export default async function RugbyWinnersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: completed } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'completed').order('end_date', { ascending: false }) as unknown as { data: Competition[] | null }

  const completedList = completed ?? []
  const podiums = await Promise.all(completedList.map(async c => ({ competition: c, podium: await podiumFor(supabase, c) })))

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--blue text-2xl md:text-3xl mb-4">🏆 Winners</h1>

      {podiums.length === 0 ? (
        <div className="pop-panel pop-panel--blue p-5">
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No competitions have finished yet — check back once a tournament wraps up.</p>
        </div>
      ) : (
        podiums.map(({ competition, podium }) => (
          <div key={competition.id} className="pop-panel pop-panel--blue p-5 mb-4">
            <h2 className="pop-headline text-sm mb-3" style={{ color: 'var(--pop-white)' }}>{competition.name} ({competition.season})</h2>
            {podium.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No entrants.</p>
            ) : (
              <div className="space-y-1.5">
                {podium.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm" style={{ color: 'var(--pop-white)' }}>
                    <span className="text-lg">{medals[i]}</span>
                    <span className="flex-1">{row.name}</span>
                    <span className="pop-headline" style={{ color: 'var(--pop-blue)' }}>{row.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
