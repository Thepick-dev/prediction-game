import { createServerSupabaseClient } from '../../lib/supabase-server'
import { DEFAULT_RUGBY_SCORING_RULES } from '../../lib/rugbyScoring'
import RugbyKitEditor from '../../../components/RugbyKitEditor'
import RugbyHero from '../../../components/RugbyHero'
import SeasonPredictionsForm from './_components/SeasonPredictionsForm'
import MatchPredictionsForm from './_components/MatchPredictionsForm'
import RugbySquadDraftForm from '../squad/_components/RugbySquadDraftForm'
import RugbySquadManager from '../squad/_components/RugbySquadManager'
import { redirect } from 'next/navigation'

// Any logged-in user can join themselves — RLS on rugby.competition_entries
// already restricts the insert to `user_id = auth.uid()`.
async function joinRugbyCompetition(formData: FormData) {
  'use server'
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const competitionId = formData.get('competition_id') as string
  await supabase.schema('rugby').from('competition_entries').insert({ competition_id: competitionId, user_id: user.id })
  redirect('/rugby/picks')
}

type Competition = { id: string; name: string; season: string }
type Team = { id: number; name: string }
type Player = { id: number; team_id: number; name: string }
type Round = { id: string; number: number; deadline: string }
type Fixture = { id: number; round_id: string; home_team_id: number; away_team_id: number }
type QuestionType = { type_key: string; label: string; answer_type: string }
type SeasonAnswer = { type_key: string; answer_team_id: number | null; answer_player_id: number | null; answer_numeric: number | null; answer_fixture_id: number | null }
type MatchPred = { fixture_id: number; predicted_home_score: number; predicted_away_score: number; confidence: number }
type SquadPick = { id: string; player_id: number; is_kicker: boolean; active: boolean; is_initial_pick: boolean }

function StepPanel({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="pop-panel pop-panel--orange p-5 mb-6">
      <h2 className="pop-headline text-base mb-4" style={{ color: 'var(--pop-white)' }}>
        <span style={{ color: 'var(--pop-orange)' }}>Step {step}:</span> {title}
      </h2>
      {children}
    </div>
  )
}

