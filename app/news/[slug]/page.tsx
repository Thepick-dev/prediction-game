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
          <h1 className="text-3xl font-bold mb-6" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>{post.title}</h1>

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