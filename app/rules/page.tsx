'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import SportingPanelLink from '../../components/SportingPanelLink'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import { RULES_TEXT } from '../lib/rulesText'

const DIFFS = [-3, -2, -1, 0, 1, 2, 3]
const DIFF_LABELS = ['3↓', '2↓', '1↓', '=', '1↑', '2↑', '3↑']
const RESULT_TYPES: [string, string][] = [
  ['home_win', 'Home Win'],
  ['away_win', 'Away Win'],
  ['home_draw', 'Home Draw'],
  ['away_draw', 'Away Draw'],
]

export default function RulesPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [ruleMap, setRuleMap] = useState<Record<string, number>>({})
  const [goalPts, setGoalPts] = useState(12)
  const [assistPts, setAssistPts] = useState(6)
  const [aonExclusions, setAonExclusions] = useState<{ name: string; reason: string }[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    if (authUser) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const { data: competition } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('status', 'active')
      .single()

    if (competition) {
      const [{ data: rules }, { data: playerRules }] = await Promise.all([
        supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competition.id),
        supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competition.id),
      ])

      const map: Record<string, number> = {}
      rules?.forEach(r => { map[`${r.result_type}_${r.quartile_diff}`] = r.points })
      setRuleMap(map)
      setGoalPts(playerRules?.find(r => r.event_type === 'goal')?.points ?? 12)
      setAssistPts(playerRules?.find(r => r.event_type === 'assist')?.points ?? 6)
    }

    // Its own isolated query, same reasoning as everywhere else this
    // pattern shows up — an admin-managed, entirely optional list, so a
    // problem here should never take the rest of the Rules page down.
    const { data: exclusionsData } = await supabase
      .from('all_or_nothing_exclusions')
      .select('reason, players(name)')
    setAonExclusions(
      (exclusionsData ?? [])
        .map((e: any) => ({ name: e.players?.name ?? 'Unknown player', reason: e.reason }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
    )

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="RULES" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell active="RULES" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">

          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-6 mt-2">Rules</h1>

          <div className="space-y-5">

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">The Competition</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.competition[0]}</p>
              <p className="text-sm leading-relaxed font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{RULES_TEXT.competition[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">The Tier Draft</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.tierDraft[0]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.tierDraft[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Weekly Picks</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.weeklyPicks[0]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.weeklyPicks[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Autopick</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Miss the deadline and the site picks for you automatically: the lowest-placed available team in the
                league table, and two players who haven&apos;t already been used twice.
              </p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Players are drawn from those valued at £5.5m or more on Fantasy Premier League — a deliberately
                recognisable pool of well-known names, not a random pick from the entire player list. (If that pool
                has run too low for you specifically late in a season, it falls back to any available player rather
                than skip your pick entirely.)
              </p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Autopicks are marked clearly wherever they appear, and a banker is never applied to one.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                If an autopicked team or player has a double gameweek, the pick defaults to whichever of the two
                matches is against the higher-placed opponent — the tougher game, in keeping with the rest of the
                scoring rewarding an upset. This only applies to autopick: if you pick a double-gameweek team or
                player yourself, you choose the match it&apos;s for.
              </p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">The Banker</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.banker[0]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">All or Nothing</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.allOrNothing[0]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.allOrNothing[1]}</p>
              {aonExclusions.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-bold mb-1.5" style={{ color: 'var(--pop-blue)' }}>Exclusions</p>
                  <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    These players can&apos;t be nominated for All or Nothing:
                  </p>
                  <ul className="text-sm leading-relaxed list-disc pl-5 space-y-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {aonExclusions.map((e, i) => (
                      <li key={i}><strong>{e.name}</strong> — {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Quartiles</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.quartiles[0]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.quartiles[1]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.quartiles[2]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-3">Scoring</h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>{RULES_TEXT.scoringIntro}</p>

              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-xs" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--pop-blue)' }}>
                      <th className="text-left px-3 py-2 uppercase">Result</th>
                      {DIFF_LABELS.map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {RESULT_TYPES.map(([key, label]) => (
                      <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td className="px-3 py-2 font-bold uppercase">{label}</td>
                        {DIFFS.map(d => (
                          <td key={d} className="px-2 py-2 text-center" style={{ color: 'rgba(255,255,255,0.8)' }}>
                            {ruleMap[`${key}_${d}`] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <td className="px-3 py-2 font-bold uppercase">Loss</td>
                      {DIFFS.map(d => <td key={d} className="px-2 py-2 text-center" style={{ color: 'rgba(255,255,255,0.8)' }}>0</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-sm mt-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <strong style={{ color: 'var(--pop-blue)' }}>Player points:</strong> Goal = {goalPts}pts. Assist = {assistPts}pts.
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Assists here follow the Fantasy Premier League&apos;s own official definition, since that&apos;s where our
                match data comes from — it&apos;s a bit broader than what you might see credited on TV or in a matchday
                report. It can include things like a blocked or deflected effort that a teammate follows up and scores
                from, or winning a penalty or free-kick that a teammate then converts, not just a clean final pass. If
                a player&apos;s assist tally here doesn&apos;t match what you saw in the highlights, this is usually why.
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Double gameweeks:</strong> occasionally a rearranged fixture means a
                club plays twice in the same gameweek. If a player you&apos;ve picked is affected, you&apos;ll be asked to
                choose which of the two matches your pick counts for — you don&apos;t get both games&apos; goals/assists added
                together. If that choice isn&apos;t made, the pick scores zero for that player rather than guessing.
              </p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Tiebreakers</h2>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
                If two players are tied on total points, the following criteria apply in order:
              </p>
              <ol className="text-sm leading-relaxed list-decimal pl-5 space-y-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {RULES_TEXT.tiebreakers.map(t => <li key={t}>{t}</li>)}
              </ol>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Gameweek Scheduling</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Gameweeks here don&apos;t always follow the Fantasy Premier League&apos;s own gameweek boundaries
                exactly. The guiding principle is to avoid a gameweek containing only a small handful of matches —
                where sticking to FPL&apos;s own grouping would do that, <SportingPanelLink popArt>the Sporting Panel</SportingPanelLink> may
                group fixtures into gameweeks differently instead.
              </p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Postponements</h2>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
                What happens when a fixture is postponed is always at the discretion of <SportingPanelLink popArt>the Sporting Panel</SportingPanelLink>.
                As a general guide:
              </p>
              <ul className="text-sm leading-relaxed list-disc pl-5 space-y-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <li>If a game is cancelled well in advance, affected players will normally be given the chance to choose again — unless doing so would be manifestly unfair to everyone else.</li>
                <li>If a relevant game is postponed at short notice, once a gameweek is already underway, the Panel will convene to vote on what happens.</li>
                <li>Any Panel member with a strong personal interest in the outcome — for example, it&apos;s their own pick affected — must recuse themselves from that vote.</li>
              </ul>
            </section>

          </div>

        </div>
      </Shell>
    )
  }

  const cardClass = "bg-white/5 border border-white/10 rounded-lg p-6"

  return (
    <Shell active="RULES" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          <h1 className="text-3xl font-bold mb-8" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Rules</h1>

          <div className="space-y-6">

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Competition</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.competition[0]}</p>
              <p className="text-sm text-[#F5ECD9]/90 leading-relaxed font-medium">{RULES_TEXT.competition[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Tier Draft</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.tierDraft[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{RULES_TEXT.tierDraft[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Weekly Picks</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.weeklyPicks[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{RULES_TEXT.weeklyPicks[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Autopick</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                Miss the deadline and the site picks for you automatically: the lowest-placed available team in the
                league table, and two players who haven&apos;t already been used twice.
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                Players are drawn from those valued at £5.5m or more on Fantasy Premier League — a deliberately
                recognisable pool of well-known names, not a random pick from the entire player list. (If that pool
                has run too low for you specifically late in a season, it falls back to any available player rather
                than skip your pick entirely.)
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                Autopicks are marked clearly wherever they appear, and a banker is never applied to one.
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">
                If an autopicked team or player has a double gameweek, the pick defaults to whichever of the two
                matches is against the higher-placed opponent — the tougher game, in keeping with the rest of the
                scoring rewarding an upset. This only applies to autopick: if you pick a double-gameweek team or
                player yourself, you choose the match it&apos;s for.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Banker</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{RULES_TEXT.banker[0]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">All or Nothing</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.allOrNothing[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.allOrNothing[1]}</p>
              {aonExclusions.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-bold text-[#D9A441] mb-1.5">Exclusions</p>
                  <p className="text-sm text-[#F5ECD9]/60 leading-relaxed mb-2">
                    These players can&apos;t be nominated for All or Nothing:
                  </p>
                  <ul className="text-sm text-[#F5ECD9]/80 leading-relaxed list-disc pl-5 space-y-1">
                    {aonExclusions.map((e, i) => (
                      <li key={i}><strong>{e.name}</strong> — {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Quartiles</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.quartiles[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{RULES_TEXT.quartiles[1]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{RULES_TEXT.quartiles[2]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Scoring</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-4">{RULES_TEXT.scoringIntro}</p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-white/10">
                  <thead>
                    <tr style={{ backgroundColor: '#241a12' }} className="text-[#D9A441]">
                      <th className="text-left px-3 py-2 uppercase">Result</th>
                      {DIFF_LABELS.map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {RESULT_TYPES.map(([key, label]) => (
                      <tr key={key} className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium uppercase">{label}</td>
                        {DIFFS.map(d => (
                          <td key={d} className="px-2 py-2 text-center">
                            {ruleMap[`${key}_${d}`] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t border-white/10">
                      <td className="px-3 py-2 font-medium uppercase">Loss</td>
                      {DIFFS.map(d => <td key={d} className="px-2 py-2 text-center">0</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-[#F5ECD9]/80 mt-4">
                <strong className="text-[#D9A441]">Player points:</strong> Goal = {goalPts}pts. Assist = {assistPts}pts.
              </p>
              <p className="text-sm text-[#F5ECD9]/60 mt-2 leading-relaxed">
                Assists here follow the Fantasy Premier League&apos;s own official definition, since that&apos;s where our
                match data comes from — it&apos;s a bit broader than what you might see credited on TV or in a matchday
                report. It can include things like a blocked or deflected effort that a teammate follows up and scores
                from, or winning a penalty or free-kick that a teammate then converts, not just a clean final pass. If
                a player&apos;s assist tally here doesn&apos;t match what you saw in the highlights, this is usually why.
              </p>
              <p className="text-sm text-[#F5ECD9]/60 mt-2 leading-relaxed">
                <strong className="text-[#D9A441]/80">Double gameweeks:</strong> occasionally a rearranged fixture means a
                club plays twice in the same gameweek. If a player you&apos;ve picked is affected, you&apos;ll be asked to
                choose which of the two matches your pick counts for — you don&apos;t get both games&apos; goals/assists added
                together. If that choice isn&apos;t made, the pick scores zero for that player rather than guessing.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Tiebreakers</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-3">
                If two players are tied on total points, the following criteria apply in order:
              </p>
              <ol className="text-sm text-[#F5ECD9]/80 leading-relaxed list-decimal pl-5 space-y-1">
                {RULES_TEXT.tiebreakers.map(t => <li key={t}>{t}</li>)}
              </ol>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Gameweek Scheduling</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">
                Gameweeks here don&apos;t always follow the Fantasy Premier League&apos;s own gameweek boundaries
                exactly. The guiding principle is to avoid a gameweek containing only a small handful of matches —
                where sticking to FPL&apos;s own grouping would do that, <SportingPanelLink>the Sporting Panel</SportingPanelLink> may
                group fixtures into gameweeks differently instead.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Postponements</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-3">
                What happens when a fixture is postponed is always at the discretion of <SportingPanelLink>the Sporting Panel</SportingPanelLink>.
                As a general guide:
              </p>
              <ul className="text-sm text-[#F5ECD9]/80 leading-relaxed list-disc pl-5 space-y-2">
                <li>If a game is cancelled well in advance, affected players will normally be given the chance to choose again — unless doing so would be manifestly unfair to everyone else.</li>
                <li>If a relevant game is postponed at short notice, once a gameweek is already underway, the Panel will convene to vote on what happens.</li>
                <li>Any Panel member with a strong personal interest in the outcome — for example, it&apos;s their own pick affected — must recuse themselves from that vote.</li>
              </ul>
            </section>

          </div>

        </div>
      </HeroPage>
    </Shell>
  )
}
