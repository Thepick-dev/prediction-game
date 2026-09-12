import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

type IncomingPrediction = {
  fixture_id: number
  predicted_winner: 'home' | 'away' | 'draw'
  predicted_margin: number | null
  is_confidence_pick: boolean
  predicted_home_try_bonus: boolean
  predicted_away_try_bonus: boolean
}

// Submitted as one atomic batch (all 3 fixtures together) rather than
// per-fixture, because "exactly one confidence pick across the round" is a
// rule that spans multiple rows — a single-row check can't enforce it, so
// this route validates the whole submission in one pass. Also the route
// used to edit an already-answered round: the Picks page always shows this
// form (pre-filled) until the round's deadline passes, so resubmission with
// changed answers must succeed cleanly, not just first-time submission.
// Goes through the service-role client for the same underdog-multiplier
// visibility reason as every other prediction route in this feature.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  const db = createAdminSupabaseClient()

  const { round_id, predictions } = await request.json() as { round_id: string; predictions: IncomingPrediction[] }
  if (!round_id || !Array.isArray(predictions) || predictions.length !== 3) {
    return NextResponse.json({ error: 'A round needs a prediction for all 3 matches' }, { status: 400 })
  }

  const confidenceCount = predictions.filter(p => p.is_confidence_pick).length
  if (confidenceCount !== 1) {
    return NextResponse.json({ error: 'Pick exactly one match as your confidence pick this round' }, { status: 400 })
  }

  for (const p of predictions) {
    if (!['home', 'away', 'draw'].includes(p.predicted_winner)) {
      return NextResponse.json({ error: 'Pick a winner (or draw) for every match' }, { status: 400 })
    }
    if (p.predicted_winner !== 'draw' && (p.predicted_margin == null || p.predicted_margin < 1)) {
      return NextResponse.json({ error: 'Enter a margin of at least 1 point for every match you predict a winner for' }, { status: 400 })
    }
    if (typeof p.predicted_home_try_bonus !== 'boolean' || typeof p.predicted_away_try_bonus !== 'boolean') {
      return NextResponse.json({ error: 'Say yes or no to the try bonus for both teams in every match' }, { status: 400 })
    }
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

  const rows = predictions.map(p => ({
    round_id, fixture_id: p.fixture_id, user_id: user.id,
    predicted_winner: p.predicted_winner,
    predicted_margin: p.predicted_winner === 'draw' ? null : p.predicted_margin,
    is_confidence_pick: p.is_confidence_pick,
    predicted_home_try_bonus: p.predicted_home_try_bonus,
    predicted_away_try_bonus: p.predicted_away_try_bonus,
    updated_at: new Date().toISOString(),
  }))

  // Delete-then-insert rather than upsert: re-submitting with different
  // answers can otherwise hit constraint edge cases mid-statement even
  // though the final result is valid — starting clean avoids that entirely,
  // and this route is now expected to be called repeatedly for the same
  // round (edited right up until the deadline), not just once.
  const { error: deleteError } = await db.schema('rugby').from('match_predictions').delete().eq('round_id', round_id).eq('user_id', user.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const { error } = await db.schema('rugby').from('match_predictions').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
