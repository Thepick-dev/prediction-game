import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { pastDeadlineGameweekIds } from '../../../lib/pastDeadlineGameweeks'
import { NextResponse } from 'next/server'

// The wall_posts view (deliberately) exposes only comments/wall_rating/
// question_answer — no timestamp, no team/player/banker detail — so the
// Wall page has no way to sort pick-comments by actual recency or render
// a picks-grid under each one. This fills both gaps without touching the
// view or trusting anything the client sends: it re-derives "past
// deadline" itself, server-side, from the real gameweeks table — the same
// privacy gate wall_posts and the admin moderation queue already apply,
// just re-checked here independently rather than assumed from the caller.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const competition_id = searchParams.get('competition_id')
  if (!competition_id) {
    return NextResponse.json({ error: 'Missing competition_id' }, { status: 400 })
  }

  const adminClient = createAdminSupabaseClient()
  const pastGwIds = await pastDeadlineGameweekIds(adminClient)
  if (pastGwIds.length === 0) {
    return NextResponse.json({ pickDetails: {} })
  }

  const [{ data: picks }, { data: aonRows }, { data: bonusCardRows }] = await Promise.all([
    adminClient.from('picks').select('id, submitted_at, team_id, player1_id, player2_id, is_banker').eq('competition_id', competition_id).in('gameweek_id', pastGwIds),
    adminClient.from('all_or_nothing_picks').select('pick_id, player_id, outcome').eq('competition_id', competition_id).in('gameweek_id', pastGwIds),
    adminClient.from('bonus_card_plays').select('pick_id, player_id, points').eq('competition_id', competition_id).in('gameweek_id', pastGwIds),
  ])

  const aonByPickId: Record<string, { player_id: number; outcome: string }> = {}
  aonRows?.forEach(a => { aonByPickId[a.pick_id] = { player_id: a.player_id, outcome: a.outcome } })

  const bonusCardByPickId: Record<string, { player_id: number; points: number | null }> = {}
  bonusCardRows?.forEach(b => { bonusCardByPickId[b.pick_id] = { player_id: b.player_id, points: b.points } })

  const pickDetails: Record<string, {
    submitted_at: string | null
    team_id: number
    player1_id: number
    player2_id: number
    is_banker: boolean
    aon: { player_id: number; outcome: string } | null
    bonusCard: { player_id: number; points: number | null } | null
  }> = {}
  picks?.forEach(p => {
    pickDetails[p.id] = {
      submitted_at: p.submitted_at,
      team_id: p.team_id,
      player1_id: p.player1_id,
      player2_id: p.player2_id,
      is_banker: p.is_banker,
      aon: aonByPickId[p.id] ?? null,
      bonusCard: bonusCardByPickId[p.id] ?? null,
    }
  })

  return NextResponse.json({ pickDetails })
}
