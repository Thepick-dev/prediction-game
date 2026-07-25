import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import Link from 'next/link'

export default async function NewsListPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name, can_post_news, is_super_admin, is_admin').eq('id', user.id).single()
    : { data: null }

  const canWrite = !!(profile?.can_post_news || profile?.is_admin)
  const canApprove = !!(profile?.is_super_admin || profile?.is_admin)

  let pendingCount = 0
  if (canApprove) {
    const { count } = await supabase
      .from('dispatches')
      .select('id', { count: 'exact', head: true })
      .eq('approved', false)
      .not('author_id', 'is', null)
    pendingCount = count ?? 0
  }

  const { data: posts } = await supabase
    .from('dispatches')
    .select('slug, title, excerpt, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  return (
    <Shell active="MATCHDAY PROGRAMME" user={user} displayName={profile?.display_name ?? undefined}>
      <HeroPage wide noImage>
        <div className="w-full text-[#F5ECD9]">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>MATCHDAY PROGRAMME</h1>
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