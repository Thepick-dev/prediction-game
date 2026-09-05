import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { generateFutzyReply, type FutzyReplyTone } from '../../../lib/futzyReply'
import { NextResponse } from 'next/server'

const VALID_TONES: FutzyReplyTone[] = ['friendly', 'funny', 'aggressive', 'sad']

// Triggered from the real /wall page (an admin-only button there, not from
// /admin/* — so this re-verifies the caller itself, same reasoning as every
// other privileged write on this site: a Server Action/route is reachable
// as its own endpoint regardless of which page's UI hides its button).
//
// Only ever drafts against an ALREADY-APPROVED comment — closes off the
// one real edge case that matters here: a comment that's still pending (or
// gets later rejected) should never end up with a Futzy reply queued
// against it, since that reply would be replying to something that may
// never actually go public.
//
// The draft itself is a completely normal insert into wall_replies /
// wall_comment_replies with Futzy's own profile id as the author - it
// lands in /admin/wall's existing "Pending Replies" queue automatically,
// approved/discarded exactly like any human reply, no new moderation UI.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { targetType, targetId, tone, hint } = await request.json()

  if (targetType !== 'pick' && targetType !== 'comment') {
    return NextResponse.json({ error: 'Invalid target type' }, { status: 400 })
  }
  if (!targetId) {
    return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
  }
  if (!VALID_TONES.includes(tone)) {
    return NextResponse.json({ error: 'Invalid tone' }, { status: 400 })
  }

  const service = createAdminSupabaseClient()

  const { data: futzy } = await service.from('profiles').select('id').eq('is_bot', true).maybeSingle()
  if (!futzy) {
    return NextResponse.json({ error: 'Futzy doesn’t exist yet — create him first from /admin/futzy' }, { status: 400 })
  }

  let originalComment: string | null = null
  if (targetType === 'pick') {
    const { data: pick } = await service.from('picks').select('comments, wall_status').eq('id', targetId).single()
    if (!pick || pick.wall_status !== 'approved' || !pick.comments) {
      return NextResponse.json({ error: 'That comment isn’t approved yet' }, { status: 400 })
    }
    originalComment = pick.comments
  } else {
    const { data: comment } = await service.from('wall_comments').select('content, status').eq('id', targetId).single()
    if (!comment || comment.status !== 'approved') {
      return NextResponse.json({ error: 'That comment isn’t approved yet' }, { status: 400 })
    }
    originalComment = comment.content
  }
  if (!originalComment) {
    return NextResponse.json({ error: 'No comment content found' }, { status: 400 })
  }

  const reply = await generateFutzyReply({ originalComment, tone, hint })
  if (!reply) {
    return NextResponse.json({ error: 'Futzy didn’t have anything to say — try again' }, { status: 502 })
  }

  const { error } = targetType === 'pick'
    ? await service.from('wall_replies').insert({ pick_id: targetId, user_id: futzy.id, content: reply })
    : await service.from('wall_comment_replies').insert({ comment_id: targetId, user_id: futzy.id, content: reply })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, reply })
}
