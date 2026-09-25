import { createServerSupabaseClient } from '../../lib/supabase-server'
import Link from 'next/link'
import { fetchRugbyPlayerPerformances } from '../../lib/rugbyPlayerDatabase'
import PlayerDatabaseTab from './_components/PlayerDatabaseTab'

type Competition = { id: string; name: string }
type Team = { id: number; name: string }
type Player = { id: number; team_id: number; name: string }
type Round = { id: string; number: number }
type Entry = { user_id: string }
type Profile = { id: string; display_name: string }
type SquadPick = { id: string; user_id: string; player_id: number; active: boolean; round_acquired: number; contrarian_pct_at_pick: number | null }
type SquadPointsRow = { season_squad_pick_id: string; user_id: string; round_id: string; try_points: number; kicking_points: number; red_card_penalty: number; sub_penalty: number; contrarian_bonus: number; total_points: number }
type MatchPointsRow = { user_id: string; round_id: string; fixture_id: number; is_correct: boolean; confidence: number; total_points: number }

const TABS = [
  { key: 'squads', label: 'Dream Teams & Players' },
  { key: 'managers', label: 'Managers' },
  { key: 'trends', label: 'Trends' },
  { key: 'database', label: 'Player Database' },
] as const

export default async function RugbyStatsHubPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams
  const tab = (TABS.find(t => t.key === tabParam)?.key) ?? 'squads'

  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'var(--rugby-text-dim)' }}>No active competition yet.</p></div>
  }

  const [{ data: teams }, { data: players }, { data: rounds }, { data: entries }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('competition_entries').select('user_id').eq('competition_id', competition.id) as unknown as Promise<{ data: Entry[] | null }>,
  ])
  const teamsList = teams ?? []
  const playersList = players ?? []
  const roundsList = rounds ?? []
  const roundIds = roundsList.map(r => r.id)
  const userIds = (entries ?? []).map(e => e.user_id)
  const teamById = new Map(teamsList.map(t => [t.id, t]))
  const playerById = new Map(playersList.map(p => [p.id, p]))

  const [{ data: profiles }, { data: squadPicks }, { data: squadPoints }, { data: matchPoints }] = await Promise.all([
    userIds.length ? supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as Promise<{ data: Profile[] | null }> : Promise.resolve({ data: [] as Profile[] }),
    supabase.schema('rugby').from('season_squad_picks').select('id, user_id, player_id, active, round_acquired, contrarian_pct_at_pick').eq('competition_id', competition.id) as unknown as Promise<{ data: SquadPick[] | null }>,
    roundIds.length ? supabase.schema('rugby').from('season_squad_points').select('season_squad_pick_id, user_id, round_id, try_points, kicking_points, red_card_penalty, sub_penalty, contrarian_bonus, total_points').in('round_id', roundIds) as unknown as Promise<{ data: SquadPointsRow[] | null }> : Promise.resolve({ data: [] as SquadPointsRow[] }),
    roundIds.length ? supabase.schema('rugby').from('match_prediction_points').select('user_id, round_id, fixture_id, is_correct, confidence, total_points').in('round_id', roundIds) as unknown as Promise<{ data: MatchPointsRow[] | null }> : Promise.resolve({ data: [] as MatchPointsRow[] }),
  ])

  const nameById = new Map((profiles ?? []).map(p => [p.id, p.display_name]))
  const squadPicksList = squadPicks ?? []
  const squadPointsList = squadPoints ?? []
  const matchPointsList = matchPoints ?? []
  const pickById = new Map(squadPicksList.map(p => [p.id, p]))

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="rugby-hero-wrap">
        <p className="rugby-hero-eyebrow">{competition.name}</p>
        <h1 className="rugby-hero-title">Stats Hub</h1>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <Link
            key={t.key}
            href={`/rugby/stats?tab=${t.key}`}
            className={tab === t.key ? 'rugby-button text-xs px-3 py-1.5' : 'rugby-button rugby-button--ghost text-xs px-3 py-1.5'}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'squads' && <SquadsTab teamsList={teamsList} playersList={playersList} squadPicksList={squadPicksList} squadPointsList={squadPointsList} playerById={playerById} teamById={teamById} />}
      {tab === 'managers' && <ManagersTab userIds={userIds} nameById={nameById} roundsList={roundsList} squadPointsList={squadPointsList} matchPointsList={matchPointsList} />}
      {tab === 'trends' && <TrendsTab squadPicksList={squadPicksList} squadPointsList={squadPointsList} matchPointsList={matchPointsList} nameById={nameById} playerById={playerById} pickById={pickById} roundsList={roundsList} />}
      {tab === 'database' && <PlayerDatabaseTab rows={await fetchRugbyPlayerPerformances(supabase)} />}
    </div>
  )
}

