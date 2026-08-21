import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'
import { syncAllOrNothingNomination, syncBonusCardPlay } from '../../picks/route'

// All or Nothing / Bonus Card rows are scoped by RLS to their own owning
// user, so the admin's own regular session can't read another user's row
// (same trap already fixed on the write side below) — this lets the
// client-side edit-pick page fetch them for the whole competition instead.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const adminClient = createAdminSupabaseClient()

  const { searchParams } = new URL(request.url)
  const competition_id = searchParams.get('competition_id')
  if (!competition_id) {
    return NextResponse.json({ error: 'Missing competition_id' }, { status: 400 })
  }

  const [{ data: aonRows }, { data: bonusCardRows }] = await Promise.all([
    adminClient.from('all_or_nothing_picks').select('user_id, gameweek_id, player_id').eq('competition_id', competition_id),
    adminClient.from('bonus_card_plays').select('user_id, gameweek_id, player_id').eq('competition_id', competition_id),
  ])

  return NextResponse.json({ aonRows: aonRows ?? [], bonusCardRows: bonusCardRows ?? [] })
}

// Lets an admin set or correct a player's pick for any gameweek, including
// after the deadline has passed — for fixing mistakes, not for normal play.
// Deliberately skips the normal player-facing route's eligibility checks
// (deadline lock, team/player use caps, AoN exclusions) since overriding
// exactly those is the point of this tool — but still reuses its actual
// All or Nothing / Bonus Card sync logic below, so a manually-set pick
// freezes and records those two the same way a real submission would,
// rather than a second, parallel implementation quietly drifting from it.
//
// The caller's own session only verifies WHO they are (requireAdmin below)
// — every actual read/write past that uses the service-role client. This
// route touches another user's rows throughout (picks, all_or_nothing_picks,
// bonus_card_plays), and RLS scoped to "you can only touch your own row"
// means the admin's own regular session would silently write nothing for
// any of it. Confirmed by testing: with the session-scoped client, the
// picks row saved but the AoN/Bonus Card rows silently never did — no
// error surfaced anywhere, exactly the failure mode that makes this
// class of bug so easy to ship unnoticed.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }
  const adminClient = createAdminSupabaseClient()

  const {
    user_id, gameweek_id, competition_id, team_id, player1_id, player2_id, is_banker, question_answer,
    all_or_nothing_player_id, play_bonus_card,
  } = await request.json()

  if (!user_id || !gameweek_id || !competition_id || !team_id || !player1_id || !player2_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (player1_id === player2_id) {
    return NextResponse.json({ error: 'Player 1 and Player 2 must be different' }, { status: 400 })
  }

  // Fetched unconditionally, same reasoning as the real route — needed
  // both to validate/apply a new nomination or play AND to un-set one.
  const { data: existingAoN } = await adminClient
    .from('all_or_nothing_picks')
    .select('id, gameweek_id, player_id, outcome, pick_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (all_or_nothing_player_id != null) {
    if (all_or_nothing_player_id !== player1_id && all_or_nothing_player_id !== player2_id) {
      return NextResponse.json({ error: 'All or Nothing can only be set on one of the two picks' }, { status: 400 })
    }
    if (existingAoN && existingAoN.gameweek_id !== gameweek_id) {
      return NextResponse.json({ error: 'This player already has an All or Nothing nomination on a different gameweek — clear it there first' }, { status: 400 })
    }
  }

  const { data: existingBonusCardPlay } = await adminClient
    .from('bonus_card_plays')
    .select('id, gameweek_id, fixture_id')
    .eq('competition_id', competition_id)
    .eq('user_id', user_id)
    .maybeSingle()

  let bonusCardPlayerId: number | null = null
  if (play_bonus_card) {
    const { data: comp } = await adminClient
      .from('competitions')
      .select('bonus_card_enabled, bonus_card_player_id')
      .eq('id', competition_id)
      .single()

    if (!comp?.bonus_card_enabled || !comp.bonus_card_player_id) {
      return NextResponse.json({ error: 'The Bonus Card is not currently enabled for this competition' }, { status: 400 })
    }
    if (comp.bonus_card_player_id === player1_id || comp.bonus_card_player_id === player2_id) {
      return NextResponse.json({ error: "The Bonus Card can't be set on a player who's already one of the two picks this gameweek" }, { status: 400 })
    }
    if (existingBonusCardPlay && existingBonusCardPlay.gameweek_id !== gameweek_id) {
      return NextResponse.json({ error: 'The Bonus Card has already been played on a different gameweek — clear it there first' }, { status: 400 })
    }
    bonusCardPlayerId = comp.bonus_card_player_id
  }

  const { data: existingPick } = await adminClient
    .from('picks')
    .select('id')
    .eq('user_id', user_id)
    .eq('gameweek_id', gameweek_id)
    .maybeSingle()

  let error
  let pickId: string | null = existingPick?.id ?? null
  if (existingPick) {
    const { error: updateError } = await adminClient
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
    const { data: inserted, error: insertError } = await adminClient
      .from('picks')
      .insert({
        user_id, competition_id, gameweek_id, team_id, player1_id, player2_id,
        is_banker: !!is_banker,
        is_autopick: false,
        question_answer: question_answer ?? null
      })
      .select('id')
      .single()
    error = insertError
    pickId = inserted?.id ?? null
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (pickId) {
    await syncAllOrNothingNomination(adminClient, {
      existingAoN,
      competition_id,
      user_id,
      gameweek_id,
      pick_id: pickId,
      nominatedPlayerId: all_or_nothing_player_id ?? null,
    })

    await syncBonusCardPlay(adminClient, {
      existingPlay: existingBonusCardPlay,
      competition_id,
      user_id,
      gameweek_id,
      pick_id: pickId,
      playBonusCard: !!play_bonus_card,
      frozenPlayerId: bonusCardPlayerId,
      fixtureId: null,
    })
  }

  return NextResponse.json({ success: true })
}
