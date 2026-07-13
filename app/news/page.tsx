import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import Link from 'next/link'

export default async function NewsPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null }

  const { data: posts } = await supabase
    .from('dispatches')
    .select('id, title, slug, excerpt, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  return (
    <Shell active="NEWS" user={user} displayName={profile?.display_name ?? undefined}>
      <HeroPage
        desktopImage="/images/heroes/programme-desktop.png"
        mobileImage="/images/heroes/programme-mobile.png"
      >
        <div className="w-full max-w-2xl">

          <h1 className="text-3xl font-bold mb-8">Matchday Programme</h1>

          {(!posts || posts.length === 0) ? (
            <div className="bg-white border rounded-lg p-6">
              <p className="text-gray-400 text-sm">No posts yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <Link key={post.id} href={`/news/${post.slug}`} className="block bg-white border rounded-lg p-6 hover:border-black transition-colors">
                  <p className="text-xs text-gray-400 mb-2">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    }) : ''}
                  </p>
                  <h2 className="text-xl font-bold mb-2">{post.title}</h2>
                  {post.excerpt && <p className="text-sm text-gray-500">{post.excerpt}</p>}
                </Link>
              ))}
            </div>
          )}

        </div>
      </HeroPage>
    </Shell>
  )
}