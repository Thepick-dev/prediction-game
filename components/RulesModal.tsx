'use client'

import { useState, useEffect } from 'react'

interface RulesModalProps {
  onClose: () => void
}

// Only ever shown on the login page, which is always pop-art (there's no
// classic variant pre-login — the classic toggle lives on /admin, reachable
// only once you're already in), so this doesn't need a dual-theme branch
// like most other components — it can just commit to pop-art outright.
export default function RulesModal({ onClose }: RulesModalProps) {
  const [loading, setLoading] = useState(true)
  const [ruleMap, setRuleMap] = useState<Record<string, number>>({})
  const [goalPts, setGoalPts] = useState(12)
  const [assistPts, setAssistPts] = useState(6)
  const [exclusions, setExclusions] = useState<{ name: string; reason: string }[]>([])

  const diffs = [-3, -2, -1, 0, 1, 2, 3]
  const diffLabels = ['3↓', '2↓', '1↓', '=', '1↑', '2↑', '3↑']
  const resultTypes = [
    ['home_win', 'Home Win'],
    ['away_win', 'Away Win'],
    ['home_draw', 'Home Draw'],
    ['away_draw', 'Away Draw'],
  ]

  useEffect(() => { loadRules() }, [])

  // Pulled from a public API route, not a direct Supabase read — this modal
  // is shown on the login page, before anyone has an account, so it can't
  // rely on a session. This is also what keeps it from going stale again:
  // it's the same live scoring data the real /rules page reads, not a
  // hand-copied snapshot.
  async function loadRules() {
    try {
      const res = await fetch('/api/public/rules-summary')
      const data = await res.json()

      const map: Record<string, number> = {}
      ;(data.scoringRules ?? []).forEach((r: any) => { map[`${r.result_type}_${r.quartile_diff}`] = r.points })
      setRuleMap(map)
      setGoalPts(data.goalPoints ?? 12)
      setAssistPts(data.assistPoints ?? 6)
      setExclusions(data.exclusions ?? [])
    } catch {
      // leave defaults in place
    }
    setLoading(false)
  }

  return (
    <div className="pop-art-theme fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--pop-surface)', border: '2px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }}
      >
        <div
          className="sticky top-0 px-6 py-4 flex items-center justify-between"
          style={{ background: 'var(--pop-surface)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}
        >
          <h2 className="pop-hero pop-hero--pink text-2xl">Rules</h2>
          <button onClick={onClose} className="text-2xl leading-none" style={{ color: 'rgba(255,255,255,0.6)' }}>&times;</button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading rules...</p>
          ) : (
            <>
              <section>
                <h3 className="pop-headline text-sm mb-2">The Competition</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  The competition runs for roughly half a Premier League season — two competitions per season.
                  Join before the first gameweek deadline. Late entries are not permitted. The player with the
                  most points at the end of the competition wins.
                </p>
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-2">The Tier Draft</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Before joining, pick one team from each tier. These are your double-use teams — usable twice during the competition instead of once.
                </p>
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-2">Weekly Picks</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Each gameweek, pick one team and two different players before the deadline. Each team is usable once (twice for tier picks). Each player is usable twice per competition.
                </p>
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-2">The Banker</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Two bankers per competition. A banker doubles your entire gameweek score — team and both players.
                </p>
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-2">All or Nothing</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Once per competition, nominate one of your two weekly picks — but only a player you haven&apos;t
                  used at all yet. Score or assist that gameweek and you get a bonus third use of them; blank, and
                  you lose all remaining uses of them.
                </p>
                {exclusions.length > 0 && (
                  <p className="text-xs leading-relaxed mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Excluded players:</strong> {exclusions.map(e => e.name).join(', ')}.
                  </p>
                )}
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-2">Quartiles</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  The 20 Premier League clubs are divided into four quartiles of five. Betting odds only ever set
                  the quartiles once — gameweek 1 of the very first competition of a season — after that, every
                  gameweek uses the current real league table instead.
                </p>
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-3">Scoring</h3>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Team points depend on the result and the quartile differential between your team and their opponent. ↑ means your team is the underdog, ↓ means favourite.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table className="w-full text-xs" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--pop-blue)' }}>
                        <th className="text-left px-3 py-2 uppercase">Result</th>
                        {diffLabels.map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {resultTypes.map(([key, label]) => (
                        <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <td className="px-3 py-2 font-bold uppercase">{label}</td>
                          {diffs.map(d => (
                            <td key={d} className="px-2 py-2 text-center" style={{ color: 'rgba(255,255,255,0.8)' }}>
                              {ruleMap[`${key}_${d}`] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td className="px-3 py-2 font-bold uppercase">Loss</td>
                        {diffs.map(d => <td key={d} className="px-2 py-2 text-center" style={{ color: 'rgba(255,255,255,0.8)' }}>0</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-sm mt-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <strong style={{ color: 'var(--pop-blue)' }}>Player points:</strong> Goal = {goalPts}pts. Assist = {assistPts}pts.
                </p>
              </section>

              <section>
                <h3 className="pop-headline text-sm mb-2">Tiebreakers</h3>
                <ol className="text-sm leading-relaxed list-decimal pl-5 space-y-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <li>Total points</li>
                  <li>Points with banker multiplier removed</li>
                  <li>Highest score in a single gameweek (banker included)</li>
                  <li>Most away wins from picked teams</li>
                  <li>Most goals from picked players</li>
                  <li>Earliest competition entry</li>
                </ol>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
