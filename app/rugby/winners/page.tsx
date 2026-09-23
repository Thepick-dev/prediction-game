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
      <div className="rugby-hero-wrap">
        <p className="rugby-hero-eyebrow">Hall of Fame</p>
        <h1 className="rugby-hero-title">Winners</h1>
      </div>

      {podiums.length === 0 ? (
        <div className="rugby-panel p-5">
          <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No competitions have finished yet — check back once a tournament wraps up.</p>
        </div>
      ) : (
        podiums.map(({ competition, podium }) => (
          <div key={competition.id} className="rugby-panel rugby-panel--gold p-5 mb-4">
            <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">{competition.name} ({competition.season})</h2>
            {podium.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No entrants.</p>
            ) : (
              <div className="space-y-2">
                {podium.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-lg">{medals[i]}</span>
                    <span className="flex-1 rugby-cond uppercase tracking-wide">{row.name}</span>
                    <span className="rugby-display" style={{ color: 'var(--rugby-floodlight)' }}>{row.points}</span>
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
