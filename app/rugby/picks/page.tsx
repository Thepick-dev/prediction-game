import { createServerSupabaseClient } from '../../lib/supabase-server'
import { DEFAULT_RUGBY_SCORING_RULES } from '../../lib/rugbyScoring'
import RugbyKitEditor from '../../../components/RugbyKitEditor'
import RugbyPicksForm from './_components/RugbyPicksForm'
import RugbySquadManager from '../dream-team/_components/RugbySquadManager'
import RugbyCountdownClock from '../../../components/RugbyCountdownClock'
import { redirect } from 'next/navigation'

type Competition = { id: string; name: string; season: string }
type Team = { id: number; name: string }
type Player = { id: number; team_id: number; name: string; value: number | null; value_is_estimated: boolean }
type Round = { id: string; number: number; deadline: string }
type Fixture = { id: number; round_id: string; home_team_id: number; away_team_id: number }
type MatchPred = {
  fixture_id: number
  predicted_winner: 'home' | 'away' | 'draw'
  predicted_margin: number | null
  is_confidence_pick: boolean
  predicted_home_try_bonus: boolean | null
  predicted_away_try_bonus: boolean | null
}
type SquadPick = { id: string; player_id: number; active: boolean; is_initial_pick: boolean; round_acquired: number }

function RoundHeading({ text, deadline }: { text: string; deadline?: string | null }) {
  return (
    <div className="rugby-panel rugby-panel--gold p-3 sm:p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
      <h1 className="rugby-display text-xl sm:text-2xl">{text}</h1>
      {deadline && <RugbyCountdownClock deadline={deadline} />}
    </div>
  )
}

