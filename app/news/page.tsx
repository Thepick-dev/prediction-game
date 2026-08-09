'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import Link from 'next/link'

type Post = { slug: string; title: string; excerpt: string | null; published_at: string | null; author_id: string | null }

export default function NewsListPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [canWrite, setCanWrite] = useState(false)
  const [canApprove, setCanApprove] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, can_post_news, is_super_admin, is_admin')
        .eq('id', authUser.id)
        .single()
      setDisplayName(profile?.display_name ?? '')
      setCanWrite(!!(profile?.can_post_news || profile?.is_admin))
      // Deliberately super-admin-only, not admin-inclusive — approving
      // articles is the one thing that distinguishes a Super Admin from a
      // regular Admin, who otherwise has identical access everywhere else.
      const approve = !!profile?.is_super_admin
      setCanApprove(approve)
      if (approve) {
        const { count } = await supabase
          .from('dispatches')
          .select('id', { count: 'exact', head: true })
          .eq('approved', false)
          .not('author_id', 'is', null)
        setPendingCount(count ?? 0)
      }
    }

    const { data: postsData } = await supabase
      .from('dispatches')
      .select('slug, title, excerpt, published_at, author_id')
      .eq('published', true)
      .order('published_at', { ascending: false })
    setPosts(postsData ?? [])

    const authorIds = [...new Set((postsData ?? []).map(p => p.author_id).filter(Boolean))] as string[]
    if (authorIds.length > 0) {
      const { data: authorProfiles } = await supabase.from('profiles').select('id, display_name').in('id', authorIds)
      const names: Record<string, string> = {}
      authorProfiles?.forEach(p => { names[p.id] = p.display_name ?? 'Unknown' })
      setAuthorNames(names)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="NEWS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell active="NEWS" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h1 className="pop-hero pop-hero--blue pop-hero-texture text-5xl sm:text-6xl">News</h1>
            <div className="flex gap-2 flex-wrap">
              {canWrite && (
                <Link href="/news/write" className="pop-button pop-button--yellow px-3 py-1.5 text-xs">
                  Write Article
                </Link>
              )}
              {canApprove && (
                <Link href="/news/approve" className="pop-button pop-button--blue px-3 py-1.5 text-xs">
                  Review Submissions{pendingCount > 0 ? ` (${pendingCount})` : ''}
                </Link>
              )}
            </div>
          </div>
          <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>News, previews and reports</p>

          {posts.length === 0 ? (
            <div className="pop-panel p-6">
              <p className="text-sm uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Nothing published yet — check back after the next gameweek.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <Link key={post.slug} href={`/news/${post.slug}`} className="pop-panel block p-4 hover:brightness-110 transition-[filter]">
                  <p className="uppercase tracking-widest mb-1" style={{ fontSize: '10px', color: 'var(--pop-blue)' }}>
                    {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
                    }) : ''}
                  </p>
                  <h2 className="font-black text-lg mb-1" style={{ color: 'var(--pop-white)' }}>{post.title}</h2>
                  {post.author_id && authorNames[post.author_id] && (
                    <p className="uppercase tracking-wider mb-1.5" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>By {authorNames[post.author_id]}</p>
                  )}
                  {post.excerpt && (
                    <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{post.excerpt}</p>
                  )}
                </Link>
              ))}
            </div>
          )}

        </div>
      </Shell>
    )
  }

  return (
    <Shell active="NEWS" user={user} displayName={displayName}>
      <HeroPage wide noImage>
        <div className="w-full text-[#F5ECD9]">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>NEWS</h1>
            <div className="flex gap-2 flex-wrap">
              {canWrite && (
                <Link
                  href="/news/write"
                  className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors"
                >
                  ✎ Write Article
                </Link>
              )}
              {canApprove && (
                <Link
                  href="/news/approve"
                  className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors"
                >
                  Review Submissions{pendingCount > 0 ? ` (${pendingCount})` : ''}
                </Link>
              )}
            </div>
          </div>
          <p className="text-[#D9A441]/70 mb-6 text-sm">News, previews and reports</p>

          {posts.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <p className="text-[#F5ECD9]/50 text-sm uppercase tracking-wider">No articles published yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <Link
                  key={post.slug}
                  href={`/news/${post.slug}`}
                  className="block bg-white/5 border border-white/10 rounded-lg p-4 hover:border-[#D9A441]/50 transition-colors"
                >
                  <p className="text-[10px] uppercase tracking-widest text-[#D9A441]/70 mb-1">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
                    }) : ''}
                  </p>
                  <h2 className="text-lg font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif' }}>{post.title}</h2>
                  {post.author_id && authorNames[post.author_id] && (
                    <p className="text-[10px] uppercase tracking-wider text-[#F5ECD9]/40 mb-1.5">By {authorNames[post.author_id]}</p>
                  )}
                  {post.excerpt && (
                    <p className="text-sm text-[#F5ECD9]/70 leading-relaxed">{post.excerpt}</p>
                  )}
                </Link>
              ))}
            </div>
          )}

        </div>
      </HeroPage>
    </Shell>
  )
}
