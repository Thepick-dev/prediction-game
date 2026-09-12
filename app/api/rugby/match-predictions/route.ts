import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Submitted as one atomic batch (all 3 fixtures + a full confidence
// ranking together) rather than per-fixture, because "confidence must be
// a complete {1,2,3} permutation across the round" is a rule that spans
// multiple rows — a single-row check can't enforce it, so this route
// validates the whole submission in one pass. Goes through the
// service-role client for the same underdog-bonus visibility reason as
// every other prediction route in this feature.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const db = createAdminSupabaseClient()

  const { round_id, predictions } = await request.json()
  if (!round_id || !Array.isArray(predictions) || predictions.length !== 3) {
    return NextResponse.json({ error: 'A round needs a prediction for all 3 matches' }, { status: 400 })
  }

  const confidences = predictions.map((p: { confidence: number }) => p.confidence).sort()
  if (JSON.stringify(confidences) !== JSON.stringify([1, 2, 3])) {
    return NextResponse.json({ error: 'Confidence must be 1, 2, and 3 — used exactly once each' }, { status: 400 })
  }

  const { data: round } = await db.schema('rugby').from('rounds').select('id, deadline').eq('id', round_id).single()
  if (!round) return NextResponse.json({ error: 'Round not found' }, { status: 400 })
  if (new Date() >= new Date(round.deadline)) {
    return NextResponse.json({ error: "This round's deadline has passed" }, { status: 400 })
  }

  const { data: fixtures } = await db.schema('rugby').from('fixtures').select('id').eq('round_id', round_id)
  const validFixtureIds = new Set((fixtures ?? []).map(f => f.id))
  for (const p of predictions) {
    if (!validFixtureIds.has(p.fixture_id)) {
      return NextResponse.json({ error: 'One of those fixtures is not part of this round' }, { status: 400 })
    }
  }

  const rows = predictions.map((p: { fixture_id: number; predicted_home_score: number; predicted_away_score: number; confidence: number }) => ({
    round_id, fixture_id: p.fixture_id, user_id: user.id,
    predicted_home_score: p.predicted_home_score, predicted_away_score: p.predicted_away_score,
    confidence: p.confidence, updated_at: new Date().toISOString(),
  }))

  // Delete-then-insert rather than upsert: re-submitting with a reshuffled
  // confidence ranking can otherwise hit a transient unique-constraint
  // collision mid-statement (e.g. two rows briefly wanting the same
  // confidence value while Postgres applies them one at a time), even
  // though the final result is a valid permutation. Starting clean avoids
  // that entirely.
  const { error: deleteError } = await db.schema('rugby').from('match_predictions').delete().eq('round_id', round_id).eq('user_id', user.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const { error } = await db.schema('rugby').from('match_predictions').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
