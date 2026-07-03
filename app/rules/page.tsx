import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'

export default async function RulesPage() {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    : { data: null }

  const { data: competition } = await supabase
    .from('competitions')
    .select('id, name')
    .eq('status', 'active')
    .single()

  const { data: rules } = competition ? await supabase
    .from('competition_scoring_rules')
    .select('result_type, quartile_diff, points')
    .eq('competition_id', competition.id) : { data: null }

  const { data: playerRules } = competition ? await supabase
    .from('player_scoring_rules')
    .select('event_type, points')
    .eq('competition_id', competition.id) : { data: null }

  const ruleMap: Record<string, number> = {}
  rules?.forEach(r => { ruleMap[`${r.result_type}_${r.quartile_diff}`] = r.points })

  const goalPts = playerRules?.find(r => r.event_type === 'goal')?.points ?? 12
  const assistPts = playerRules?.find(r => r.event_type === 'assist')?.points ?? 6

  const diffs = [-3, -2, -1, 0, 1, 2, 3]
  const diffLabels = ['3↓', '2↓', '1↓', '=', '1↑', '2↑', '3↑']
  const resultTypes = [
    ['home_win', 'Home Win'],
    ['away_win', 'Away Win'],
    ['home_draw', 'Home Draw'],
    ['away_draw', 'Away Draw'],
  ]

  return (
    <Shell active="RULES" user={user} displayName={profile?.display_name ?? undefined}>

      <h1 className="text-3xl font-bold mb-8">Rules</h1>

      <div className="space-y-6 max-w-2xl">

        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-bold mb-3">The Competition</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            The Coupon runs for roughly half a Premier League season — two competitions per season.
            Join before the first gameweek deadline. Late entries are not permitted.
          </p>
        </section>

        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-bold mb-3">The Tier Draft</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-2">
            Before joining, pick one team from each tier. These are your double-use teams — usable twice during the competition instead of once.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Tier picks are visible to all players and locked after the first gameweek deadline.
          </p>
        </section>

        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-bold mb-3">Weekly Picks</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-2">
            Each gameweek, pick one team and two different players before the deadline.
            Each team is usable once (twice for tier picks). Each player is usable twice per competition.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Picks can be edited until the deadline, then locked and visible to everyone.
            Miss the deadline and you receive an autopick — the lowest available team in the table and two random players, clearly marked.
          </p>
        </section>

        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-bold mb-3">The Banker</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Two bankers per competition. A banker doubles your entire gameweek score — team and both players.
            Declare it with your pick. Unused bankers are worth nothing. Bankers are never applied to autopicks.
          </p>
        </section>

        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-bold mb-3">Scoring</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Team points depend on the result and the quartile differential between your team and their opponent.
            ↑ means your team is the underdog, ↓ means favourite. Bigger upsets, bigger points.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-3 py-2">Result</th>
                  {diffLabels.map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {resultTypes.map(([key, label]) => (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-2 font-medium">{label}</td>
                    {diffs.map(d => (
                      <td key={d} className="px-2 py-2 text-center">
                        {ruleMap[`${key}_${d}`] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t">
                  <td className="px-3 py-2 font-medium">Loss</td>
                  {diffs.map(d => <td key={d} className="px-2 py-2 text-center">0</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-sm text-gray-600 mt-4">
            <strong>Player points:</strong> Goal = {goalPts}pts. Assist = {assistPts}pts.
          </p>
        </section>

        <section className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-bold mb-3">Tiebreakers</h2>
          <ol className="text-sm text-gray-600 leading-relaxed list-decimal pl-5 space-y-1">
            <li>Total points</li>
            <li>Points with banker multiplier removed</li>
            <li>Most away wins from picked teams</li>
            <li>Most goals from picked players</li>
            <li>Earliest competition entry</li>
          </ol>
        </section>

      </div>

    </Shell>
  )
}