export default async function RugbyPicksPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  // The real "not signed in yet" / "not joined yet" front door is now
  // /rugby itself (a proper welcome + explanation, not a bare line) — this
  // page is the wizard for someone already in, so both of those bounce
  // there instead of showing their own thin message.
  if (!competition || !user) redirect('/rugby')

  const { data: entry } = await supabase.schema('rugby').from('competition_entries').select('id').eq('competition_id', competition.id).eq('user_id', user.id).maybeSingle()
  if (!entry) redirect('/rugby')

  const [{ data: kit }, { data: teams }, { data: playersRaw }, { data: rounds }, { data: squadPicks }, { data: rulesRows }] = await Promise.all([
    supabase.schema('rugby').from('player_kits').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.schema('rugby').from('teams').select('id, name').eq('active', true).order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name').order('name') as unknown as Promise<{ data: Omit<Player, 'value' | 'value_is_estimated'>[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('season_squad_picks').select('id, player_id, active, is_initial_pick, round_acquired').eq('competition_id', competition.id).eq('user_id', user.id) as unknown as Promise<{ data: SquadPick[] | null }>,
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id),
  ])

  // Isolated fetch: value/value_is_estimated are newer, optional columns —
  // a problem reading them (or not run yet) just means every player shows
  // no value and the budget cap check below never bites, not that the
  // whole picks page breaks.
  const valueById = new Map<number, { value: number | null; value_is_estimated: boolean }>()
  try {
    const { data: valueRows } = await supabase.schema('rugby').from('players').select('id, value, value_is_estimated')
    valueRows?.forEach((r: { id: number; value: number | null; value_is_estimated: boolean }) => valueById.set(r.id, { value: r.value, value_is_estimated: r.value_is_estimated }))
  } catch { /* columns not added yet */ }
  const playersList: Player[] = (playersRaw ?? []).map(p => ({ ...p, ...(valueById.get(p.id) ?? { value: null, value_is_estimated: false }) }))

  const teamsList = teams ?? []
  const roundsList = rounds ?? []
  const squadPicksList = squadPicks ?? []
  const maxFreeSubs = rulesRows?.find(r => r.rule_key === 'max_free_subs')?.points ?? DEFAULT_RUGBY_SCORING_RULES.max_free_subs

  const round1 = roundsList.find(r => r.number === 1)
  const round1DeadlinePassed = round1 ? new Date(round1.deadline) < new Date() : false
  const currentRound = roundsList.find(r => new Date(r.deadline) > new Date())
  const headingText = currentRound ? `Round ${currentRound.number}` : competition.name

  // Isolated fetch: 'sub_budget_mode' and 'squad_budget_cap' are newer,
  // optional competitions columns — degrade to 'season' mode / no cap
  // enforced if missing.
  const { data: competitionModeRow } = await supabase.schema('rugby').from('competitions').select('sub_budget_mode, squad_budget_cap').eq('id', competition.id).maybeSingle()
  const subBudgetMode = (competitionModeRow as { sub_budget_mode?: string } | null)?.sub_budget_mode === 'per_round' ? 'per_round' : 'season'
  const squadBudgetCap = (competitionModeRow as { squad_budget_cap?: number | null } | null)?.squad_budget_cap ?? null
  const subsUsedCount = subBudgetMode === 'per_round'
    ? squadPicksList.filter(p => !p.is_initial_pick && currentRound && p.round_acquired === currentRound.number).length
    : squadPicksList.filter(p => !p.is_initial_pick).length

  const { data: allFixtures } = await supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id') as unknown as { data: Fixture[] | null }
  const fixturesList = allFixtures ?? []
  const teamName = (id: number) => teamsList.find(t => t.id === id)?.name ?? '?'

  let currentRoundMatchPreds: MatchPred[] = []
  if (currentRound) {
    const { data } = await supabase.schema('rugby').from('match_predictions')
      .select('fixture_id, predicted_winner, predicted_margin, is_confidence_pick, predicted_home_try_bonus, predicted_away_try_bonus')
      .eq('round_id', currentRound.id).eq('user_id', user.id) as unknown as { data: MatchPred[] | null }
    currentRoundMatchPreds = data ?? []
  }

  const hasKit = !!kit
  const currentRoundFixtures = currentRound ? fixturesList.filter(f => f.round_id === currentRound.id) : []
  const hasAllCurrentRoundPreds = currentRoundFixtures.length > 0 && currentRoundFixtures.every(f => currentRoundMatchPreds.some(p => p.fixture_id === f.id))
  const hasSquad = squadPicksList.length > 0

  const playersByTeam: Record<number, Player[]> = {}
  playersList.forEach(p => { if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = []; playersByTeam[p.team_id].push(p) })

  // Nothing below stays hidden just because it's already been answered —
  // every section here can be freely changed until its own deadline
  // (Round 1's for the squad, that round's for match predictions). Only
  // the kit step is a true one-time gate, since it has no deadline of its
  // own and blocks nothing by staying set.
  if (!hasKit) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <RoundHeading text={headingText} deadline={currentRound?.deadline ?? null} />
        <div className="rugby-panel rugby-panel--gold p-5">
          <h2 className="rugby-cond text-base mb-4 uppercase tracking-wide">Pick Your Kit</h2>
          <RugbyKitEditor userId={user.id} />
        </div>
      </div>
    )
  }

  const showMatchPredictions = !!currentRound
  const showSquadDraft = !round1DeadlinePassed
  const showSquadManager = hasSquad && round1DeadlinePassed

  const squadSelections: Record<number, number[]> = {}
  let squadPickCount = 0
  squadPicksList.filter(p => p.active).forEach(pick => {
    const player = playersList.find(p => p.id === pick.player_id)
    if (player) {
      if (!squadSelections[player.team_id]) squadSelections[player.team_id] = []
      squadSelections[player.team_id].push(pick.player_id)
      squadPickCount++
    }
  })

  const nothingToDo = !showMatchPredictions && !showSquadDraft && !showSquadManager

  const matchComplete = !showMatchPredictions || (hasAllCurrentRoundPreds && currentRoundMatchPreds.some(p => p.is_confidence_pick))
  const squadComplete = !showSquadDraft || squadPickCount === 6
  const picksRequired = !nothingToDo && (!matchComplete || !squadComplete)

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <RoundHeading text={headingText} deadline={currentRound?.deadline ?? null} />

      {picksRequired && (
        <div className="rugby-panel p-3 mb-5 text-center" style={{ borderColor: '#e8574a', boxShadow: '0 0 18px rgba(232,87,74,0.25), 0 14px 30px -16px rgba(0,0,0,0.7)' }}>
          <p className="rugby-cond text-sm uppercase tracking-wide">⚠️ Picks Required — scroll down and complete everything below</p>
        </div>
      )}

      {(showMatchPredictions || showSquadDraft) && (
        <div className="mb-6">
          <RugbyPicksForm
            competitionId={competition.id}
            showSeasonPredictions={false}
            questions={[]}
            teams={teamsList}
            players={playersList}
            fixtureLabels={fixturesList.map(f => ({ id: f.id, label: `Round ${roundsList.find(r => r.id === f.round_id)?.number} — ${teamName(f.home_team_id)} v ${teamName(f.away_team_id)}` }))}
            existingAnswers={[]}
            showMatchPredictions={showMatchPredictions}
            roundId={currentRound?.id ?? null}
            roundNumber={currentRound?.number ?? null}
            fixtures={currentRoundFixtures.map(f => ({ id: f.id, homeTeam: teamName(f.home_team_id), awayTeam: teamName(f.away_team_id) }))}
            existingMatchPreds={currentRoundMatchPreds}
            showSquadDraft={showSquadDraft}
            playersByTeam={playersByTeam}
            existingSquadSelections={hasSquad ? squadSelections : undefined}
            squadBudgetCap={squadBudgetCap}
          />
        </div>
      )}

      {showSquadManager && (
        <div className="rugby-panel rugby-panel--gold p-5 mb-6">
          <h2 className="rugby-cond text-base mb-4 uppercase tracking-wide">Manage Your Dream Team</h2>
          <RugbySquadManager
            competitionId={competition.id}
            slots={squadPicksList.filter(p => p.active).map(pick => {
              const player = playersList.find(p => p.id === pick.player_id)
              const team = player ? teamsList.find(t => t.id === player.team_id) : undefined
              return {
                teamId: team?.id ?? 0, teamName: team?.name ?? '?', playerId: pick.player_id, playerName: player?.name ?? '?',
                value: player?.value ?? null, valueIsEstimated: player?.value_is_estimated ?? false,
              }
            }).sort((a, b) => a.teamName.localeCompare(b.teamName))}
            playersByTeam={playersByTeam}
            subsUsed={subsUsedCount}
            maxFreeSubs={maxFreeSubs}
            perRound={subBudgetMode === 'per_round'}
            canSub={!!currentRound}
            squadBudgetCap={squadBudgetCap}
          />
        </div>
      )}

      {nothingToDo && (
        <div className="rugby-panel p-5">
          <p className="rugby-badge rugby-badge--success px-2.5 py-1">Nothing open to pick right now — check back once the next round is set.</p>
        </div>
      )}

      {!nothingToDo && (
        <p className="text-xs text-center" style={{ color: 'var(--rugby-text-faint)' }}>
          Everything above can be changed as many times as you like until its own deadline.
        </p>
      )}
    </div>
  )
}
