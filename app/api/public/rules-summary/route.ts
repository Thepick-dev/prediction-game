import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../../../lib/players'
import { NextResponse } from 'next/server'

// Public and read-only on purpose — this backs the Rules popup shown on the
// LOGIN page, before anyone has an account, so it can't depend on a session
// or RLS granting anon access. Uses the service-role client to read past
// RLS rather than requiring a policy change, since nothing it returns
// (scoring numbers, exclusion reasons) is remotely sensitive — it's the
// same content any logged-in player already sees on /rules.
export async function GET() {
  const supabase = createAdminSupabaseClient()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, bonus_card_enabled, bonus_card_player_id, bonus_card_name')
    .eq('status', 'active')
    .single()

  if (!competition) {
    return NextResponse.json({ scoringRules: [], goalPoints: 12, assistPoints: 6, exclusions: [], bonusCardEnabled: false, bonusCardName: null, botEnabled: false })
  }

  // Its own isolated request, same reasoning as everywhere else this
  // pattern shows up — bot_enabled is a newer, optional column (Futzy),
  // and a problem reading it should never take the rest of this
  // pre-auth-visible endpoint down with it.
  const { data: botComp } = await supabase.from('competitions').select('bot_enabled').eq('id', competition.id).single()
  const botEnabled = !!botComp?.bot_enabled

  const [{ data: rules }, { data: playerRules }, { data: exclusions }] = await Promise.all([
    supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competition.id),
    supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competition.id),
    supabase.from('all_or_nothing_exclusions').select('reason, players(name)'),
  ])

  // Same reasoning as everywhere else this pattern shows up — its own
  // isolated lookup, only run when there's actually a player nominated, so
  // a problem here can never take the rest of the rules page down with it.
  let bonusCardPlayerName: string | null = null
  if (competition.bonus_card_player_id != null) {
    const { data: player } = await supabase.from('players').select('id, name, web_name, team_id').eq('id', competition.bonus_card_player_id).single()
    if (player) {
      const { data: team } = await supabase.from('teams').select('short_code, short_name, name').eq('id', player.team_id).single()
      bonusCardPlayerName = buildPlayerDisplayNames([player], team ? { [player.team_id]: team } : {})[player.id] ?? null
    }
  }

  return NextResponse.json({
    scoringRules: rules ?? [],
    goalPoints: playerRules?.find(r => r.event_type === 'goal')?.points ?? 12,
    assistPoints: playerRules?.find(r => r.event_type === 'assist')?.points ?? 6,
    exclusions: (exclusions ?? []).map((e: any) => ({ name: e.players?.name ?? 'Unknown player', reason: e.reason })),
    bonusCardEnabled: !!competition.bonus_card_enabled,
    bonusCardName: bonusCardDisplayName(competition.bonus_card_name, bonusCardPlayerName),
    botEnabled,
  })
}
