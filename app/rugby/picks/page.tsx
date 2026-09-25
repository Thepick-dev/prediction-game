import { createServerSupabaseClient } from '../../lib/supabase-server'
import { DEFAULT_RUGBY_SCORING_RULES } from '../../lib/rugbyScoring'
import { fetchRugbyPlayerSummaries } from '../../lib/rugbyPlayerDatabase'
import RugbyKitEditor from '../../../components/RugbyKitEditor'
import RugbyPicksForm from './_components/RugbyPicksForm'
import RugbySquadBuilder from './_components/RugbySquadBuilder'
import RugbyCountdownClock from '../../../components/RugbyCountdownClock'
import { redirect } from 'next/navigation'

type Competition = { id: string; name: string; season: string }
type Team = { id: number; name: string }
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
    <div className="rb2-panel rb2-panel--gold p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
      <h1 className="rb2-title" style={{ fontSize: 'clamp(26px, 6vw, 38px)' }}>{text}</h1>
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

  const [{ data: kit }, { data: teams }, { data: rounds }, { data: squadPicks }, { data: rulesRows }, playerSummaries] = await Promise.all([
    supabase.schema('rugby').from('player_kits').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.schema('rugby').from('teams').select('id, name').eq('active', true).order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('season_squad_picks').select('id, player_id, active, is_initial_pick, round_acquired').eq('competition_id', competition.id).eq('user_id', user.id) as unknown as Promise<{ data: SquadPick[] | null }>,
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id),
    fetchRugbyPlayerSummaries(supabase),
  ])

  const teamsList = teams ?? []
  const activeTeamIds = new Set(teamsList.map(t => t.id))
  // The squad builder only ever offers players from currently-active
  // teams — fetchRugbyPlayerSummaries covers the full historical roster
  // (including retired/inactive squads), which matters for the Stats Hub
  // but would let someone draft a player from a team no longer playing.
  const squadPlayers = playerSummaries
    .filter(p => activeTeamIds.has(p.team_id))
    .map(p => ({ id: p.player_id, name: p.player, team: p.team, team_id: p.team_id, group: p.group, value: p.value, value_is_estimated: p.value_is_estimated, average_rating: p.average_rating }))
  const playerById = new Map(playerSummaries.map(p => [p.player_id, p]))

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

  // Nothing below stays hidden just because it's already been answered —
  // every section here can be freely changed until its own deadline
  // (Round 1's for the squad, that round's for match predictions). Only
  // the kit step is a true one-time gate, since it has no deadline of its
  // own and blocks nothing by staying set.
  if (!hasKit) {
    return (
      <div className="rb2-page max-w-2xl mx-auto">
        <RoundHeading text={headingText} deadline={currentRound?.deadline ?? null} />
        <div className="rb2-panel rb2-panel--gold p-5 rugby-theme">
          <h2 className="rb2-eyebrow" style={{ margin: '0 0 12px' }}>Pick Your Kit</h2>
          <RugbyKitEditor userId={user.id} />
        </div>
      </div>
    )
  }

  const showMatchPredictions = !!currentRound
  const showSquadDraft = !round1DeadlinePassed
  const showSquadManager = hasSquad && round1DeadlinePassed

  const activeSquadPlayerIds = squadPicksList.filter(p => p.active).map(p => p.player_id)
  const squadPickCount = activeSquadPlayerIds.filter(id => playerById.has(id)).length

  const nothingToDo = !showMatchPredictions && !showSquadDraft && !showSquadManager

  const matchComplete = !showMatchPredictions || (hasAllCurrentRoundPreds && currentRoundMatchPreds.some(p => p.is_confidence_pick))
  const squadComplete = !showSquadDraft || squadPickCount === 6
  const picksRequired = !nothingToDo && (!matchComplete || !squadComplete)

  return (
    <div className="rb2-page max-w-2xl mx-auto">
      <RoundHeading text={headingText} deadline={currentRound?.deadline ?? null} />

      {picksRequired && (
        <div className="rb2-panel p-3 mb-5 text-center" style={{ background: '#d1293d', borderColor: 'var(--rb2-ink)' }}>
          <p className="font-extrabold uppercase tracking-wide text-sm" style={{ color: '#ffffff', fontFamily: 'var(--font-rugby-cond)' }}>⚠️ Picks required</p>
        </div>
      )}

      {(showMatchPredictions || showSquadDraft) && (
        <div className="mb-6">
          <RugbyPicksForm
            competitionId={competition.id}
            showMatchPredictions={showMatchPredictions}
            roundId={currentRound?.id ?? null}
            roundNumber={currentRound?.number ?? null}
            fixtures={currentRoundFixtures.map(f => ({ id: f.id, homeTeam: teamName(f.home_team_id), awayTeam: teamName(f.away_team_id) }))}
            existingMatchPreds={currentRoundMatchPreds}
            showSquadDraft={showSquadDraft}
            squadPlayers={squadPlayers}
            existingSquadSelections={hasSquad ? activeSquadPlayerIds : undefined}
            squadBudgetCap={squadBudgetCap}
          />
        </div>
      )}

      {showSquadManager && (
        <div className="rb2-panel rb2-panel--gold p-5 mb-6">
          <h2 className="rb2-title mb-4" style={{ fontSize: 'clamp(22px, 5vw, 30px)' }}>Dream Team</h2>
          <RugbySquadBuilder
            mode="manage"
            competitionId={competition.id}
            players={squadPlayers}
            selectedIds={activeSquadPlayerIds}
            squadBudgetCap={squadBudgetCap}
            maxFreeSubs={maxFreeSubs}
            subsUsed={subsUsedCount}
            perRound={subBudgetMode === 'per_round'}
            canSub={!!currentRound}
          />
        </div>
      )}

      {nothingToDo && (
        <div className="rb2-panel p-5">
          <p className="rb2-badge rb2-badge--good px-3 py-1.5">Nothing open to pick right now — check back once the next round is set.</p>
        </div>
      )}

      {!nothingToDo && (
        <p className="text-xs text-center font-bold" style={{ color: 'var(--rb2-text-faint)' }}>
          Change anything above until its deadline.
        </p>
      )}
    </div>
  )
}
