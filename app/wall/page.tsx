'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import StarRating from '../../components/StarRating'

type Post = {
  pick_id: string
  user_id: string
  gameweek_id: string
  comments: string | null
  wall_rating: number | null
  question_answer: string | null
}
type Reply = { id: string; pick_id: string; user_id: string; content: string; created_at: string }
type StandaloneComment = { id: string; user_id: string; content: string; status: string; created_at: string }
type CommentReply = { id: string; comment_id: string; user_id: string; content: string; status: string; created_at: string }
type TargetRating = { average: number; count: number; yours: number | null }
type Question = {
  gameweek_id: string
  question: string
  question_type: 'multiple_choice' | 'freetext' | null
  option_a: string
  option_b: string
  option_c: string | null
  option_d: string | null
}

function answerLabel(q: Question | undefined, answer: string | null): string | null {
  if (!q || !answer) return null
  if (q.question_type === 'freetext') return answer
  const options: Record<string, string | null> = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }
  return options[answer] ?? null
}

export default function WallPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [standaloneComments, setStandaloneComments] = useState<StandaloneComment[]>([])
  const [commentRepliesByComment, setCommentRepliesByComment] = useState<Record<string, CommentReply[]>>({})
  const [repliesByPick, setRepliesByPick] = useState<Record<string, Reply[]>>({})
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({})
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null }>>({})
  const [starsEarthsByUser, setStarsEarthsByUser] = useState<Record<string, { stars: number; earths: number }>>({})
  const [botByUser, setBotByUser] = useState<Record<string, boolean>>({})
  const [ratingByUser, setRatingByUser] = useState<Record<string, { total: number; count: number }>>({})
  const [ratingsByTarget, setRatingsByTarget] = useState<Record<string, TargetRating>>({})
  const [gwNumberById, setGwNumberById] = useState<Record<string, number>>({})
  const [questionByGw, setQuestionByGw] = useState<Record<string, Question>>({})
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [sentReply, setSentReply] = useState<Record<string, boolean>>({})
  const [newCommentDraft, setNewCommentDraft] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [commentReplyDraft, setCommentReplyDraft] = useState<Record<string, string>>({})
  const [sentCommentReply, setSentCommentReply] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
    setDisplayName(profile?.display_name ?? '')

    const { data: comp } = await supabase.from('competitions').select('id, name').eq('status', 'active').single()
    setCompetition(comp)
    if (!comp) { setLoading(false); return }

    // wall_posts is a narrow public-safe view — only approved comment text
    // (never an unapproved one) and, independent of that, anyone's weekly
    // question answer once its gameweek's deadline has passed — never the
    // actual team/player picks themselves. See the view definition for why
    // that split matters.
    const { data: wallPosts } = await supabase
      .from('wall_posts')
      .select('pick_id, user_id, gameweek_id, comments, wall_rating, question_answer')
      .eq('competition_id', comp.id)

    const list = (wallPosts ?? []) as Post[]

    const { data: gameweeks } = await supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id)
    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })
    setGwNumberById(gwMap)

    list.sort((a, b) => (gwMap[b.gameweek_id] ?? 0) - (gwMap[a.gameweek_id] ?? 0))
    setPosts(list)

    const gwIds = [...new Set(list.map(p => p.gameweek_id))]
    if (gwIds.length > 0) {
      const { data: questions } = await supabase.from('gameweek_questions').select('gameweek_id, question, question_type, option_a, option_b, option_c, option_d').in('gameweek_id', gwIds)
      const qMap: Record<string, Question> = {}
      questions?.forEach(q => { qMap[q.gameweek_id] = q })
      setQuestionByGw(qMap)
    }

    // Standalone comments — not tied to any gameweek pick, so people can
    // use the Wall to chat even before a competition's first gameweek has
    // opened. RLS returns every approved comment plus the caller's own
    // regardless of status, so a freshly-submitted comment shows up for
    // its author immediately (tagged "Awaiting approval") rather than
    // vanishing into the queue with no feedback.
    const { data: comments } = await supabase
      .from('wall_comments')
      .select('id, user_id, content, status, created_at')
      .order('created_at', { ascending: false })
    const commentList = comments ?? []
    setStandaloneComments(commentList)

    const commentIds = commentList.map(c => c.id)
    let commentReplies: CommentReply[] = []
    if (commentIds.length > 0) {
      const { data: cReplies } = await supabase
        .from('wall_comment_replies')
        .select('id, comment_id, user_id, content, status, created_at')
        .in('comment_id', commentIds)
        .order('created_at', { ascending: true })
      commentReplies = cReplies ?? []
    }
    const byComment: Record<string, CommentReply[]> = {}
    commentReplies.forEach(r => { (byComment[r.comment_id] ??= []).push(r) })
    setCommentRepliesByComment(byComment)

    const pickIds = list.map(p => p.pick_id)
    let replies: Reply[] = []
    if (pickIds.length > 0) {
      const { data: r } = await supabase
        .from('wall_replies')
        .select('id, pick_id, user_id, content, created_at')
        .in('pick_id', pickIds)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
      replies = r ?? []
    }
    const byPick: Record<string, Reply[]> = {}
    replies.forEach(r => { (byPick[r.pick_id] ??= []).push(r) })
    setRepliesByPick(byPick)

    // Player-given ratings (separate from the admin's own curation
    // rating above) — one row per rater per target, targets being either
    // a comment/question-answer (both keyed off picks.id) or a reply.
    const replyIds = replies.map(r => r.id)
    const ratingTargetIds = [...pickIds, ...replyIds]
    const { data: allRatings } = ratingTargetIds.length > 0
      ? await supabase.from('wall_ratings').select('target_type, target_id, rater_user_id, rating').in('target_id', ratingTargetIds)
      : { data: [] as any[] }

    const ratingsMap: Record<string, TargetRating> = {}
    allRatings?.forEach(r => {
      const key = `${r.target_type}:${r.target_id}`
      const existing = ratingsMap[key] ?? { average: 0, count: 0, yours: null }
      const newTotal = existing.average * existing.count + r.rating
      existing.count += 1
      existing.average = newTotal / existing.count
      if (r.rater_user_id === authUser.id) existing.yours = r.rating
      ratingsMap[key] = existing
    })
    setRatingsByTarget(ratingsMap)

    const userIds = new Set<string>()
    list.forEach(p => userIds.add(p.user_id))
    replies.forEach(r => userIds.add(r.user_id))
    commentList.forEach(c => userIds.add(c.user_id))
    commentReplies.forEach(r => userIds.add(r.user_id))

    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2, wall_rating_total, wall_rating_count')
        .in('id', [...userIds])

      const nameMap: Record<string, string> = {}
      const kitMap: Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null }> = {}
      const ratingMap: Record<string, { total: number; count: number }> = {}
      profiles?.forEach(p => {
        nameMap[p.id] = p.display_name ?? 'Unknown'
        kitMap[p.id] = { pattern: p.kit_pattern ?? 'solid', colour1: p.kit_colour_1 ?? '#1E4D6B', colour2: p.kit_colour_2 ?? '#F5ECD9', colour3: null }
        ratingMap[p.id] = { total: p.wall_rating_total ?? 0, count: p.wall_rating_count ?? 0 }
      })

      // Its own isolated request, same reasoning as everywhere else this
      // pattern shows up — kit_colour_3 is a newer, optional column.
      const { data: kitTrims } = await supabase.from('profiles').select('id, kit_colour_3').in('id', [...userIds])
      kitTrims?.forEach(k => { if (kitMap[k.id]) kitMap[k.id].colour3 = k.kit_colour_3 ?? null })

      // Its own isolated requests, same reasoning — kit_stars/kit_earths and
      // is_bot are newer, optional columns, and a problem reading either
      // should never take the rest of the Wall down with it. Kit and its
      // stars/earths get shown prominently here (unlike the Leaderboard's
      // subtle by-the-name treatment) — this is the one place the site
      // explicitly wants them to stand out.
      const { data: starsEarths } = await supabase.from('profiles').select('id, kit_stars, kit_earths').in('id', [...userIds])
      const starsEarthsMap: Record<string, { stars: number; earths: number }> = {}
      starsEarths?.forEach(s => { starsEarthsMap[s.id] = { stars: s.kit_stars ?? 0, earths: s.kit_earths ?? 0 } })
      setStarsEarthsByUser(starsEarthsMap)

      const { data: botFlags } = await supabase.from('profiles').select('id, is_bot').in('id', [...userIds])
      const botMap: Record<string, boolean> = {}
      botFlags?.forEach(b => { botMap[b.id] = b.is_bot ?? false })
      setBotByUser(botMap)

      setNameByUser(nameMap)
      setKitByUser(kitMap)
      setRatingByUser(ratingMap)
    }

    setLoading(false)
  }

  async function postComment() {
    const content = newCommentDraft.trim()
    if (!content || !user) return
    setPostingComment(true)
    await supabase.from('wall_comments').insert({ user_id: user.id, content })
    setNewCommentDraft('')
    await loadData()
    setPostingComment(false)
  }

  async function postCommentReply(commentId: string) {
    const content = (commentReplyDraft[commentId] ?? '').trim()
    if (!content || !user) return
    await supabase.from('wall_comment_replies').insert({ comment_id: commentId, user_id: user.id, content })
    setCommentReplyDraft(prev => ({ ...prev, [commentId]: '' }))
    setSentCommentReply(prev => ({ ...prev, [commentId]: true }))
  }

  async function postReply(pickId: string) {
    const content = (replyDraft[pickId] ?? '').trim()
    if (!content || !user) return
    await supabase.from('wall_replies').insert({ pick_id: pickId, user_id: user.id, content })
    setReplyDraft(prev => ({ ...prev, [pickId]: '' }))
    setSentReply(prev => ({ ...prev, [pickId]: true }))
  }

  async function submitRating(targetType: 'comment' | 'question_answer' | 'reply', targetId: string, rating: number) {
    const key = `${targetType}:${targetId}`
    const previous = ratingsByTarget[key] ?? { average: 0, count: 0, yours: null }

    // Optimistic — reconstructs the sum, removes your own prior vote (if
    // any) rather than just adding to it, then adds the new one back in,
    // matching the upsert this is about to perform server-side.
    const baseTotal = previous.average * previous.count - (previous.yours ?? 0)
    const baseCount = previous.count - (previous.yours != null ? 1 : 0)
    const nextCount = baseCount + 1
    const nextAverage = (baseTotal + rating) / nextCount
    setRatingsByTarget(prev => ({ ...prev, [key]: { average: nextAverage, count: nextCount, yours: rating } }))

    const res = await fetch('/api/wall/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, rating }),
    })
    if (!res.ok) {
      // Roll back on failure (e.g. rating your own content some other way)
      setRatingsByTarget(prev => ({ ...prev, [key]: previous }))
    }
  }

  if (loading) {
    return (
      <Shell active="THE WALL" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="THE WALL" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? (
          <div className="pop-art-theme text-center py-12">
            <p className="pop-headline text-2xl mb-2">No Active Competition</p>
          </div>
        ) : (
          <p className="text-gray-500">No active competition right now.</p>
        )}
      </Shell>
    )
  }

  const bubbleBg = popArt ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.05)'
  const ownBubbleBg = popArt ? 'rgba(160,0,250,0.16)' : 'rgba(217,164,65,0.16)'
  const nothingAtAll = posts.length === 0 && standaloneComments.length === 0

  function authorAvatar(userId: string, size: number) {
    if (botByUser[userId]) return <BotAvatar size={size} />
    return (
      <KitBadge
        pattern={kitByUser[userId]?.pattern ?? 'solid'}
        colour1={kitByUser[userId]?.colour1 ?? '#1E4D6B'}
        colour2={kitByUser[userId]?.colour2 ?? '#F5ECD9'}
        colour3={kitByUser[userId]?.colour3}
        stars={starsEarthsByUser[userId]?.stars ?? 0}
        earths={starsEarthsByUser[userId]?.earths ?? 0}
        size={size}
        iconTextClass="text-xs sm:text-sm"
        starColor={popArt ? 'var(--pop-green)' : '#D9A441'}
      />
    )
  }

  return (
    <Shell active="THE WALL" user={user} displayName={displayName} theme={popArt ? 'pop-art' : 'classic'}>
      <div className={popArt ? 'pop-art-theme' : ''}>
        {popArt ? (
          <h1 className="pop-hero pop-hero--green text-5xl sm:text-6xl mb-1">The Wall</h1>
        ) : (
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>THE WALL</h1>
        )}
        <p className={popArt ? 'font-bold text-sm mb-6' : 'text-sm mb-6'} style={popArt ? { color: 'rgba(255,255,255,0.5)' } : { color: '#D9A44199' }}>
          {competition.name} — weekly answers and comments reveal automatically once each gameweek&apos;s deadline has passed. Comments need admin approval before they show up.
        </p>

        <div className="mb-8">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCommentDraft}
              onChange={e => setNewCommentDraft(e.target.value)}
              placeholder="Write a comment..."
              maxLength={280}
              className={popArt ? 'pop-input flex-1 p-2.5 text-sm' : 'flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm'}
            />
            <button
              onClick={postComment}
              disabled={postingComment || !newCommentDraft.trim()}
              className={popArt ? 'pop-button px-4 py-2.5 text-xs' : 'text-xs font-bold uppercase px-4 py-2.5 rounded border border-[#D9A441]/50 text-[#D9A441] disabled:opacity-40'}
            >
              {postingComment ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>

        {standaloneComments.length > 0 && (
          <div className="space-y-4 mb-8">
            {standaloneComments.map(c => {
              const isOwn = c.user_id === user?.id
              const isPending = c.status === 'pending'
              return (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-1">{authorAvatar(c.user_id, 48)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-black text-xs">{nameByUser[c.user_id] ?? 'Unknown'}</span>
                      {isPending && (
                        <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: popArt ? 'var(--pop-orange)' : '#D9A441' }}>
                          Awaiting approval
                        </span>
                      )}
                    </div>
                    <div
                      className="relative rounded-2xl px-3.5 py-2.5 inline-block max-w-full"
                      style={{ background: isOwn ? ownBubbleBg : bubbleBg, borderTopLeftRadius: 4, opacity: isPending ? 0.6 : 1 }}
                    >
                      <p className="text-sm break-words">{c.content}</p>
                    </div>

                    {(commentRepliesByComment[c.id] ?? []).length > 0 && (
                      <div className="mt-2 ml-4 space-y-1.5">
                        {commentRepliesByComment[c.id].map(r => (
                          <div key={r.id} className="rounded-xl rounded-tl px-3 py-1.5 inline-block" style={{ background: popArt ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)', opacity: r.status === 'pending' ? 0.6 : 1 }}>
                            <span className="font-black text-xs">{nameByUser[r.user_id] ?? 'Unknown'}</span>
                            <span className="text-xs ml-1.5" style={{ color: popArt ? 'rgba(255,255,255,0.7)' : '#F5ECD9CC' }}>{r.content}</span>
                            {r.status === 'pending' && (
                              <span className="text-[9px] uppercase tracking-wide font-bold ml-1.5" style={{ color: popArt ? 'var(--pop-orange)' : '#D9A441' }}>pending</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {sentCommentReply[c.id] ? (
                      <p className="text-xs mt-1.5" style={{ color: popArt ? 'var(--pop-green)' : '#4ADE80' }}>Sent.</p>
                    ) : (
                      <div className="flex items-center gap-2 mt-1.5 max-w-sm">
                        <input
                          type="text"
                          value={commentReplyDraft[c.id] ?? ''}
                          onChange={e => setCommentReplyDraft(prev => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="Reply..."
                          maxLength={200}
                          className={popArt ? 'pop-input flex-1 p-1.5 text-xs' : 'flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs'}
                        />
                        <button
                          onClick={() => postCommentReply(c.id)}
                          disabled={!(commentReplyDraft[c.id] ?? '').trim()}
                          className={popArt ? 'pop-button px-3 py-1.5 text-xs' : 'text-xs font-bold uppercase px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] disabled:opacity-40'}
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {nothingAtAll ? (
          <p className={popArt ? 'text-sm' : 'text-sm text-gray-500'} style={popArt ? { color: 'rgba(255,255,255,0.5)' } : undefined}>
            Nothing on the wall yet — be the first to write a comment above.
          </p>
        ) : (
          <div className="space-y-4">
            {posts.map(post => {
              const rating = ratingByUser[post.user_id]
              const avg = rating && rating.count > 0 ? (rating.total / rating.count).toFixed(1) : null
              const isOwn = post.user_id === user?.id
              const q = questionByGw[post.gameweek_id]
              const answer = answerLabel(q, post.question_answer)
              return (
                <div key={post.pick_id} className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-1">{authorAvatar(post.user_id, 48)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-black text-xs">{nameByUser[post.user_id] ?? 'Unknown'}</span>
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: popArt ? 'rgba(255,255,255,0.4)' : '#F5ECD940' }}>
                        GW{gwNumberById[post.gameweek_id] ?? '?'}{avg ? ` · ⭐ ${avg} avg (${rating!.count})` : ''}
                      </span>
                    </div>

                    {/* Message-bubble chrome: rounded, a little tail nub top-
                        left, own posts tinted differently — the social-
                        media/WhatsApp look this was asked to have. */}
                    <div
                      className="relative rounded-2xl px-3.5 py-2.5 inline-block max-w-full"
                      style={{ background: isOwn ? ownBubbleBg : bubbleBg, borderTopLeftRadius: 4 }}
                    >
                      {answer && q && (
                        <div className="rounded-lg px-2.5 py-1.5 mb-2 text-xs" style={{ background: 'rgba(0,0,0,0.2)' }}>
                          <span style={{ color: popArt ? 'var(--pop-yellow)' : '#D9A441' }} className="font-bold">{q.question}</span>
                          <span className="block mt-0.5">{answer}</span>
                          <div className="mt-1.5">
                            <StarRating
                              average={ratingsByTarget[`question_answer:${post.pick_id}`]?.average ?? null}
                              count={ratingsByTarget[`question_answer:${post.pick_id}`]?.count ?? 0}
                              yourRating={ratingsByTarget[`question_answer:${post.pick_id}`]?.yours ?? null}
                              onRate={n => submitRating('question_answer', post.pick_id, n)}
                              interactive={!isOwn}
                              popArt={popArt}
                            />
                          </div>
                        </div>
                      )}
                      {post.comments && (
                        <p className="text-sm break-words">{post.comments}</p>
                      )}
                      {post.wall_rating != null && (
                        <p className="text-xs mt-1.5" style={{ color: popArt ? 'var(--pop-yellow)' : '#D9A441' }}>
                          {'⭐'.repeat(post.wall_rating) || 'Rated 0'}
                        </p>
                      )}
                      {post.comments && (
                        <div className="mt-1.5">
                          <StarRating
                            average={ratingsByTarget[`comment:${post.pick_id}`]?.average ?? null}
                            count={ratingsByTarget[`comment:${post.pick_id}`]?.count ?? 0}
                            yourRating={ratingsByTarget[`comment:${post.pick_id}`]?.yours ?? null}
                            onRate={n => submitRating('comment', post.pick_id, n)}
                            interactive={!isOwn}
                            popArt={popArt}
                          />
                        </div>
                      )}
                    </div>

                    {(repliesByPick[post.pick_id] ?? []).length > 0 && (
                      <div className="mt-2 ml-4 space-y-1.5">
                        {repliesByPick[post.pick_id].map(r => (
                          <div key={r.id}>
                            <div className="rounded-xl rounded-tl px-3 py-1.5 inline-block" style={{ background: popArt ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)' }}>
                              <span className="font-black text-xs">{nameByUser[r.user_id] ?? 'Unknown'}</span>
                              <span className="text-xs ml-1.5" style={{ color: popArt ? 'rgba(255,255,255,0.7)' : '#F5ECD9CC' }}>{r.content}</span>
                            </div>
                            <div className="mt-1">
                              <StarRating
                                average={ratingsByTarget[`reply:${r.id}`]?.average ?? null}
                                count={ratingsByTarget[`reply:${r.id}`]?.count ?? 0}
                                yourRating={ratingsByTarget[`reply:${r.id}`]?.yours ?? null}
                                onRate={n => submitRating('reply', r.id, n)}
                                interactive={r.user_id !== user?.id}
                                popArt={popArt}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {sentReply[post.pick_id] ? (
                      <p className="text-xs mt-1.5" style={{ color: popArt ? 'var(--pop-green)' : '#4ADE80' }}>Sent.</p>
                    ) : (
                      <div className="flex items-center gap-2 mt-1.5 max-w-sm">
                        <input
                          type="text"
                          value={replyDraft[post.pick_id] ?? ''}
                          onChange={e => setReplyDraft(prev => ({ ...prev, [post.pick_id]: e.target.value }))}
                          placeholder="Reply..."
                          maxLength={200}
                          className={popArt ? 'pop-input flex-1 p-1.5 text-xs' : 'flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs'}
                        />
                        <button
                          onClick={() => postReply(post.pick_id)}
                          disabled={!(replyDraft[post.pick_id] ?? '').trim()}
                          className={popArt ? 'pop-button px-3 py-1.5 text-xs' : 'text-xs font-bold uppercase px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] disabled:opacity-40'}
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