function SquadsTab({ teamsList, playersList, squadPicksList, squadPointsList, playerById, teamById }: {
  teamsList: Team[]; playersList: Player[]; squadPicksList: SquadPick[]; squadPointsList: SquadPointsRow[]
  playerById: Map<number, Player>; teamById: Map<number, Team>
}) {
  const activePicks = squadPicksList.filter(p => p.active)
  const repByTeam = new Map<number, number>()
  activePicks.forEach(p => {
    const player = playerById.get(p.player_id)
    if (!player) return
    repByTeam.set(player.team_id, (repByTeam.get(player.team_id) ?? 0) + 1)
  })
  const maxRep = Math.max(1, ...Array.from(repByTeam.values()))
  const teamRepRows = teamsList
    .map(t => ({ team: t, count: repByTeam.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)

  const pointsByPlayer = new Map<number, { tries: number; kicking: number }>()
  squadPointsList.forEach(row => {
    const pick = squadPicksList.find(p => p.id === row.season_squad_pick_id)
    if (!pick) return
    const cur = pointsByPlayer.get(pick.player_id) ?? { tries: 0, kicking: 0 }
    cur.tries += row.try_points
    cur.kicking += row.kicking_points
    pointsByPlayer.set(pick.player_id, cur)
  })
  const topPlayers = Array.from(pointsByPlayer.entries())
    .map(([playerId, pts]) => ({ player: playerById.get(playerId), total: pts.tries + pts.kicking, ...pts }))
    .filter(r => r.player)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return (
    <div className="space-y-5">
      <div className="rugby-panel p-5">
        <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Most-Picked Nations</h2>
        {teamRepRows.every(r => r.count === 0) ? (
          <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No squads drafted yet.</p>
        ) : (
          <div className="space-y-2">
            {teamRepRows.map(({ team, count }) => (
              <div key={team.id} className="flex items-center gap-3">
                <span className="text-xs rugby-cond uppercase tracking-wide w-24 shrink-0">{team.name}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--rugby-ink-3)', height: 10 }}>
                  <div style={{ width: `${(count / maxRep) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--rugby-floodlight), var(--rugby-floodlight-2))' }} />
                </div>
                <span className="text-xs w-6 text-right" style={{ color: 'var(--rugby-text-dim)' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rugby-panel rugby-panel--gold p-5">
        <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Top Point-Scoring Players</h2>
        {topPlayers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No points scored yet.</p>
        ) : (
          <div className="space-y-1.5">
            {topPlayers.map((row, i) => (
              <div key={row.player!.id} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: '1px solid var(--rugby-line)' }}>
                <span className="rugby-cond uppercase tracking-wide">{i + 1}. {row.player!.name} <span style={{ color: 'var(--rugby-text-faint)' }}>({teamById.get(row.player!.team_id)?.name ?? '?'})</span></span>
                <span className="text-xs" style={{ color: 'var(--rugby-text-dim)' }}>{row.tries} try · {row.kicking} kick = <strong style={{ color: 'var(--rugby-floodlight)' }}>{row.total}</strong></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ManagersTab({ userIds, nameById, roundsList, squadPointsList, matchPointsList }: {
  userIds: string[]; nameById: Map<string, string>; roundsList: Round[]
  squadPointsList: SquadPointsRow[]; matchPointsList: MatchPointsRow[]
}) {
  const roundTotalByUser = new Map<string, Map<string, number>>()
  function add(userId: string, roundId: string, pts: number) {
    if (!roundTotalByUser.has(userId)) roundTotalByUser.set(userId, new Map())
    const m = roundTotalByUser.get(userId)!
    m.set(roundId, (m.get(roundId) ?? 0) + pts)
  }
  squadPointsList.forEach(r => add(r.user_id, r.round_id, r.total_points))
  matchPointsList.forEach(r => add(r.user_id, r.round_id, r.total_points))

  const rows = userIds.map(userId => {
    const perRound = roundTotalByUser.get(userId) ?? new Map<string, number>()
    const roundScores = roundsList.map(r => perRound.get(r.id)).filter((v): v is number => v != null)
    const grandTotal = Array.from(perRound.values()).reduce((s, v) => s + v, 0)
    return {
      userId,
      name: nameById.get(userId) ?? 'Unknown',
      best: roundScores.length ? Math.max(...roundScores) : null,
      worst: roundScores.length ? Math.min(...roundScores) : null,
      roundsPlayed: roundScores.length,
      grandTotal,
    }
  }).sort((a, b) => b.grandTotal - a.grandTotal)

  return (
    <div className="rugby-panel rugby-panel--gold p-5">
      <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Manager Consistency</h2>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No entrants yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--rugby-line)' }}>
                <th className="rugby-cond text-left py-2 px-1 uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Player</th>
                <th className="rugby-cond text-right py-2 px-1.5 uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Best Round</th>
                <th className="rugby-cond text-right py-2 px-1.5 uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Worst Round</th>
                <th className="rugby-cond text-right py-2 px-1.5 uppercase tracking-wide" style={{ color: 'var(--rugby-text-faint)' }}>Rounds Played</th>
                <th className="rugby-cond text-right py-2 px-1 uppercase tracking-wide" style={{ color: 'var(--rugby-floodlight)' }}>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.userId} style={{ borderBottom: '1px solid var(--rugby-line)' }}>
                  <td className="py-2 px-1 rugby-cond uppercase tracking-wide">{row.name}</td>
                  <td className="text-right py-2 px-1.5" style={{ color: 'var(--rugby-text-dim)' }}>{row.best ?? '—'}</td>
                  <td className="text-right py-2 px-1.5" style={{ color: (row.worst ?? 0) < 0 ? '#e8574a' : 'var(--rugby-text-dim)' }}>{row.worst ?? '—'}</td>
                  <td className="text-right py-2 px-1.5" style={{ color: 'var(--rugby-text-faint)' }}>{row.roundsPlayed}</td>
                  <td className="rugby-display text-right py-2 px-1" style={{ color: row.grandTotal < 0 ? '#e8574a' : 'var(--rugby-floodlight)' }}>{row.grandTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TrendsTab({ squadPicksList, squadPointsList, matchPointsList, nameById, playerById, roundsList }: {
  squadPicksList: SquadPick[]; squadPointsList: SquadPointsRow[]; matchPointsList: MatchPointsRow[]
  nameById: Map<string, string>; playerById: Map<number, Player>; pickById: Map<string, SquadPick>; roundsList: Round[]
}) {
  const roundNumberById = new Map(roundsList.map(r => [r.id, r.number]))
  const totalRedCards = squadPointsList.filter(r => r.red_card_penalty > 0).length
  const totalSubPenalties = squadPointsList.reduce((s, r) => s + (r.sub_penalty > 0 ? 1 : 0), 0)
  const squadContrarianPicks = squadPicksList.filter(p => p.contrarian_pct_at_pick != null && squadPointsList.some(r => r.season_squad_pick_id === p.id && r.contrarian_bonus > 0))

  const worstBlunder = matchPointsList.filter(r => !r.is_correct).sort((a, b) => a.total_points - b.total_points)[0]
  const bestConfidentCall = matchPointsList.filter(r => r.is_correct).sort((a, b) => b.total_points - a.total_points)[0]

  return (
    <div className="space-y-5">
      <div className="rugby-panel p-5">
        <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Discipline &amp; Subs</h2>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="rugby-display text-2xl" style={{ color: '#e8574a' }}>{totalRedCards}</p>
            <p className="text-xs" style={{ color: 'var(--rugby-text-faint)' }}>Red cards suffered</p>
          </div>
          <div>
            <p className="rugby-display text-2xl" style={{ color: 'var(--rugby-floodlight)' }}>{totalSubPenalties}</p>
            <p className="text-xs" style={{ color: 'var(--rugby-text-faint)' }}>Extra subs charged</p>
          </div>
        </div>
      </div>

      <div className="rugby-panel rugby-panel--gold p-5">
        <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Underdog Bonuses</h2>
        {squadContrarianPicks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No underdog bonuses earned yet.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            {squadContrarianPicks.map(p => (
              <p key={p.id}>🎯 {nameById.get(p.user_id) ?? 'Unknown'} — drafted {playerById.get(p.player_id)?.name ?? 'a player'} few others picked</p>
            ))}
          </div>
        )}
      </div>

      <div className="rugby-panel p-5">
        <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Match Prediction Extremes</h2>
        {!worstBlunder && !bestConfidentCall ? (
          <p className="text-sm" style={{ color: 'var(--rugby-text-faint)' }}>No match predictions scored yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {bestConfidentCall && (
              <p>✅ Best call: {nameById.get(bestConfidentCall.user_id) ?? 'Unknown'}, Round {roundNumberById.get(bestConfidentCall.round_id)}, confidence ×{bestConfidentCall.confidence} — <strong style={{ color: 'var(--rugby-floodlight)' }}>+{bestConfidentCall.total_points}</strong></p>
            )}
            {worstBlunder && (
              <p>💥 Biggest blunder: {nameById.get(worstBlunder.user_id) ?? 'Unknown'}, Round {roundNumberById.get(worstBlunder.round_id)}, confidence ×{worstBlunder.confidence} — <strong style={{ color: '#e8574a' }}>{worstBlunder.total_points}</strong></p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
