import { createServerSupabaseClient } from './lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Nav from './components/nav'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name, status')
    .eq('status', 'active')
    .single()

  const isJoined = user && competition ? await supabase
    .from('competition_entries')
    .select('id')
    .eq('user_id', user.id)
    .single()
    .then(({ data }) => !!data) : false

  const { data: profile } = user ? await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single() : { data: null }

  const { data: topPlayers } = competition ? await supabase
    .from('competition_entries')
    .select('user_id, profiles(display_name)')
    .eq('competition_id', competition.id)
    .limit(5) : { data: null }

  const { data: latestDispatch } = await supabase
    .from('dispatches')
    .select('id, title, slug, excerpt, published_at')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(1)
    .single()

  async function signOut() {
    'use server'
    const supabase = await createServerSupabaseClient()
    await supabase.auth.signOut()
    redirect('/')
  }

  return (
    <>
      <Nav user={user} displayName={profile?.display_name ?? undefined} />

      <main className="max-w-4xl mx-auto px-4 py-8">

        {competition && (
          <div className="border-2 border-coupon-ink p-4 mb-8 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-1">Now Running</p>
            <p className="font-display text-2xl font-bold">{competition.name}</p>
            <div className="mt-4 flex justify-center gap-4">
              {user ? (
                <>
                  {!isJoined && (
                    <Link href="/join" className="font-mono text-xs uppercase tracking-wider bg-coupon-green text-coupon-paper px-4 py-2 hover:opacity-90">
                      Join Competition
                    </Link>
                  )}
                  {isJoined && (
                    <Link href="/picks" className="font-mono text-xs uppercase tracking-wider bg-coupon-green text-coupon-paper px-4 py-2 hover:opacity-90">
                      Make Your Pick
                    </Link>
                  )}
                  <Link href="/leaderboard" className="font-mono text-xs uppercase tracking-wider border border-coupon-ink px-4 py-2 hover:bg-coupon-ink hover:text-coupon-paper">
                    Leaderboard
                  </Link>
                </>
              ) : (
                <Link href="/login" className="font-mono text-xs uppercase tracking-wider bg-coupon-green text-coupon-paper px-4 py-2 hover:opacity-90">
                  Log In To Play
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          <div className="md:col-span-2">
            {latestDispatch ? (
              <div className="border-b-2 border-coupon-ink pb-6 mb-6">
                <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-2">Latest Dispatch</p>
                <h2 className="font-display text-3xl font-bold leading-tight mb-3">
                  <Link href={`/dispatch/${latestDispatch.slug}`} className="hover:text-coupon-green">
                    {latestDispatch.title}
                  </Link>
                </h2>
                <p className="text-sm leading-relaxed text-coupon-muted mb-3">{latestDispatch.excerpt}</p>
                <Link href={`/dispatch/${latestDispatch.slug}`} className="font-mono text-xs uppercase tracking-wider text-coupon-green hover:underline">
                  Read the dispatch →
                </Link>
              </div>
            ) : (
              <div className="border-b-2 border-coupon-ink pb-6 mb-6">
                <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-2">Dispatch</p>
                <h2 className="font-display text-3xl font-bold leading-tight mb-3 text-coupon-muted">
                  The correspondent is sharpening his pencil.
                </h2>
                <p className="text-sm leading-relaxed text-coupon-muted">First dispatch filed before the opening whistle.</p>
              </div>
            )}

            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-4">How It Works</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { step: '01', title: 'Pick Your Team', body: 'One Premier League team per gameweek. Each team can only be used once.' },
                  { step: '02', title: 'Pick Two Players', body: 'Any two players from any club. Each player usable twice per competition.' },
                  { step: '03', title: 'Score Points', body: 'Points based on result and league position differential. Banker doubles everything.' },
                ].map(item => (
                  <div key={item.step} className="border border-coupon-rule p-4">
                    <p className="font-mono text-xs text-coupon-muted mb-1">{item.step}</p>
                    <p className="font-display font-bold mb-2">{item.title}</p>
                    <p className="text-xs text-coupon-muted leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-4">The Table</p>
            <div className="border border-coupon-rule">
              <Link href="/leaderboard" className="block hover:opacity-80">
                <div className="bg-coupon-green text-coupon-paper px-3 py-2">
                  <p className="font-mono text-xs uppercase tracking-wider">Leaderboard</p>
                </div>
                <div className="divide-y divide-coupon-rule">
                  {topPlayers && topPlayers.length > 0 ? topPlayers.map((entry, i) => (
                    <div key={entry.user_id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-coupon-muted w-4">{i + 1}</span>
                        <span className="text-sm">{(entry.profiles as any)?.display_name ?? 'Unknown'}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="px-3 py-4 text-center">
                      <p className="font-mono text-xs text-coupon-muted">No players yet</p>
                    </div>
                  )}
                </div>
              </Link>
            </div>

            {user && (
              <div className="mt-6 border border-coupon-rule p-4">
                <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-3">Your Account</p>
                <p className="text-sm mb-3">{profile?.display_name ?? user.email}</p>
                <div className="space-y-2">
                  <Link href="/history" className="block font-mono text-xs uppercase tracking-wider hover:text-coupon-green">My History →</Link>
                  <Link href="/settings" className="block font-mono text-xs uppercase tracking-wider hover:text-coupon-green">Settings →</Link>
                  <form action={signOut}>
                    <button type="submit" className="font-mono text-xs uppercase tracking-wider text-coupon-muted hover:text-coupon-ink">
                      Log Out
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      <footer className="border-t-2 border-coupon-ink mt-16 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="font-mono text-xs text-coupon-muted uppercase tracking-widest">
            The Coupon — The Premier League Prediction Game
          </p>
        </div>
      </footer>
    </>
  )
}