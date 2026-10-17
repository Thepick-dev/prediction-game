import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { pastDeadlineGameweekIds } from '../../lib/pastDeadlineGameweeks'
import { redirect } from 'next/navigation'

// Uses the admin/service-role client for every write AND read here (not
// the regular session client): the admin is rating/approving/reviewing
// OTHER users' rows — picks.wall_status/wall_rating, wall_comments.status,
// wall_replies.status, etc. all belong to the commenter, not the admin's
// own session — and RLS on all of these is scoped to "you can see approved
// content, plus your own row regardless of status", exactly the same trap
// that silently broke Futzy's competition_entries insert earlier. That
// means an admin's regular session could only ever see PENDING content
// they wrote themselves — everyone else's pending comments were silently
// invisible to the moderation queue, so there was never a button to click
// for them. Confirmed empirically this session: a freshly-inserted pending
// wall_comment from another user returned zero rows via the admin's own
// regular session, and zero via the regular client on this page.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

// Set once here, checked anytime (unlike the Banker/AoN/Bonus Card
// creation-only mechanics) — this is a moderation-capacity control, not a
// season rule, so admin needs to be able to flip it mid-competition.
async function setWallMode(formData: FormData) {
  'use server'
  const admin = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const mode = formData.get('wall_mode') as string
  const { error } = await admin.from('competitions').update({ wall_mode: mode }).eq('id', competitionId)
  if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
  redirect('/admin/wall')
}

