import { createServerSupabaseClient } from '../lib/supabase-server'
import Nav from '../components/nav'
import Link from 'next/link'

export default async function DispatchPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('profiles').select('display_name').eq('id', user.id).single() : { data: null }

  const { data: dispatches } = await supabase
    .from('dispatches')
    .select('id, title, slug, excerpt, author, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  return (
    <>
      <Nav user={user} displayName={profile?.display_name ?? undefined} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="border-b-2 border-coupon-ink pb-6 mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-2">Filed From The Press Box</p>
          <h1 className="font-display text-4xl font-bold">The Dispatch</h1>
          <p className="text-coupon-muted mt-2">Match reports, gameweek analysis and editorial opinion from our correspondent in the field.</p>
        </div>

        {(!dispatches || dispatches.length === 0) ? (
          <div className="text-center py-16">
            <p className="font-display text-2xl text-coupon-muted mb-2">The correspondent is en route.</p>
            <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest">First dispatch filed before the opening whistle</p>
          </div>
        ) : (
          <div className="space-y-8">
            {dispatches.map((d, i) => (
              <article key={d.id} className={`${i < dispatches.length - 1 ? 'border-b border-coupon-rule pb-8' : ''}`}>
                <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest mb-2">
                  {d.published_at ? new Date(d.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                  {d.author && ` — By ${d.author}`}
                </p>
                <h2 className="font-display text-2xl font-bold mb-3">
                  <Link href={`/dispatch/${d.slug}`} className="hover:text-coupon-green">
                    {d.title}
                  </Link>
                </h2>
                {d.excerpt && (
                  <p className="text-coupon-muted leading-relaxed mb-3">{d.excerpt}</p>
                )}
                <Link href={`/dispatch/${d.slug}`} className="font-mono text-xs uppercase tracking-wider text-coupon-green hover:underline">
                  Read the dispatch →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t-2 border-coupon-ink mt-16 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest">The Coupon — The Premier League Prediction Game</p>
        </div>
      </footer>
    </>
  )
}