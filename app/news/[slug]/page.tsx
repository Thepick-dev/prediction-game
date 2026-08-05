import { createServerSupabaseClient } from '../../lib/supabase-server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import NewsPostView from './NewsPostView'

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

  return (
    <NewsPostView
      post={{ title: post.title, content: post.content, published_at: post.published_at }}
      byline={byline}
      user={user}
      displayName={profile?.display_name ?? ''}
    />
  )
}
