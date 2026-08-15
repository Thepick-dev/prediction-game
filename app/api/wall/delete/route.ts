import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

const DELETE_TABLES: Record<string, string> = {
  standalone_comment: 'wall_comments',
  standalone_reply: 'wall_comment_replies',
  reply: 'wall_replies',
}

// Lets an admin remove anything already live on the Wall, not just reject
// something still pending — deleting a standalone comment/reply is a real
// row delete, but a pick's own comment can't be deleted (it's a column on
// a real pick, not its own row), so that case clears the comment fields
// instead of touching the pick itself.
export async function POST(request: Request) {
  const { targetType, targetId } = await request.json()

  if (!targetId) {
    return NextResponse.json({ error: 'Missing target' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const service = createAdminSupabaseClient()

  if (targetType === 'pick_comment') {
    const { error } = await service.from('picks').update({ comments: null, wall_status: null, wall_rating: null }).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  if (!DELETE_TABLES[targetType]) {
    return NextResponse.json({ error: 'Invalid target type' }, { status: 400 })
  }

  const { error } = await service.from(DELETE_TABLES[targetType]).delete().eq('id', targetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
