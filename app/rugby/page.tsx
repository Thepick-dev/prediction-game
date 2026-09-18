import { createServerSupabaseClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// The real front door now that this isn't admin-only testing anymore —
// previously this was just `redirect('/rugby/picks')`, which dropped a
// brand new visitor straight into "pick your kit" with zero context on
// what the game even is. An already-entered visitor still gets sent
// straight through, unchanged from before; this page only ever shows to
// someone who hasn't joined yet (or isn't logged in at all).
async function joinRugbyCompetition(formData: FormData) {
  'use server'
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/rugby')
  const competitionId = formData.get('competition_id') as string
  await supabase.schema('rugby').from('competition_entries').insert({ competition_id: competitionId, user_id: user.id })
  redirect('/rugby/picks')
}

type Competition = { id: string; name: string; season: string }

export default async function RugbyLandingPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 text-center">
        <p className="pop-headline text-2xl mb-2" style={{ color: 'var(--pop-white)' }}>No Active Rugby Competition</p>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Nothing set up yet — check back once the next tournament is announced.</p>
      </div>
    )
  }

  if (user) {
    const { data: entry } = await supabase.schema('rugby').from('competition_entries').select('id').eq('competition_id', competition.id).eq('user_id', user.id).maybeSingle()
    if (entry) redirect('/rugby/picks')
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="text-center mb-6">
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--pop-orange)' }}>{competition.season}</p>
        <h1 className="pop-hero pop-hero--pink text-3xl sm:text-4xl uppercase tracking-wide">{competition.name}</h1>
        <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Same crowd, new sport. Three ways to score — free to play, one login for both games.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <div className="pop-panel pop-panel--blue p-4">
          <p className="text-xl mb-1">📋</p>
          <p className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Tournament Calls</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Winner, wooden spoon, top try scorer and more — locked in once before Round 1.</p>
        </div>
        <div className="pop-panel pop-panel--green p-4">
          <p className="text-xl mb-1">🎯</p>
          <p className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Weekly Match Picks</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Predict each score, then rank your confidence — get it wrong at high confidence and it costs you.</p>
        </div>
        <div className="pop-panel pop-panel--yellow p-4">
          <p className="text-xl mb-1">🏆</p>
          <p className="pop-headline text-sm mb-1" style={{ color: 'var(--pop-white)' }}>Dream Team</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Draft 6 players, one per nation, plus a kicker — score on tries, kicks, tackles, cards and more, all season.</p>
        </div>
      </div>

      <div className="pop-panel pop-panel--pulse pop-panel--orange p-5 text-center">
        {user ? (
          <form action={joinRugbyCompetition}>
            <input type="hidden" name="competition_id" value={competition.id} />
            <p className="text-sm mb-3" style={{ color: 'var(--pop-white)' }}>Ready to pick your squad?</p>
            <button type="submit" className="pop-button w-full sm:w-auto px-8">Join {competition.name}</button>
          </form>
        ) : (
          <>
            <p className="text-sm mb-3" style={{ color: 'var(--pop-white)' }}>Log in with your existing LMS All-Stars account, or create a new one — it&apos;s the same login for both games.</p>
            <Link href="/login?next=/rugby" className="pop-button inline-block w-full sm:w-auto px-8">
              Log In / Sign Up
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
