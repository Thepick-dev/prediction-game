import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// Lets an admin set or correct a player's pick for any gameweek, including
// after the deadline has passed — for fixing mistakes, not for normal play.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const { user_id, gameweek_id, competition_id, team_id, player1_id, player2_id, is_banker, question_answer } = await request.json()

  if (!user_id || !gameweek_id || !competition_id || !team_id || !player1_id || !player2_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (player1_id === player2_id) {
    return NextResponse.json({ error: 'Player 1 and Player 2 must be different' }, { status: 400 })
  }

  const { data: existingPick } = await supabase
    .from('picks')
    .select('id')
    .eq('user_id', user_id)
    .eq('gameweek_id', gameweek_id)
    .single()

  let error
  if (existingPick) {
    const { error: updateError } = await supabase
      .from('picks')
      .update({
        team_id, player1_id, player2_id,
        is_banker: !!is_banker,
        is_autopick: false,
        question_answer: question_answer ?? null
      })
      .eq('id', existingPick.id)
    error = updateError
  } else {
    const { error: insertError } = await supabase
      .from('picks')
      .insert({
        user_id, competition_id, gameweek_id, team_id, player1_id, player2_id,
        is_banker: !!is_banker,
        is_autopick: false,
        question_answer: question_answer ?? null
      })
    error = insertError
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
