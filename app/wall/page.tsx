'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import KitBadge from '../../components/KitBadge'

type Post = {
  pick_id: string
  user_id: string
  gameweek_id: string
  comments: string
  wall_rating: number | null
}
type Reply = { id: string; pick_id: string; user_id: string; content: string; created_at: string }

export default function WallPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [repliesByPick, setRepliesByPick] = useState<Record<string, Reply[]>>({})
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({})
  const [kitByUser, setKitByUser] = useState<Record<string, { pattern: string; colour1: string; colour2: string; colour3: string | null }>>({})
  const [ratingByUser, setRatingByUser] = useState<Record<string, { total: number; count: number }>>({})
  const [gwNumberById, setGwNumberById] = useState<Record<string, number>>({})
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [sentReply, setSentReply] = useState<Record<string, boolean>>({})
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

    // wall_posts is a narrow public-safe view — only approved comments on
    // gameweeks whose deadline has already passed, and only the comment
    // text/rating, never the actual team/player picks. See the SQL this
    // was set up with for why that split matters.
    const { data: wallPosts } = await supabase
      .from('wall_posts')
      .select('pick_id, user_id, gameweek_id, comments, wall_rating')
      .eq('competition_id', comp.id)

    const list = (wallPosts ?? []) as Post[]

    const { data: gameweeks } = await supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id)
    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })
    setGwNumberById(gwMap)

    list.sort((a, b) => (gwMap[b.gameweek_id] ?? 0) - (gwMap[a.gameweek_id] ?? 0))
    setPosts(list)

    if (list.length > 0) {
      const pickIds = list.map(p => p.pick_id)
      const { data: replies } = await supabase
        .from('wall_replies')
        .select('id, pick_id, user_id, content, created_at')
        .in('pick_id', pickIds)
        .eq('status', 'approved')
        .order('created_at', { ascending: true })

      const byPick: Record<string, Reply[]> = {}
      replies?.forEach(r => { (byPick[r.pick_id] ??= []).push(r) })
      setRepliesByPick(byPick)

      const userIds = new Set<string>(list.map(p => p.user_id))
      replies?.forEach(r => userIds.add(r.user_id))

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

      setNameByUser(nameMap)
      setKitByUser(kitMap)
      setRatingByUser(ratingMap)
    }

    setLoading(false)
  }

  async function postReply(pickId: string) {
    const content = (replyDraft[pickId] ?? '').trim()
    if (!content || !user) return
    await supabase.from('wall_replies').insert({ pick_id: pickId, user_id: user.id, content })
    setReplyDraft(prev => ({ ...prev, [pickId]: '' }))
    setSentReply(prev => ({ ...prev, [pickId]: true }))
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

  return (
    <Shell active="THE WALL" user={user} displayName={displayName} theme={popArt ? 'pop-art' : 'classic'}>
      <div className={popArt ? 'pop-art-theme' : ''}>
        {popArt ? (
          <h1 className="pop-hero pop-hero--green text-5xl sm:text-6xl mb-1">The Wall</h1>
        ) : (
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>THE WALL</h1>
        )}
        <p className={popArt ? 'font-bold text-sm mb-6' : 'text-sm mb-6'} style={popArt ? { color: 'rgba(255,255,255,0.5)' } : { color: '#D9A44199' }}>
          {competition.name} — everything here is admin-approved before it goes up.
        </p>

        {posts.length === 0 ? (
          <p className={popArt ? 'text-sm' : 'text-sm text-gray-500'} style={popArt ? { color: 'rgba(255,255,255,0.5)' } : undefined}>
            Nothing on the wall yet — add something from the Picks page.
          </p>
        ) : (
          <div className="space-y-3">
            {posts.map(post => {
              const rating = ratingByUser[post.user_id]
              const avg = rating && rating.count > 0 ? (rating.total / rating.count).toFixed(1) : null
              return (
                <div key={post.pick_id} className={popArt ? 'pop-panel p-4' : 'bg-white/5 border border-white/10 rounded-lg p-4'}>
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div className="flex items-center gap-2">
                      <KitBadge
                        pattern={kitByUser[post.user_id]?.pattern ?? 'solid'}
                        colour1={kitByUser[post.user_id]?.colour1 ?? '#1E4D6B'}
                        colour2={kitByUser[post.user_id]?.colour2 ?? '#F5ECD9'}
                        colour3={kitByUser[post.user_id]?.colour3}
                        size={22}
                      />
                      <div>
                        <p className="font-black text-sm">{nameByUser[post.user_id] ?? 'Unknown'}</p>
                        <p className="text-[10px] uppercase tracking-wide" style={{ color: popArt ? 'rgba(255,255,255,0.4)' : '#F5ECD940' }}>
                          GW{gwNumberById[post.gameweek_id] ?? '?'}{avg ? ` · ⭐ ${avg} avg (${rating!.count})` : ''}
                        </p>
                      </div>
                    </div>
                    {post.wall_rating != null && (
                      <span className={popArt ? 'pop-badge pop-badge--yellow px-2 py-1 text-xs' : 'text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-300'}>
                        {'⭐'.repeat(post.wall_rating) || 'Rated 0'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm mb-3">{post.comments}</p>

                  {(repliesByPick[post.pick_id] ?? []).length > 0 && (
                    <div className="ml-4 pl-3 space-y-2 mb-3" style={{ borderLeft: popArt ? '2px solid rgba(255,255,255,0.15)' : '2px solid #F5ECD920' }}>
                      {repliesByPick[post.pick_id].map(r => (
                        <div key={r.id}>
                          <span className="font-black text-xs">{nameByUser[r.user_id] ?? 'Unknown'}</span>
                          <span className="text-xs ml-1.5" style={{ color: popArt ? 'rgba(255,255,255,0.7)' : '#F5ECD9CC' }}>{r.content}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {sentReply[post.pick_id] ? (
                    <p className="text-xs" style={{ color: popArt ? 'var(--pop-green)' : '#4ADE80' }}>Sent for review.</p>
                  ) : (
                    <div className="flex items-center gap-2">
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
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
