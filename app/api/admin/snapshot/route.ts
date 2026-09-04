import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// A full, self-contained dump of everything about one competition at this
// exact moment — every table a mistake could plausibly trace back to, not
// just the obvious ones. Deliberately over-inclusive (global reference
// tables like teams/players/profiles too) since the whole point is being
// able to reverse-engineer a problem after the fact, when you don't yet
// know which table was the culprit.
async function buildSnapshot(admin: ReturnType<typeof createAdminSupabaseClient>, competitionId: string) {
  const { data: competition } = await admin.from('competitions').select('*').eq('id', competitionId).single()

  const { data: gameweeks } = await admin.from('gameweeks').select('*').eq('competition_id', competitionId).order('number')
  const gameweekIds = (gameweeks ?? []).map(g => g.id)

  const { data: fixtures } = gameweekIds.length
    ? await admin.from('fixtures').select('*').in('gameweek_id', gameweekIds)
    : { data: [] }
  const fixtureIds = (fixtures ?? []).map(f => f.id)

  const [
    { data: picks },
    { data: points },
    { data: tierDraftPicks },
    { data: draftTierAssignments },
    { data: competitionDraftTiers },
    { data: competitionEntries },
    { data: competitionScoringRules },
    { data: playerScoringRules },
    { data: tierAssignments },
    { data: rivalries },
    { data: allOrNothingPicks },
    { data: bonusCardPlays },
    { data: botPickLog },
    { data: gameweekQuartiles },
    { data: gameweekQuestions },
    { data: matchEvents },
    { data: allOrNothingExclusions },
    { data: teamLeaguePositions },
    { data: teams },
    { data: players },
    { data: profiles },
  ] = await Promise.all([
    admin.from('picks').select('*').eq('competition_id', competitionId),
    admin.from('points').select('*').eq('competition_id', competitionId),
    admin.from('tier_draft_picks').select('*').eq('competition_id', competitionId),
    admin.from('draft_tier_assignments').select('*').eq('competition_id', competitionId),
    admin.from('competition_draft_tiers').select('*').eq('competition_id', competitionId),
    admin.from('competition_entries').select('*').eq('competition_id', competitionId),
    admin.from('competition_scoring_rules').select('*').eq('competition_id', competitionId),
    admin.from('player_scoring_rules').select('*').eq('competition_id', competitionId),
    admin.from('tier_assignments').select('*').eq('competition_id', competitionId),
    admin.from('rivalries').select('*').eq('competition_id', competitionId),
    admin.from('all_or_nothing_picks').select('*').eq('competition_id', competitionId),
    admin.from('bonus_card_plays').select('*').eq('competition_id', competitionId),
    admin.from('bot_pick_log').select('*').eq('competition_id', competitionId),
    gameweekIds.length ? admin.from('gameweek_quartiles').select('*').in('gameweek_id', gameweekIds) : Promise.resolve({ data: [] }),
    gameweekIds.length ? admin.from('gameweek_questions').select('*').in('gameweek_id', gameweekIds) : Promise.resolve({ data: [] }),
    fixtureIds.length ? admin.from('match_events').select('*').in('fixture_id', fixtureIds) : Promise.resolve({ data: [] }),
    // Global reference data, not competition-scoped, but needed to make
    // sense of the above without a second lookup elsewhere.
    admin.from('all_or_nothing_exclusions').select('*'),
    admin.from('team_league_positions').select('*'),
    admin.from('teams').select('*'),
    admin.from('players').select('*'),
    admin.from('profiles').select('*'),
  ])

  // Same hard rule as everywhere else on the site — nobody, admin included,
  // sees what a pick actually was before that gameweek's deadline passes.
  // A debugging snapshot is otherwise deliberately a full raw dump, but
  // this one table needs its actual selections stripped for any gameweek
  // still before its deadline; presence/timing (id, user_id, gameweek_id,
  // submitted_at) stays so "who's picked so far" is still debuggable.
  const pastDeadlineGwIds = new Set((gameweeks ?? []).filter(g => new Date(g.deadline) < new Date()).map(g => g.id))
  const redactedPicks = (picks ?? []).map(p =>
    pastDeadlineGwIds.has(p.gameweek_id)
      ? p
      : { id: p.id, user_id: p.user_id, gameweek_id: p.gameweek_id, submitted_at: p.submitted_at, is_autopick: p.is_autopick, redacted: 'pre-deadline pick content withheld' }
  )

  return {
    snapshot_taken_at: new Date().toISOString(),
    competition,
    gameweeks,
    fixtures,
    picks: redactedPicks,
    points,
    tier_draft_picks: tierDraftPicks,
    draft_tier_assignments: draftTierAssignments,
    competition_draft_tiers: competitionDraftTiers,
    competition_entries: competitionEntries,
    competition_scoring_rules: competitionScoringRules,
    player_scoring_rules: playerScoringRules,
    tier_assignments: tierAssignments,
    rivalries,
    all_or_nothing_picks: allOrNothingPicks,
    bonus_card_plays: bonusCardPlays,
    bot_pick_log: botPickLog,
    gameweek_quartiles: gameweekQuartiles,
    gameweek_questions: gameweekQuestions,
    match_events: matchEvents,
    all_or_nothing_exclusions: allOrNothingExclusions,
    team_league_positions: teamLeaguePositions,
    teams,
    players,
    profiles,
  }
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const adminClient = createAdminSupabaseClient()

  if (id) {
    const { data, error } = await adminClient.from('competition_snapshots').select('*').eq('id', id).single()
    if (error || !data) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    return NextResponse.json({ snapshot: data })
  }

  const { data, error } = await adminClient
    .from('competition_snapshots')
    .select('id, competition_id, created_at, created_by, label')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { competition_id, label } = await request.json()
  if (!competition_id) return NextResponse.json({ error: 'competition_id is required' }, { status: 400 })

  const adminClient = createAdminSupabaseClient()
  const data = await buildSnapshot(adminClient, competition_id)

  const { data: row, error } = await adminClient
    .from('competition_snapshots')
    .insert({ competition_id, created_by: admin.id, label: label || null, data })
    .select('id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, snapshot: row })
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'ids array is required' }, { status: 400 })

  const { error } = await createAdminSupabaseClient().from('competition_snapshots').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
