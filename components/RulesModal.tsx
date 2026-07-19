'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'

interface RulesModalProps {
  onClose: () => void
}

export default function RulesModal({ onClose }: RulesModalProps) {
  const [loading, setLoading] = useState(true)
  const [ruleMap, setRuleMap] = useState<Record<string, number>>({})
  const [goalPts, setGoalPts] = useState(12)
  const [assistPts, setAssistPts] = useState(6)

  const diffs = [-3, -2, -1, 0, 1, 2, 3]
  const diffLabels = ['3↓', '2↓', '1↓', '=', '1↑', '2↑', '3↑']
  const resultTypes = [
    ['home_win', 'Home Win'],
    ['away_win', 'Away Win'],
    ['home_draw', 'Home Draw'],
    ['away_draw', 'Away Draw'],
  ]

  useEffect(() => { loadRules() }, [])

  async function loadRules() {
    const supabase = createClient()

    const { data: competition } = await supabase
      .from('competitions')
      .select('id')
      .eq('status', 'active')
      .single()

    if (!competition) { setLoading(false); return }

    const [{ data: rules }, { data: playerRules }] = await Promise.all([
      supabase.from('competition_scoring_rules').select('result_type, quartile_diff, points').eq('competition_id', competition.id),
      supabase.from('player_scoring_rules').select('event_type, points').eq('competition_id', competition.id)
    ])

    const map: Record<string, number> = {}
    rules?.forEach(r => { map[`${r.result_type}_${r.quartile_diff}`] = r.points })
    setRuleMap(map)

    setGoalPts(playerRules?.find(r => r.event_type === 'goal')?.points ?? 12)
    setAssistPts(playerRules?.find(r => r.event_type === 'assist')?.points ?? 6)

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#f5ecd9] rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#f5ecd9] border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Laws of the Game</h2>
          <button onClick={onClose} className="text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading rules...</p>
          ) : (
            <>
              <section>
                <h3 className="font-bold mb-2">The Competition</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  The competition runs for roughly half a Premier League season. Join before the first gameweek deadline. The player with the most points at the end of the competition wins.
                </p>
              </section>

              <section>
                <h3 className="font-bold mb-2">The Tier Draft</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Before joining, pick one team from each tier. These are your double-use teams — usable twice during the competition instead of once.
                </p>
              </section>

              <section>
                <h3 className="font-bold mb-2">Weekly Picks</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Each gameweek, pick one team and two different players before the deadline. Each team is usable once (twice for tier picks). Each player is usable twice per competition.
                </p>
              </section>

              <section>
                <h3 className="font-bold mb-2">The Banker</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Two bankers per competition. A banker doubles your entire gameweek score — team and both players.
                </p>
              </section>

              <section>
                <h3 className="font-bold mb-2">Quartiles</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  The 20 Premier League clubs are divided into four quartiles of five. For the first six gameweeks, quartiles are fixed based on outright betting odds. From gameweek seven, quartiles follow the current league table.
                </p>
              </section>

              <section>
                <h3 className="font-bold mb-2">Scoring</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Team points depend on the result and the quartile differential between your team and their opponent. ↑ means your team is the underdog, ↓ means favourite.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border">
                    <thead>
                      <tr className="bg-gray-900 text-white">
                        <th className="text-left px-3 py-2 uppercase">Result</th>
                        {diffLabels.map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {resultTypes.map(([key, label]) => (
                        <tr key={key} className="border-t">
                          <td className="px-3 py-2 font-medium uppercase">{label}</td>
                          {diffs.map(d => (
                            <td key={d} className="px-2 py-2 text-center">
                              {ruleMap[`${key}_${d}`] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t">
                        <td className="px-3 py-2 font-medium uppercase">Loss</td>
                        {diffs.map(d => <td key={d} className="px-2 py-2 text-center">0</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-gray-600 mt-4">
                  <strong>Player points:</strong> Goal = {goalPts}pts. Assist = {assistPts}pts.
                </p>
              </section>

              <section>
                <h3 className="font-bold mb-2">Tiebreakers</h3>
                <ol className="text-sm text-gray-600 leading-relaxed list-decimal pl-5 space-y-1">
                  <li>Total points</li>
                  <li>Points with banker multiplier removed</li>
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