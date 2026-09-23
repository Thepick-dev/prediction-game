import { createServerSupabaseClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RugbyFixtureCard from '../../components/RugbyFixtureCard'

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
type Fixture = { home_team_id: number; away_team_id: number; kickoff_time: string }
type Team = { id: number; name: string; short_code: string | null }

export default async function RugbyLandingPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name, season').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  if (!competition) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 text-center">
        <p className="rugby-display text-2xl mb-2">No Active Rugby Competition</p>
        <p className="text-sm" style={{ color: 'var(--rugby-text-dim)' }}>Nothing set up yet — check back once the next tournament is announced.</p>
      </div>
    )
  }

  if (user) {
    const { data: entry } = await supabase.schema('rugby').from('competition_entries').select('id').eq('competition_id', competition.id).eq('user_id', user.id).maybeSingle()
    if (entry) redirect('/rugby/picks')
  }

  // Round 1 preview so a new visitor sees the actual matchday board, not
  // just a description of it — the single most convincing thing on the
  // page. Its own isolated fetch: if anything here fails, the join flow
  // below still works with no preview shown, never a broken page.
  let previewFixtures: { home: Team; away: Team; kickoff: string }[] = []
  const { data: firstRound } = await supabase.schema('rugby').from('rounds').select('id, number').eq('competition_id', competition.id).order('number', { ascending: true }).limit(1).maybeSingle()
  if (firstRound) {
    const { data: fixtures } = await supabase.schema('rugby').from('fixtures').select('home_team_id, away_team_id, kickoff_time').eq('round_id', firstRound.id).order('kickoff_time', { ascending: true }) as unknown as { data: Fixture[] | null }
    const { data: teams } = await supabase.schema('rugby').from('teams').select('id, name, short_code') as unknown as { data: Team[] | null }
    const teamById = new Map((teams ?? []).map(t => [t.id, t]))
    previewFixtures = (fixtures ?? []).flatMap(f => {
      const home = teamById.get(f.home_team_id)
      const away = teamById.get(f.away_team_id)
      return home && away ? [{ home, away, kickoff: f.kickoff_time }] : []
    })
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="rugby-hero-wrap text-center">
        <p className="rugby-hero-eyebrow">{competition.season}</p>
        <h1 className="rugby-hero-title">{competition.name}</h1>
        <p className="text-sm mt-3" style={{ color: 'var(--rugby-text-dim)' }}>
          Same crowd, new sport. Three ways to score — free to play, one login for both games.
        </p>
      </div>

      {previewFixtures.length > 0 && (
        <div className="mb-8">
          <p className="rugby-section-sub text-center">Round 1</p>
          <div className="flex flex-col gap-4">
            {previewFixtures.map((f, i) => (
              <RugbyFixtureCard
                key={i}
                homeName={f.home.name.toUpperCase()}
                homeCode={f.home.short_code}
                awayName={f.away.name.toUpperCase()}
                awayCode={f.away.short_code}
                meta={{
                  left: new Date(f.kickoff).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <div className="rugby-panel p-4">
          <p className="text-xl mb-1">📋</p>
          <p className="rugby-cond text-sm mb-1 uppercase tracking-wide">Tournament Calls</p>
          <p className="text-xs" style={{ color: 'var(--rugby-text-dim)' }}>Winner, wooden spoon, top try scorer and more — locked in once before Round 1.</p>
        </div>
        <div className="rugby-panel p-4">
          <p className="text-xl mb-1">🎯</p>
          <p className="rugby-cond text-sm mb-1 uppercase tracking-wide">Weekly Match Picks</p>
          <p className="text-xs" style={{ color: 'var(--rugby-text-dim)' }}>Predict each score, then rank your confidence — get it wrong at high confidence and it costs you.</p>
        </div>
        <div className="rugby-panel p-4">
          <p className="text-xl mb-1">🏆</p>
          <p className="rugby-cond text-sm mb-1 uppercase tracking-wide">Dream Team</p>
          <p className="text-xs" style={{ color: 'var(--rugby-text-dim)' }}>Draft 6 players, up to 2 per nation, plus a kicker — score on tries, kicks, tackles, cards and more, all season.</p>
        </div>
      </div>

      <div className="rugby-panel rugby-panel--gold p-5 text-center">
        {user ? (
          <form action={joinRugbyCompetition}>
            <input type="hidden" name="competition_id" value={competition.id} />
            <p className="text-sm mb-3">Ready to pick your squad?</p>
            <button type="submit" className="rugby-button w-full sm:w-auto px-8 py-2.5">Join {competition.name}</button>
          </form>
        ) : (
          <>
            <p className="text-sm mb-3">Log in with your existing LMS All-Stars account, or create a new one — it&apos;s the same login for both games.</p>
            <Link href="/login?next=/rugby" className="rugby-button inline-block w-full sm:w-auto px-8 py-2.5">
              Log In / Sign Up
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