export default async function RugbyPicksPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>No active competition yet.</p></div>
  if (!user) return <div className="max-w-2xl mx-auto p-6"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Please log in.</p></div>

  const { data: entry } = await supabase.schema('rugby').from('competition_entries').select('id').eq('competition_id', competition.id).eq('user_id', user.id).maybeSingle()
  if (!entry) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <RugbyHero title={competition.name} subtitle={competition.season} />
        <div className="pop-panel pop-panel--orange p-5 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm" style={{ color: 'var(--pop-white)' }}>You&apos;re not entered in {competition.name} yet.</p>
          <form action={joinRugbyCompetition}>
            <input type="hidden" name="competition_id" value={competition.id} />
            <button type="submit" className="pop-button pop-button--orange">Join</button>
          </form>
        </div>
      </div>
    )
  }

  const [{ data: kit }, { data: teams }, { data: players }, { data: rounds }, { data: questionTypes }, { data: seasonAnswers }, { data: squadPicks }, { data: rulesRows }] = await Promise.all([
    supabase.schema('rugby').from('player_kits').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.schema('rugby').from('teams').select('id, name').eq('active', true).order('name') as unknown as Promise<{ data: Team[] | null }>,
    supabase.schema('rugby').from('players').select('id, team_id, name').order('name') as unknown as Promise<{ data: Player[] | null }>,
    supabase.schema('rugby').from('rounds').select('id, number, deadline').eq('competition_id', competition.id).order('number') as unknown as Promise<{ data: Round[] | null }>,
    supabase.schema('rugby').from('season_prediction_types').select('type_key, label, answer_type').eq('competition_id', competition.id).eq('active', true) as unknown as Promise<{ data: QuestionType[] | null }>,
    supabase.schema('rugby').from('season_predictions').select('type_key, answer_team_id, answer_player_id, answer_numeric, answer_fixture_id').eq('competition_id', competition.id).eq('user_id', user.id) as unknown as Promise<{ data: SeasonAnswer[] | null }>,
    supabase.schema('rugby').from('season_squad_picks').select('id, player_id, is_kicker, active, is_initial_pick').eq('competition_id', competition.id).eq('user_id', user.id) as unknown as Promise<{ data: SquadPick[] | null }>,
    supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id),
  ])

  const teamsList = teams ?? []
  const playersList = players ?? []
  const roundsList = rounds ?? []
  const questionsList = questionTypes ?? []
  const seasonAnswersList = seasonAnswers ?? []
  const squadPicksList = squadPicks ?? []
  const maxFreeSubs = rulesRows?.find(r => r.rule_key === 'max_free_subs')?.points ?? DEFAULT_RUGBY_SCORING_RULES.max_free_subs

  const round1 = roundsList.find(r => r.number === 1)
  const round1DeadlinePassed = round1 ? new Date(round1.deadline) < new Date() : false
  const currentRound = roundsList.find(r => new Date(r.deadline) > new Date())

  const { data: allFixtures } = await supabase.schema('rugby').from('fixtures').select('id, round_id, home_team_id, away_team_id') as unknown as { data: Fixture[] | null }
  const fixturesList = allFixtures ?? []
  const teamName = (id: number) => teamsList.find(t => t.id === id)?.name ?? '?'

  let currentRoundMatchPreds: MatchPred[] = []
  if (currentRound) {
    const { data } = await supabase.schema('rugby').from('match_predictions').select('fixture_id, predicted_home_score, predicted_away_score, confidence').eq('round_id', currentRound.id).eq('user_id', user.id) as unknown as { data: MatchPred[] | null }
    currentRoundMatchPreds = data ?? []
  }

  const hasKit = !!kit
  const hasAllSeasonAnswers = questionsList.length > 0 && questionsList.every(q => seasonAnswersList.some(a => a.type_key === q.type_key))
  const currentRoundFixtures = currentRound ? fixturesList.filter(f => f.round_id === currentRound.id) : []
  const hasAllCurrentRoundPreds = currentRoundFixtures.length > 0 && currentRoundFixtures.every(f => currentRoundMatchPreds.some(p => p.fixture_id === f.id))
  const hasSquad = squadPicksList.length > 0

  const playersByTeam: Record<number, Player[]> = {}
  playersList.forEach(p => { if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = []; playersByTeam[p.team_id].push(p) })

  // Everything still needed, in the confirmed order: kit, tournament
  // predictions, this round's match predictions, squad — all gated at
  // Round 1's deadline for the one-off steps; the round-predictions step
  // repeats every week for whichever round is currently open.
  const steps: { key: string; render: () => React.ReactNode }[] = []

  if (!hasKit) {
    steps.push({ key: 'kit', render: () => (
      <StepPanel step={1} title="Pick Your Kit">
        <RugbyKitEditor userId={user.id} />
        <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>Once you&apos;ve saved a kit, refresh this page to move on.</p>
      </StepPanel>
    ) })
  }

  if (hasKit && !hasAllSeasonAnswers && !round1DeadlinePassed) {
    steps.push({ key: 'season', render: () => (
      <StepPanel step={2} title="Tournament Predictions">
        <SeasonPredictionsForm
          competitionId={competition.id}
          questions={questionsList}
          teams={teamsList}
          players={playersList}
          fixtures={fixturesList.map(f => ({ id: f.id, label: `Round ${roundsList.find(r => r.id === f.round_id)?.number} — ${teamName(f.home_team_id)} v ${teamName(f.away_team_id)}` }))}
          existingAnswers={seasonAnswersList}
        />
      </StepPanel>
    ) })
  }

  if (hasKit && (hasAllSeasonAnswers || round1DeadlinePassed) && currentRound && !hasAllCurrentRoundPreds) {
    steps.push({ key: 'match', render: () => (
      <StepPanel step={3} title={`Round ${currentRound.number} Predictions`}>
        <MatchPredictionsForm
          roundId={currentRound.id}
          roundNumber={currentRound.number}
          fixtures={currentRoundFixtures.map(f => ({ id: f.id, homeTeam: teamName(f.home_team_id), awayTeam: teamName(f.away_team_id) }))}
          existing={currentRoundMatchPreds}
        />
      </StepPanel>
    ) })
  }

  if (hasKit && hasAllCurrentRoundPreds && !hasSquad && !round1DeadlinePassed) {
    steps.push({ key: 'squad', render: () => (
      <StepPanel step={4} title="Pick Your Squad">
        <RugbySquadDraftForm competitionId={competition.id} teams={teamsList} playersByTeam={playersByTeam} />
      </StepPanel>
    ) })
  }

  const allDone = steps.length === 0

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <RugbyHero title={competition.name} subtitle={currentRound ? `Round ${currentRound.number}` : competition.season} />

      {steps.length > 0 ? steps[0].render() : null}

      {allDone && (
        <>
          <div className="pop-panel pop-panel--green p-5 mb-6">
            <p className="pop-badge pop-badge--green">
              {currentRound ? `You're all set for Round ${currentRound.number}` : "You're all set — no more rounds open right now"}
            </p>
          </div>

          {hasSquad && (
            <div className="pop-panel pop-panel--pink p-5">
              <h2 className="pop-headline text-base mb-4" style={{ color: 'var(--pop-white)' }}>Manage Your Squad</h2>
              <RugbySquadManager
                competitionId={competition.id}
                slots={squadPicksList.filter(p => p.active).map(pick => {
                  const player = playersList.find(p => p.id === pick.player_id)
                  const team = player ? teamsList.find(t => t.id === player.team_id) : undefined
                  return { teamId: team?.id ?? 0, teamName: team?.name ?? '?', playerId: pick.player_id, playerName: player?.name ?? '?', isKicker: pick.is_kicker }
                }).sort((a, b) => a.teamName.localeCompare(b.teamName))}
                playersByTeam={playersByTeam}
                subsUsed={squadPicksList.filter(p => !p.is_initial_pick).length}
                maxFreeSubs={maxFreeSubs}
                canSub={!!currentRound}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
