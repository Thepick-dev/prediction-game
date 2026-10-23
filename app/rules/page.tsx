'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import SportingPanelLink from '../../components/SportingPanelLink'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import { RULES_TEXT } from '../lib/rulesText'
import { resolveRulesText } from '../lib/rulesTextOverrides'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'
import RulesTLDRShareCard from '../../components/RulesTLDRShareCard'

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
  const [bonusCardEnabled, setBonusCardEnabled] = useState(false)
  const [bonusCardConfigured, setBonusCardConfigured] = useState(false)
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [bankerEnabled, setBankerEnabled] = useState(true)
  const [bankerMultiplier, setBankerMultiplier] = useState(2)
  const [allOrNothingEnabled, setAllOrNothingEnabled] = useState(true)
  const [bonusCardMaxPlays, setBonusCardMaxPlays] = useState(1)
  const [autopickMultiplier, setAutopickMultiplier] = useState(1)
  const [rulesTextOverrides, setRulesTextOverrides] = useState<Record<string, string>>({})
  const [botEnabled, setBotEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showTLDR, setShowTLDR] = useState(false)

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
      .select('id, name, bonus_card_enabled, bonus_card_player_id, bonus_card_name')
      .eq('status', 'active')
      .single()

    if (competition) {
      // Its own isolated request, same reasoning as everywhere else this
      // pattern shows up — bot_enabled is a newer, optional column (Futzy),
      // and a problem reading it should never take the rest of the Rules
      // page (scoring numbers, AoN exclusions) down with it.
      const { data: botComp } = await supabase.from('competitions').select('bot_enabled').eq('id', competition.id).single()
      setBotEnabled(!!botComp?.bot_enabled)

      // Its own isolated, defensive fetch, same reasoning as bot_enabled
      // above — these are newer, optional per-competition columns, so a
      // problem reading them (or the columns not existing yet) should
      // never take the rest of the Rules page down, and just falls back
      // to the numbers every competition used before this feature existed.
      const { data: mechanicsComp } = await supabase
        .from('competitions')
        .select('banker_enabled, banker_multiplier, all_or_nothing_enabled, bonus_card_max_plays, autopick_score_multiplier, halve_autopick_points')
        .eq('id', competition.id)
        .single()
      setBankerEnabled(mechanicsComp?.banker_enabled ?? true)
      setBankerMultiplier(mechanicsComp?.banker_multiplier ?? 2)
      setAllOrNothingEnabled(mechanicsComp?.all_or_nothing_enabled ?? true)
      setBonusCardMaxPlays(mechanicsComp?.bonus_card_max_plays ?? 1)
      // autopick_score_multiplier supersedes the older halve_autopick_points
      // boolean — falls back to it for a competition created in the narrow
      // window before admin could set a specific amount (see scoring.ts).
      setAutopickMultiplier(mechanicsComp?.autopick_score_multiplier ?? (mechanicsComp?.halve_autopick_points ? 0.5 : 1))
      const [{ data: rules }, { data: playerRules }] = await Promise.all([
        supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competition.id),
        supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competition.id),
      ])

      const map: Record<string, number> = {}
      rules?.forEach(r => { map[`${r.result_type}_${r.quartile_diff}`] = r.points })
      setRuleMap(map)
      setGoalPts(playerRules?.find(r => r.event_type === 'goal')?.points ?? 12)
      setAssistPts(playerRules?.find(r => r.event_type === 'assist')?.points ?? 6)

      setBonusCardEnabled(!!competition.bonus_card_enabled)
      setBonusCardConfigured(competition.bonus_card_player_id != null)
      if (competition.bonus_card_player_id != null) {
        const { data: player } = await supabase.from('players').select('id, name, web_name, team_id').eq('id', competition.bonus_card_player_id).single()
        if (player) {
          const { data: team } = await supabase.from('teams').select('short_code, short_name, name').eq('id', player.team_id).single()
          const resolvedName = buildPlayerDisplayNames([player], team ? { [player.team_id]: team } : {})[player.id] ?? null
          setBonusCardName(bonusCardDisplayName(competition.bonus_card_name, resolvedName))
        }
      } else {
        setBonusCardName(bonusCardDisplayName(competition.bonus_card_name, null))
      }
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

    // Its own isolated query — a brand new table, so a problem reading it
    // (or the SQL not being run yet) should just mean the hardcoded
    // defaults keep showing, exactly as before this existed.
    try {
      const { data: overridesData } = await supabase.from('rules_text_overrides').select('section_key, content')
      const map: Record<string, string> = {}
      overridesData?.forEach(o => { map[o.section_key] = o.content })
      setRulesTextOverrides(map)
    } catch {}

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="RULES" theme={popArt ? 'pop-art' : 'classic'} loading={loading}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  // Admin-editable text, merged onto the hardcoded defaults — same shape
  // as RULES_TEXT, so every reference below just reads from this instead.
  const rt = resolveRulesText(rulesTextOverrides)

  if (popArt) {
    return (
      <>
      <Shell active="RULES" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-6 mt-2">
            <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl">Rules</h1>
            <button onClick={() => setShowTLDR(true)} className="pop-button pop-button--blue px-3 py-1.5 text-xs">
              📱 TL;DR
            </button>
          </div>

          <div className="space-y-5">

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">The Competition</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.competition[0]}</p>
              <p className="text-sm leading-relaxed font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{rt.competition[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Weekly Picks</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.weeklyPicks[0]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.weeklyPicks[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Quartiles</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.quartiles[0]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.quartiles[1]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.quartiles[2]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-3">Scoring</h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.scoringIntro}</p>

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
              <h2 className="pop-headline text-sm mb-2">Your Picks Stay Private</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.pickPrivacy[0]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.pickPrivacy[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">The Tier Draft</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.tierDraft[0]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.tierDraft[1]}</p>
            </section>

            {bankerEnabled && (
              <section className="pop-panel p-5">
                <h2 className="pop-headline text-sm mb-2">The Banker</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {bankerMultiplier === 2 ? rt.banker[0] :
                    `Two bankers per competition. A banker multiplies your entire gameweek score by ${bankerMultiplier}x — team and both players. Declare it with your pick. Unused bankers are worth nothing. Bankers are never applied to autopicks.`}
                </p>
              </section>
            )}

            {allOrNothingEnabled && (
              <section className="pop-panel p-5">
                <h2 className="pop-headline text-sm mb-2">All or Nothing</h2>
                <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.allOrNothing[0]}</p>
                <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.allOrNothing[1]}</p>
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
            )}

            {bonusCardEnabled && (
              <section className="pop-panel p-5">
                <h2 className="pop-headline text-sm mb-2">{bonusCardName}</h2>
                <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {bonusCardMaxPlays === 1 ? rt.bonusCard[0] :
                    `Some competitions have a Bonus Card — one or more nominated players, chosen by the admin, that every entrant can play up to ${bonusCardMaxPlays} times across the whole competition, in any gameweeks of their choosing, up until that gameweek's normal deadline.`}
                </p>
                <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.bonusCard[1]}</p>
                <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.bonusCard[2]}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.bonusCard[3]}</p>
              </section>
            )}

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Autopick</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.autopick[0]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.autopick[1]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.autopick[2]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.autopick[3]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.autopick[4]}</p>
              {autopickMultiplier !== 1 && (
                <p className="text-sm leading-relaxed mt-2 font-bold" style={{ color: 'var(--pop-orange)' }}>
                  In this competition, an autopick scores {autopickMultiplier === 0 ? 'no points at all' : `${Math.round(autopickMultiplier * 100)}% of the usual points`} —
                  team and both players — even when it would otherwise count as a banker-free, ordinary pick.
                  Making your own pick in time always scores in full.
                </p>
              )}
            </section>

            {botEnabled && (
              <section className="pop-panel p-5">
                <h2 className="pop-headline text-sm mb-2">🤖 Futzy</h2>
                <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.futzy[0]}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.futzy[1]}</p>
              </section>
            )}

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">👻 Ghost Players</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.ghostPlayers[0]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.ghostPlayers[1]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">🟨🟥 Yellow &amp; Red Cards</h2>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.discipline[0]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.discipline[1]}</p>
              <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.discipline[2]}</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{rt.discipline[3]}</p>
            </section>

            <section className="pop-panel p-5">
              <h2 className="pop-headline text-sm mb-2">Tiebreakers</h2>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
                If two players are tied on total points, the following criteria apply in order:
              </p>
              <ol className="text-sm leading-relaxed list-decimal pl-5 space-y-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {rt.tiebreakers.map(t => <li key={t}>{t}</li>)}
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
      {showTLDR && (
        <RulesTLDRShareCard
          bonusCardName={bonusCardName}
          showBonusCard={bonusCardConfigured}
          onClose={() => setShowTLDR(false)}
          popArt
        />
      )}
      </>
    )
  }

  const cardClass = "bg-white/5 border border-white/10 rounded-lg p-6"

  return (
    <>
    <Shell active="RULES" user={user} displayName={displayName}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          <div className="flex items-start justify-between gap-3 flex-wrap mb-8">
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Rules</h1>
            <button
              onClick={() => setShowTLDR(true)}
              className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors"
            >
              📱 TL;DR
            </button>
          </div>

          <div className="space-y-6">

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Competition</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.competition[0]}</p>
              <p className="text-sm text-[#F5ECD9]/90 leading-relaxed font-medium">{rt.competition[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Tier Draft</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.tierDraft[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.tierDraft[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Weekly Picks</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.weeklyPicks[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.weeklyPicks[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Banker</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.banker[0]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">All or Nothing</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.allOrNothing[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.allOrNothing[1]}</p>
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

            {bonusCardEnabled && (
              <section className={cardClass}>
                <h2 className="text-lg font-bold mb-3 text-[#D9A441]">{bonusCardName}</h2>
                <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.bonusCard[0]}</p>
                <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.bonusCard[1]}</p>
                <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.bonusCard[2]}</p>
                <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.bonusCard[3]}</p>
              </section>
            )}

            {botEnabled && (
              <section className={cardClass}>
                <h2 className="text-lg font-bold mb-3 text-[#D9A441]">🤖 Futzy</h2>
                <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.futzy[0]}</p>
                <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.futzy[1]}</p>
              </section>
            )}

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">👻 Ghost Players</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.ghostPlayers[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.ghostPlayers[1]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Autopick</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.autopick[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.autopick[1]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.autopick[2]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.autopick[3]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.autopick[4]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Quartiles</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.quartiles[0]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">{rt.quartiles[1]}</p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">{rt.quartiles[2]}</p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Scoring</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-4">{rt.scoringIntro}</p>

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
                {rt.tiebreakers.map(t => <li key={t}>{t}</li>)}
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
    {showTLDR && (
      <RulesTLDRShareCard
        bonusCardName={bonusCardName}
        showBonusCard={bonusCardConfigured}
        onClose={() => setShowTLDR(false)}
      />
    )}
    </>
  )
}