export default async function WallModerationPage({ searchParams }: { searchParams: Promise<{ wallError?: string }> }) {
  const { wallError } = await searchParams
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  const adminClient = createAdminSupabaseClient()

  const { data: activeComp } = await adminClient.from('competitions').select('id, wall_mode').eq('status', 'active').maybeSingle()

  // A pick comment only becomes visible for moderation once its gameweek's
  // deadline has passed — showing it earlier would let admin indirectly
  // see that someone has picked (and often what they said about it)
  // before anyone else can, breaking the same rule that hides picks from
  // every other player. Comments for the still-open gameweek simply wait
  // here as 'pending' until the deadline passes, then appear as normal.
  const pastGwIds = await pastDeadlineGameweekIds(adminClient)
  const { data: pendingPicks } = pastGwIds.length > 0 ? await adminClient
    .from('picks')
    .select('id, user_id, comments, gameweek_id, competition_id')
    .eq('wall_status', 'pending')
    .not('comments', 'is', null)
    .neq('comments', '')
    .in('gameweek_id', pastGwIds) : { data: [] }

  const { data: pendingReplies } = await adminClient
    .from('wall_replies')
    .select('id, pick_id, user_id, content, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // Standalone comments/replies — same shape as picks/wall_replies above,
  // just not tied to a gameweek pick. A missing table (this feature's SQL
  // not run yet) just resolves with data: null here rather than throwing,
  // same as every other optional-column read elsewhere in this codebase.
  const [{ data: pendingComments }, { data: pendingCommentReplies }] = await Promise.all([
    adminClient.from('wall_comments').select('id, user_id, content, created_at').eq('status', 'pending').order('created_at', { ascending: true }),
    adminClient.from('wall_comment_replies').select('id, comment_id, user_id, content, created_at').eq('status', 'pending').order('created_at', { ascending: true }),
  ])

  const userIds = new Set<string>()
  pendingPicks?.forEach(p => userIds.add(p.user_id))
  pendingReplies?.forEach(r => userIds.add(r.user_id))
  pendingComments?.forEach(c => userIds.add(c.user_id))
  pendingCommentReplies?.forEach(r => userIds.add(r.user_id))

  const gwIds = new Set<string>()
  pendingPicks?.forEach(p => gwIds.add(p.gameweek_id))

  const pickIdsForReplies = new Set<string>()
  pendingReplies?.forEach(r => pickIdsForReplies.add(r.pick_id))

  const commentIdsForReplies = new Set<string>()
  pendingCommentReplies?.forEach(r => commentIdsForReplies.add(r.comment_id))

  const [{ data: profiles }, { data: gameweeks }, { data: parentPicks }, { data: parentComments }] = await Promise.all([
    userIds.size ? adminClient.from('profiles').select('id, display_name').in('id', [...userIds]) : Promise.resolve({ data: [] }),
    gwIds.size ? adminClient.from('gameweeks').select('id, number').in('id', [...gwIds]) : Promise.resolve({ data: [] }),
    pickIdsForReplies.size ? adminClient.from('picks').select('id, comments, user_id').in('id', [...pickIdsForReplies]) : Promise.resolve({ data: [] }),
    commentIdsForReplies.size ? adminClient.from('wall_comments').select('id, content, user_id').in('id', [...commentIdsForReplies]) : Promise.resolve({ data: [] }),
  ])

  const nameById: Record<string, string> = {}
  profiles?.forEach(p => { nameById[p.id] = p.display_name ?? 'Unknown' })
  const gwNumberById: Record<string, number> = {}
  gameweeks?.forEach(g => { gwNumberById[g.id] = g.number })
  const parentPickById: Record<string, { comments: string | null; user_id: string }> = {}
  parentPicks?.forEach(p => { parentPickById[p.id] = { comments: p.comments, user_id: p.user_id } })
  const parentCommentById: Record<string, { content: string; user_id: string }> = {}
  parentComments?.forEach(c => { parentCommentById[c.id] = { content: c.content, user_id: c.user_id } })

  async function approveComment(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const pickId = formData.get('pick_id') as string
    const userId = formData.get('user_id') as string
    const rating = Math.max(1, Math.min(7, parseInt(formData.get('rating') as string) || 1))

    const { error } = await admin.from('picks').update({ wall_status: 'approved', wall_rating: rating }).eq('id', pickId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)

    const { data: profile } = await admin.from('profiles').select('wall_rating_total, wall_rating_count').eq('id', userId).single()
    const { error: ratingError } = await admin.from('profiles').update({
      wall_rating_total: (profile?.wall_rating_total ?? 0) + rating,
      wall_rating_count: (profile?.wall_rating_count ?? 0) + 1,
    }).eq('id', userId)
    if (ratingError) redirect(`/admin/wall?wallError=${encodeURIComponent(ratingError.message)}`)

    redirect('/admin/wall')
  }

  async function discardComment(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const pickId = formData.get('pick_id') as string
    const { error } = await admin.from('picks').update({ wall_status: 'discarded' }).eq('id', pickId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  async function approveReply(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const replyId = formData.get('reply_id') as string
    const { error } = await admin.from('wall_replies').update({ status: 'approved' }).eq('id', replyId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  async function discardReply(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const replyId = formData.get('reply_id') as string
    const { error } = await admin.from('wall_replies').update({ status: 'discarded' }).eq('id', replyId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  async function approveStandaloneComment(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const commentId = formData.get('comment_id') as string
    const { error } = await admin.from('wall_comments').update({ status: 'approved' }).eq('id', commentId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  async function discardStandaloneComment(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const commentId = formData.get('comment_id') as string
    const { error } = await admin.from('wall_comments').update({ status: 'discarded' }).eq('id', commentId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  async function approveCommentReply(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const replyId = formData.get('reply_id') as string
    const { error } = await admin.from('wall_comment_replies').update({ status: 'approved' }).eq('id', replyId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  async function discardCommentReply(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const replyId = formData.get('reply_id') as string
    const { error } = await admin.from('wall_comment_replies').update({ status: 'discarded' }).eq('id', replyId)
    if (error) redirect(`/admin/wall?wallError=${encodeURIComponent(error.message)}`)
    redirect('/admin/wall')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">The Wall — Moderation</h1>
      <p className="text-gray-500 text-sm mb-8">
        Nothing appears on the public Wall until approved here. Rate each comment 1-7 stars when you approve it —
        it adds to that player&apos;s running total, which carries over between competitions.
      </p>

      {wallError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-6">
          Couldn&apos;t save: {wallError}
        </p>
      )}

      {activeComp && (
        <div className="bg-white border rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-1">Wall Mode</h2>
          <p className="text-xs text-gray-500 mb-4">
            Controls what every player sees on the public Wall right now. Change this anytime —
            unlike the season-long rules below, this is just about how much moderation load you want.
          </p>
          <form action={setWallMode} className="space-y-2">
            <input type="hidden" name="competition_id" value={activeComp.id} />
            {[
              { value: 'open_auto', label: 'Open — auto-approved', desc: 'Posts show immediately, no review queue. Lowest effort, no safety net.' },
              { value: 'manual_review', label: 'Open — reviewed by you (current default)', desc: "Exactly what you have today — nothing shows until approved below." },
              { value: 'read_only', label: 'Read-only', desc: 'Existing content stays visible. Nobody but admin can post anything new.' },
              { value: 'hidden', label: 'Fully hidden', desc: "The Wall disappears from the site entirely for everyone but admin. Nothing is deleted." },
            ].map(opt => (
              <label key={opt.value} className="flex items-start gap-2 text-sm">
                <input type="radio" name="wall_mode" value={opt.value} defaultChecked={(activeComp.wall_mode ?? 'manual_review') === opt.value} className="mt-1" />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-xs text-gray-500">{opt.desc}</span>
                </span>
              </label>
            ))}
            <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm mt-2">Save</button>
          </form>
          <p className="text-xs text-gray-400 mt-3">
            Note on &quot;Open — auto-approved&quot;: this relies on a database rule I haven&apos;t been able to
            inspect directly. If you try it and posts still land in the review queue below instead of
            showing immediately, tell me and I&apos;ll look at adjusting that rule.
          </p>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Pending Comments ({pendingPicks?.length ?? 0})</h2>
        {(!pendingPicks || pendingPicks.length === 0) ? (
          <p className="text-sm text-gray-400">Nothing waiting for review.</p>
        ) : (
          <div className="divide-y">
            {pendingPicks.map(p => (
              <div key={p.id} className="py-4 first:pt-0 last:pb-0">
                <p className="text-xs text-gray-500 mb-1">{nameById[p.user_id] ?? 'Unknown'} · GW{gwNumberById[p.gameweek_id] ?? '?'}</p>
                <p className="text-sm mb-3">&quot;{p.comments}&quot;</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <form action={approveComment} className="flex items-center gap-2">
                    <input type="hidden" name="pick_id" value={p.id} />
                    <input type="hidden" name="user_id" value={p.user_id} />
                    <label className="text-xs text-gray-500">Rating:</label>
                    <select name="rating" defaultValue="4" className="border rounded px-2 py-1 text-sm">
                      {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} {'⭐'.repeat(n)}</option>)}
                    </select>
                    <button type="submit" className="bg-green-600 text-white text-xs rounded px-3 py-1.5">✓ Approve</button>
                  </form>
                  <form action={discardComment}>
                    <input type="hidden" name="pick_id" value={p.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">Discard</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Pending Replies ({pendingReplies?.length ?? 0})</h2>
        {(!pendingReplies || pendingReplies.length === 0) ? (
          <p className="text-sm text-gray-400">Nothing waiting for review.</p>
        ) : (
          <div className="divide-y">
            {pendingReplies.map(r => (
              <div key={r.id} className="py-4 first:pt-0 last:pb-0">
                <p className="text-xs text-gray-500 mb-1">
                  {nameById[r.user_id] ?? 'Unknown'} replying to {nameById[parentPickById[r.pick_id]?.user_id] ?? 'Unknown'}
                  {parentPickById[r.pick_id]?.comments ? ` — "${parentPickById[r.pick_id]?.comments}"` : ''}
                </p>
                <p className="text-sm mb-3">&quot;{r.content}&quot;</p>
                <div className="flex items-center gap-3">
                  <form action={approveReply}>
                    <input type="hidden" name="reply_id" value={r.id} />
                    <button type="submit" className="bg-green-600 text-white text-xs rounded px-3 py-1.5">✓ Approve</button>
                  </form>
                  <form action={discardReply}>
                    <input type="hidden" name="reply_id" value={r.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">Discard</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Pending Comments — Written Directly ({pendingComments?.length ?? 0})</h2>
        <p className="text-xs text-gray-500 mb-4">Standalone comments posted from the box at the top of the Wall — not tied to any gameweek pick.</p>
        {(!pendingComments || pendingComments.length === 0) ? (
          <p className="text-sm text-gray-400">Nothing waiting for review.</p>
        ) : (
          <div className="divide-y">
            {pendingComments.map(c => (
              <div key={c.id} className="py-4 first:pt-0 last:pb-0">
                <p className="text-xs text-gray-500 mb-1">{nameById[c.user_id] ?? 'Unknown'}</p>
                <p className="text-sm mb-3">&quot;{c.content}&quot;</p>
                <div className="flex items-center gap-3">
                  <form action={approveStandaloneComment}>
                    <input type="hidden" name="comment_id" value={c.id} />
                    <button type="submit" className="bg-green-600 text-white text-xs rounded px-3 py-1.5">✓ Approve</button>
                  </form>
                  <form action={discardStandaloneComment}>
                    <input type="hidden" name="comment_id" value={c.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">Discard</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Pending Replies — to Written Comments ({pendingCommentReplies?.length ?? 0})</h2>
        {(!pendingCommentReplies || pendingCommentReplies.length === 0) ? (
          <p className="text-sm text-gray-400">Nothing waiting for review.</p>
        ) : (
          <div className="divide-y">
            {pendingCommentReplies.map(r => (
              <div key={r.id} className="py-4 first:pt-0 last:pb-0">
                <p className="text-xs text-gray-500 mb-1">
                  {nameById[r.user_id] ?? 'Unknown'} replying to {nameById[parentCommentById[r.comment_id]?.user_id] ?? 'Unknown'}
                  {parentCommentById[r.comment_id]?.content ? ` — "${parentCommentById[r.comment_id]?.content}"` : ''}
                </p>
                <p className="text-sm mb-3">&quot;{r.content}&quot;</p>
                <div className="flex items-center gap-3">
                  <form action={approveCommentReply}>
                    <input type="hidden" name="reply_id" value={r.id} />
                    <button type="submit" className="bg-green-600 text-white text-xs rounded px-3 py-1.5">✓ Approve</button>
                  </form>
                  <form action={discardCommentReply}>
                    <input type="hidden" name="reply_id" value={r.id} />
                    <button type="submit" className="text-xs text-red-500 hover:text-red-700">Discard</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
