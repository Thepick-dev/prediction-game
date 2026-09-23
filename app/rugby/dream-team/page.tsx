import { createServerSupabaseClient } from '../../lib/supabase-server'
import { rugbyTeamColours } from '../../lib/rugbyTeamColours'
import DreamTeamUserSelector from './_components/DreamTeamUserSelector'
import BrowseAllPlayers from './_components/BrowseAllPlayers'
import Link from 'next/link'

type Team = { id: number; name: string }
type Player = { id: number; team_id: number; name: string }
type Competition = { id: string; name: string }
type Round = { id: string; number: number; deadline: string }
type Entry = { user_id: string }
type Profile = { id: string; display_name: string }
type SquadPick = {
  id: string; player_id: number; is_kicker: boolean; active: boolean
  round_acquired: number; round_removed: number | null
}
type PointsRow = { season_squad_pick_id: string; round_id: string; total_points: number }

export default async function RugbyDreamTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>
}) {
  const { user: userParam } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'var(--rugby-text-dim)' }}>No active competition yet.</p></div>
  }
  if (!user) {
    return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'var(--rugby-text-dim)' }}>Please log in.</p></div>
  }

  const { data: entry } = await supabase.schema('rugby').from('competition_entries').select('id').eq('competition_id', competition.id).eq('user_id', user.id).maybeSingle()
  if (!entry) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rugby-panel rugby-panel--gold p-5">
          <p className="text-sm">
            You need to join {competition.name} before you can see any Dream Teams.
          </p>
          <Link href="/rugby/picks" className="rugby-button inline-block mt-3 px-5 py-2">Go join</Link>
        </div>
      </div>
    )
  }

  const [{ data: teams }, { data: players }, { data: rounds }, { data: entries }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name').eq('active', true).order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name').order('name') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('competition_entries').select('user_id').eq('competition_id', competition.id) as unknown as Promise<{ data: Entry[] | null }>,
  ])

  const teamsList = teams ?? []
  const playersList = players ?? []
  const roundsList = rounds ?? []
  const entriesList = entries ?? []

  const playersByTeam: Record<number, Player[]> = {}
  playersList.forEach(p => {
    if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = []
    playersByTeam[p.team_id].push(p)
  })
  const playerById = new Map(playersList.map(p => [p.id, p]))
  const teamById = new Map(teamsList.map(t => [t.id, t]))
  const roundNumberById = new Map(roundsList.map(r => [r.id, r.number]))

  const round1 = roundsList.find(r => r.number === 1)
  const round1DeadlinePassed = round1 ? new Date(round1.deadline) < new Date() : false

  // Same hard privacy rule as every other pick on this site: another
  // user's Dream Team is only browsable once Round 1's deadline has
  // passed — before that, drafting a squad is itself still a hidden
  // pick, so you can only ever see your own.
  const requestedUserId = userParam && round1DeadlinePassed ? userParam : user.id
  const isOwnTeam = requestedUserId === user.id

  const { data: userIds } = { data: entriesList.map(e => e.user_id) }
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds) as unknown as { data: Profile[] | null }
    : { data: [] as Profile[] }
  const nameById = new Map((profiles ?? []).map(p => [p.id, p.display_name]))
  const entrants = entriesList
    .map(e => ({ userId: e.user_id, name: e.user_id === user.id ? `${nameById.get(e.user_id) ?? 'Unknown'} (you)` : (nameById.get(e.user_id) ?? 'Unknown') }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: picks } = await supabase.schema('rugby').from('season_squad_picks')
    .select('id, player_id, is_kicker, active, round_acquired, round_removed')
    .eq('competition_id', competition.id).eq('user_id', requestedUserId) as unknown as { data: SquadPick[] | null }
  const picksList = picks ?? []

  const pickIds = picksList.map(p => p.id)
  const { data: pointsRows } = pickIds.length
    ? await supabase.schema('rugby').from('season_squad_points').select('season_squad_pick_id, round_id, total_points').in('season_squad_pick_id', pickIds) as unknown as { data: PointsRow[] | null }
    : { data: [] as PointsRow[] }
  const pointsByPick = new Map<string, { roundNumber: number; points: number }[]>()
  ;(pointsRows ?? []).forEach(r => {
    const roundNumber = roundNumberById.get(r.round_id)
    if (roundNumber == null) return
    if (!pointsByPick.has(r.season_squad_pick_id)) pointsByPick.set(r.season_squad_pick_id, [])
    pointsByPick.get(r.season_squad_pick_id)!.push({ roundNumber, points: r.total_points })
  })

  function buildCard(pick: SquadPick) {
    const player = playerById.get(pick.player_id)
    const team = player ? teamById.get(player.team_id) : undefined
    const rounds = (pointsByPick.get(pick.id) ?? []).sort((a, b) => a.roundNumber - b.roundNumber)
    const total = rounds.reduce((s, r) => s + r.points, 0)
    return {
      pickId: pick.id,
      playerName: player?.name ?? '?',
      teamName: team?.name ?? '?',
      isKicker: pick.is_kicker,
      roundAcquired: pick.round_acquired,
      roundRemoved: pick.round_removed,
      rounds,
      total,
    }
  }

  const activeCards = picksList.filter(p => p.active).map(buildCard).sort((a, b) => a.teamName.localeCompare(b.teamName))
  const subbedOutCards = picksList.filter(p => !p.active).map(buildCard).sort((a, b) => a.roundRemoved! - b.roundRemoved!)

  function PlayerCard({ card, dimmed }: { card: ReturnType<typeof buildCard>; dimmed: boolean }) {
    const colours = rugbyTeamColours(card.teamName)
    return (
      <div
        className="rounded-xl p-4"
        style={{
          background: dimmed ? 'rgba(255,255,255,0.03)' : colours.fill,
          border: `2px solid ${dimmed ? 'rgba(255,255,255,0.12)' : colours.fill}`,
          opacity: dimmed ? 0.75 : 1,
        }}
      >
        <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
          <p className="rugby-cond text-lg uppercase tracking-wide" style={{ color: dimmed ? 'var(--rugby-text-dim)' : colours.text }}>
            {card.playerName}
            {card.isKicker && <span className="rugby-badge rugby-badge--gold ml-2 align-middle" style={{ fontSize: '10px', padding: '2px 8px' }}>KICKER</span>}
          </p>
          {dimmed && <span className="rugby-badge rugby-badge--error text-[10px]">SUBBED OUT</span>}
        </div>
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: dimmed ? 'var(--rugby-text-faint)' : `${colours.text}cc` }}>
          {card.teamName} {dimmed ? `· Rounds ${card.roundAcquired}–${(card.roundRemoved ?? card.roundAcquired) - 1}` : `· Since Round ${card.roundAcquired}`}
        </p>
        {card.rounds.length === 0 ? (
          <p className="text-xs" style={{ color: dimmed ? 'var(--rugby-text-faint)' : `${colours.text}99` }}>No rounds scored yet.</p>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            {card.rounds.map(r => (
              <span
                key={r.roundNumber}
                className="text-xs font-bold px-2 py-1 rounded"
                style={{ background: dimmed ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.18)', color: dimmed ? 'rgba(255,255,255,0.7)' : colours.text }}
              >
                R{r.roundNumber}: {r.points}{card.isKicker && <sup>K</sup>}
              </span>
            ))}
            <span
              className="text-xs font-black px-2 py-1 rounded ml-1"
              style={{ background: dimmed ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.3)', color: dimmed ? 'rgba(255,255,255,0.85)' : colours.text }}
            >
              TOTAL: {card.total}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <div className="rugby-hero-wrap" style={{ padding: '0 0 6px' }}>
          <h1 className="rugby-hero-title" style={{ fontSize: 'clamp(30px, 6vw, 44px)' }}>Dream Team</h1>
        </div>
        {round1DeadlinePassed ? (
          <DreamTeamUserSelector entrants={entrants} selectedUserId={requestedUserId} />
        ) : (
          <span className="text-xs" style={{ color: 'var(--rugby-text-faint)' }}>Other Dream Teams appear once Round 1 starts</span>
        )}
      </div>

      {!isOwnTeam && (
        <p className="text-sm mb-4 rugby-cond uppercase tracking-wide" style={{ color: 'var(--rugby-floodlight)' }}>
          Viewing {nameById.get(requestedUserId) ?? 'Unknown'}&apos;s Dream Team
        </p>
      )}

      {activeCards.length === 0 && subbedOutCards.length === 0 ? (
        <div className="rugby-panel rugby-panel--gold p-5">
          <p className="text-sm">
            {isOwnTeam ? <>No Dream Team drafted yet — head to <Link href="/rugby/picks" className="underline">Picks</Link> to build yours.</> : 'No Dream Team drafted yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {activeCards.map(card => <PlayerCard key={card.pickId} card={card} dimmed={false} />)}
          </div>

          {subbedOutCards.length > 0 && (
            <div className="mt-6">
              <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide" style={{ color: 'var(--rugby-text-dim)' }}>Subbed Out</h2>
              <div className="space-y-3">
                {subbedOutCards.map(card => <PlayerCard key={card.pickId} card={card} dimmed={true} />)}
              </div>
            </div>
          )}
        </>
      )}

      <BrowseAllPlayers teams={teamsList} playersByTeam={playersByTeam} />
    </div>
  )
}
