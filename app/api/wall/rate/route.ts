import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

const TARGET_TABLES: Record<string, string> = {
  comment: 'picks',
  question_answer: 'picks',
  reply: 'wall_replies',
}

// Any logged-in player can rate another player's approved Wall comment,
// question answer, or reply, 1-7 stars — separate from (and in addition
// to) the admin's own curation rating. Ratings are upsert-by-design (one
// row per rater per target, editable), and rating your own content is
// blocked here AND by a database trigger on wall_ratings — the same
// belt-and-braces reasoning as this session's admin Server Action fixes:
// don't rely on only one layer to enforce something that matters.
export async function POST(request: Request) {
  const { targetType, targetId, rating } = await request.json()

  if (!TARGET_TABLES[targetType]) {
    return NextResponse.json({ error: 'Invalid target type' }, { status: 400 })
  }
  if (!targetId || typeof rating !== 'number' || rating < 1 || rating > 7) {
    return NextResponse.json({ error: 'Rating must be between 1 and 7' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { data: target } = await supabase
    .from(TARGET_TABLES[targetType])
    .select('user_id')
    .eq('id', targetId)
    .single()

  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (target.user_id === user.id) {
    return NextResponse.json({ error: "You can't rate your own comment" }, { status: 400 })
  }

  const { error } = await supabase
    .from('wall_ratings')
    .upsert(
      { target_type: targetType, target_id: targetId, rater_user_id: user.id, rating, updated_at: new Date().toISOString() },
      { onConflict: 'target_type,target_id,rater_user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
