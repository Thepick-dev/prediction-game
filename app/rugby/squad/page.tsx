import { createServerSupabaseClient } from '../../lib/supabase-server'
import { DEFAULT_RUGBY_SCORING_RULES } from '../../lib/rugbyScoring'
import RugbySquadDraftForm from './_components/RugbySquadDraftForm'
import RugbySquadManager from './_components/RugbySquadManager'
import Link from 'next/link'

type Team = { id: number; name: string }
type Player = { id: number; team_id: number; name: string }
type Competition = { id: string; name: string }
type Round = { id: string; number: number; deadline: string }
type SquadPick = { id: string; player_id: number; is_kicker: boolean; active: boolean; is_initial_pick: boolean }

export default async function RugbySquadPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>No active competition yet.</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Please log in.</p>
      </div>
    )
  }

  const { data: entry } = await supabase.schema('rugby').from('competition_entries').select('id').eq('competition_id', competition.id).eq('user_id', user.id).maybeSingle()
  if (!entry) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="pop-panel pop-panel--orange p-5">
          <p className="text-sm" style={{ color: 'var(--pop-white)' }}>
            You need to join {competition.name} before picking your squad.
          </p>
          <Link href="/rugby/picks" className="pop-button pop-button--orange inline-block mt-3">Go join</Link>
        </div>
      </div>
    )
  }

  const [{ data: teams }, { data: players }, { data: rounds }, { data: myPicks }, { data: rulesRows }] = await Promise.all([
    supabase.schema('rugby').from('teams').select('id, name').eq('active', true).order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name').order('name') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('season_squad_picks').select('id, player_id, is_kicker, active, is_initial_pick').eq('competition_id', competition.id).eq('user_id', user.id) as unknown as Promise<{ data: SquadPick[] | null }>,
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id),
  ])

  const teamsList = teams ?? []
  const playersList = players ?? []
  const roundsList = rounds ?? []
  const picksList = myPicks ?? []
  const maxFreeSubs = rulesRows?.find(r => r.rule_key === 'max_free_subs')?.points ?? DEFAULT_RUGBY_SCORING_RULES.max_free_subs

  const playersByTeam: Record<number, Player[]> = {}
  playersList.forEach(p => {
    if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = []
    playersByTeam[p.team_id].push(p)
  })

  const round1 = roundsList.find(r => r.number === 1)
  const round1DeadlinePassed = round1 ? new Date(round1.deadline) < new Date() : false
  const hasSquad = picksList.length > 0
  const activePicks = picksList.filter(p => p.active)
  const subsUsed = picksList.filter(p => !p.is_initial_pick).length
  const canSub = roundsList.some(r => new Date(r.deadline) > new Date())

  const playerById = new Map<number, Player>()
  playersList.forEach(p => playerById.set(p.id, p))
  const teamById = new Map<number, Team>()
  teamsList.forEach(t => teamById.set(t.id, t))

  const slots = activePicks.map(pick => {
    const player = playerById.get(pick.player_id)
    const team = player ? teamById.get(player.team_id) : undefined
    return {
      teamId: team?.id ?? 0,
      teamName: team?.name ?? '?',
      playerId: pick.player_id,
      playerName: player?.name ?? '?',
      isKicker: pick.is_kicker,
    }
  }).sort((a, b) => a.teamName.localeCompare(b.teamName))

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--green text-2xl md:text-3xl mb-4">🏉 Your Squad</h1>

      <div className="pop-panel pop-panel--blue p-5">
        {!hasSquad && !round1DeadlinePassed && (
          <RugbySquadDraftForm competitionId={competition.id} teams={teamsList} playersByTeam={playersByTeam} />
        )}
        {!hasSquad && round1DeadlinePassed && (
          <p className="text-sm" style={{ color: 'var(--pop-red)' }}>
            Round 1&apos;s deadline has passed — squads can no longer be drafted for this competition.
          </p>
        )}
        {hasSquad && (
          <RugbySquadManager
            competitionId={competition.id}
            slots={slots}
            playersByTeam={playersByTeam}
            subsUsed={subsUsed}
            maxFreeSubs={maxFreeSubs}
            canSub={canSub}
          />
        )}
      </div>

      <div className="pop-panel pop-panel--pink p-5 mt-6">
        <h2 className="pop-headline text-base mb-4" style={{ color: 'var(--pop-white)' }}>Browse All Squads</h2>
        {teamsList.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No squads synced yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {teamsList.map(team => (
              <div key={team.id}>
                <h3 className="pop-headline text-xs mb-2" style={{ color: 'var(--pop-pink)' }}>{team.name} ({(playersByTeam[team.id] ?? []).length})</h3>
                <ul className="text-xs space-y-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {(playersByTeam[team.id] ?? []).map(p => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
