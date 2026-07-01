import { createServerSupabaseClient } from '../../lib/supabase-server'
import Nav from '../../components/nav'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function DispatchDetailPage({ params }: { params: { slug: string } }) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('profiles').select('display_name').eq('id', user.id).single() : { data: null }

  const { data: dispatch } = await supabase
    .from('dispatches')
    .select('*')
    .eq('slug', params.slug)
    .eq('published', true)
    .single()

  if (!dispatch) notFound()

  const paragraphs = dispatch.content.split('\n\n').filter((p: string) => p.trim())

  return (
    <>
      <Nav user={user} displayName={profile?.display_name ?? undefined} />

      <main className="max-w-2xl mx-auto px-4 py-8">

        <div className="border-b-2 border-coupon-ink pb-6 mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-4">
            {dispatch.published_at ? new Date(dispatch.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight mb-4">
            {dispatch.title}
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted">
            By {dispatch.author ?? 'Stanno'}
          </p>
        </div>

        <div className="prose-sm space-y-4">
          {paragraphs.map((para: string, i: number) => (
            <p key={i} className="leading-relaxed text-coupon-ink">
              {para}
            </p>
          ))}
        </div>

        <div className="border-t border-coupon-rule mt-12 pt-6">
          <Link href="/dispatch" className="font-mono text-xs uppercase tracking-wider text-coupon-green hover:underline">
            ← All Dispatches
          </Link>
        </div>

      </main>

      <footer className="border-t-2 border-coupon-ink mt-16 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest">The Coupon — The Premier League Prediction Game</p>
        </div>
      </footer>
    </>
  )
}