import { createServerSupabaseClient } from '../../lib/supabase-server'
import RugbyKitPreview from '../../../components/RugbyKitPreview'

type Competition = { id: string; name: string; season: string }
type Entry = { user_id: string }
type Profile = { id: string; display_name: string }
type PointsRow = { user_id: string; total_points: number }
type Kit = { user_id: string; pattern: string; colour1: string; colour2: string; colour3: string | null }

export default async function RugbyLeaderboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>No active competition yet.</p>
      </div>
    )
  }

  const [{ data: entries }, { data: pointsRows }] = await Promise.all([
    supabase.schema('rugby').from('competition_entries').select('user_id').eq('competition_id', competition.id) as unknown as Promise<{ data: Entry[] | null }>,
    supabase.schema('rugby').from('season_squad_points').select('user_id, total_points') as unknown as Promise<{ data: PointsRow[] | null }>,
  ])

  const entriesList = entries ?? []
  const userIds = entriesList.map(e => e.user_id)

  const [{ data: profiles }, { data: kits }] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as Promise<{ data: Profile[] | null }> : Promise.resolve({ data: [] as Profile[] }),
    userIds.length ? supabase.schema('rugby').from('player_kits').select('user_id, pattern, colour1, colour2, colour3').in('user_id', userIds) as unknown as Promise<{ data: Kit[] | null }> : Promise.resolve({ data: [] as Kit[] }),
  ])

  const nameById = new Map<string, string>()
  profiles?.forEach(p => nameById.set(p.id, p.display_name))
  const kitById = new Map<string, Kit>()
  kits?.forEach(k => kitById.set(k.user_id, k))

  const totals = new Map<string, number>()
  entriesList.forEach(e => totals.set(e.user_id, 0))
  ;(pointsRows ?? []).forEach(row => {
    if (totals.has(row.user_id)) totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.total_points)
  })

  const ranked = Array.from(totals.entries())
    .map(([userId, points]) => ({ userId, points, name: nameById.get(userId) ?? 'Unknown' }))
    .sort((a, b) => b.points - a.points)

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--green text-2xl md:text-3xl mb-4">🏆 Leaderboard</h1>
      <div className="pop-panel pop-panel--green p-5">
        {ranked.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No one has joined {competition.name} yet.</p>
        ) : (
          <div className="space-y-2">
            {ranked.map((row, i) => {
              const kit = kitById.get(row.userId)
              return (
                <div key={row.userId} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="pop-headline text-sm w-6 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>{i + 1}</span>
                  {kit ? (
                    <RugbyKitPreview pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2} colour3={kit.colour3} size={32} />
                  ) : (
                    <div style={{ width: 32 }} />
                  )}
                  <span className="text-sm flex-1" style={{ color: 'var(--pop-white)' }}>{row.name}</span>
                  <span
                    className="pop-headline text-sm"
                    style={{ color: row.points < 0 ? 'var(--pop-red)' : 'var(--pop-green)' }}
                  >
                    {row.points}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
