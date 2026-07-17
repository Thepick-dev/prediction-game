import { createServerSupabaseClient } from '../../lib/supabase-server'
import Shell from '../../components/ceefax-shell'
import HeroPage from '../../../components/HeroPage'
import Link from 'next/link'
import { notFound } from 'next/navigation'

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
      <HeroPage>
        <div className="w-full max-w-2xl">
          <p className="text-xs text-gray-400 mb-2">
            {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric'
            }) : ''}
          </p>
          <h1 className="text-3xl font-bold mb-6">{post.title}</h1>

          <div className="bg-white border rounded-lg p-6 space-y-4">
            {paragraphs.map((para: string, i: number) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{para}</p>
            ))}
          </div>

          <Link href="/news" className="inline-block mt-6 text-sm text-gray-500 hover:text-black">
            ← All news
          </Link>
        </div>
      </HeroPage>
    </Shell>
  )
}