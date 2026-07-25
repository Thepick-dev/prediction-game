import { createServerSupabaseClient } from '../../lib/supabase-server'
import Shell from '../../components/ceefax-shell'
import HeroPage from '../../../components/HeroPage'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()

  const { data: post } = await supabase
    .from('dispatches')
    .select('title, excerpt, published_at')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) {
    return {
      title: 'Article not found — LMS All-Stars Predictions',
    }
  }

  const description = post.excerpt ?? 'Read the latest from LMS All-Stars Predictions.'

  return {
    title: `${post.title} — LMS All-Stars Predictions`,
    description,
  }
}

export default async function NewsPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null }

  const { data: post } = await supabase
    .from('dispatches')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) notFound()

  const byline: string[] = []
  if (post.author_id || post.approved_by) {
    const { data: bylineProfiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', [post.author_id, post.approved_by].filter(Boolean))
    const nameById: Record<string, string> = {}
    bylineProfiles?.forEach(p => { nameById[p.id] = p.display_name ?? 'Unknown' })
    if (post.author_id) byline.push(`By ${nameById[post.author_id] ?? 'Unknown'}`)
    if (post.approved_by && post.approved_by !== post.author_id) {
      byline.push(`Published by ${nameById[post.approved_by] ?? 'Unknown'}`)
    }
  }

  const paragraphs = post.content.split('\n\n').filter((p: string) => p.trim())

  return (
    <Shell active="MATCHDAY PROGRAMME" user={user} displayName={profile?.display_name ?? undefined}>
      <HeroPage wide noImage>
        <div className="w-full text-[#F5ECD9]">
          <p className="text-[10px] uppercase tracking-widest text-[#D9A441]/70 mb-2">
            {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
            }) : ''}
          </p>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>{post.title}</h1>
          <p className="text-xs text-[#F5ECD9]/50 mb-6 uppercase tracking-wider min-h-[1em]">
            {byline.length > 0 ? byline.join(' · ') : ' '}
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