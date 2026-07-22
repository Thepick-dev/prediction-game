import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import Link from 'next/link'

export default async function NewsListPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null }

  const { data: posts } = await supabase
    .from('dispatches')
    .select('slug, title, excerpt, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  return (
    <Shell active="MATCHDAY PROGRAMME" user={user} displayName={profile?.display_name ?? undefined}>
      <HeroPage wide noImage>
        <div className="w-full text-[#F5ECD9]">

          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>MATCHDAY PROGRAMME</h1>
          <p className="text-[#D9A441]/70 mb-6 text-sm">News, previews and reports</p>

          {!posts || posts.length === 0 ? (
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