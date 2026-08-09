'use client'

import Shell from '../../components/ceefax-shell'
import HeroPage from '../../../components/HeroPage'
import { usePopArtTheme } from '../../lib/usePopArtTheme'
import Link from 'next/link'

type Post = { title: string; content: string; published_at: string | null }

// The [slug] page itself stays a server component (it needs generateMetadata,
// which can't live in a 'use client' file) — this is where the actual
// theme-aware rendering happens, given the already-fetched data as props.
export default function NewsPostView({
  post, byline, user, displayName,
}: {
  post: Post
  byline: string[]
  user: any
  displayName: string
}) {
  const { popArt } = usePopArtTheme(user?.id)
  const paragraphs = post.content.split('\n\n').filter((p: string) => p.trim())

  if (popArt) {
    return (
      <Shell active="NEWS" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">
          <p className="uppercase tracking-widest mb-2" style={{ fontSize: '10px', color: 'var(--pop-blue)' }}>
            {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
            }) : ''}
          </p>
          <h1 className="font-black text-3xl sm:text-4xl mb-2" style={{ color: 'var(--pop-white)' }}>{post.title}</h1>
          <p className="uppercase tracking-wider mb-6" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', minHeight: '1em' }}>
            {byline.length > 0 ? byline.join(' · ') : ' '}
          </p>

          <div className="pop-panel p-6 space-y-4">
            {paragraphs.map((para: string, i: number) => (
              <p key={i} className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>{para}</p>
            ))}
          </div>

          <Link href="/news" className="inline-block mt-6 text-sm font-bold" style={{ color: 'var(--pop-blue)' }}>
            ← All news
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell active="NEWS" user={user} displayName={displayName}>
      <HeroPage wide noImage>
        <div className="w-full text-[#F5ECD9]">
          <p className="text-[10px] uppercase tracking-widest text-[#D9A441]/70 mb-2">
            {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
            }) : ''}
          </p>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>{post.title}</h1>
          <p className="text-xs text-[#F5ECD9]/50 mb-6 uppercase tracking-wider min-h-[1em]">
            {byline.length > 0 ? byline.join(' · ') : ' '}
          </p>

          <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-4">
            {paragraphs.map((para: string, i: number) => (
              <p key={i} className="text-sm text-[#F5ECD9]/90 leading-relaxed">{para}</p>
            ))}
          </div>

          <Link href="/news" className="inline-block mt-6 text-sm text-[#D9A441] hover:text-[#F5ECD9]">
            ← All news
          </Link>
        </div>
      </HeroPage>
    </Shell>
  )
}
