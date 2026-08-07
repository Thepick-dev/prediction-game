import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
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
    .select('id')
    .eq('status', 'active')
    .single()

  if (!competition) {
    return NextResponse.json({ scoringRules: [], goalPoints: 12, assistPoints: 6, exclusions: [] })
  }

  const [{ data: rules }, { data: playerRules }, { data: exclusions }] = await Promise.all([
    supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competition.id),
    supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competition.id),
    supabase.from('all_or_nothing_exclusions').select('reason, players(name)'),
  ])

  return NextResponse.json({
    scoringRules: rules ?? [],
    goalPoints: playerRules?.find(r => r.event_type === 'goal')?.points ?? 12,
    assistPoints: playerRules?.find(r => r.event_type === 'assist')?.points ?? 6,
    exclusions: (exclusions ?? []).map((e: any) => ({ name: e.players?.name ?? 'Unknown player', reason: e.reason })),
  })
}
