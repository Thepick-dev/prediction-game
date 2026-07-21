import { createServerSupabaseClient } from '../lib/supabase-server'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'

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

  const cardClass = "bg-white/5 border border-white/10 rounded-lg p-6"

  return (
    <Shell active="LAWS OF THE GAME" user={user} displayName={profile?.display_name ?? undefined}>
      <HeroPage wide>
        <div className="w-full text-[#F5ECD9]">

          <h1 className="text-3xl font-bold mb-8" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Laws of the Game</h1>

          <div className="space-y-6">

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Competition</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                The competition runs for roughly half a Premier League season — two competitions per season.
                Join before the first gameweek deadline. Late entries are not permitted.
              </p>
              <p className="text-sm text-[#F5ECD9]/90 leading-relaxed font-medium">
                The player with the most points at the end of the competition wins.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Tier Draft</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                Before joining, pick one team from each tier. These are your double-use teams — usable twice during the competition instead of once.
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">
                Tier picks are visible to all players and locked after the first gameweek deadline.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Weekly Picks</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                Each gameweek, pick one team and two different players before the deadline.
                Each team is usable once (twice for tier picks). Each player is usable twice per competition.
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">
                Picks can be edited until the deadline, then locked and visible to everyone.
                Miss the deadline and you receive an autopick — the lowest available team in the table and two random players, clearly marked.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">The Banker</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">
                Two bankers per competition. A banker doubles your entire gameweek score — team and both players.
                Declare it with your pick. Unused bankers are worth nothing. Bankers are never applied to autopicks.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Quartiles</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                The 20 Premier League clubs are divided into four quartiles of five — Q1 (strongest) to Q4 (weakest).
                Quartiles are used to calculate team points based on the difficulty of the result.
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-2">
                For the first six gameweeks of each competition, quartiles are fixed based on outright betting odds at the start of the season.
                From gameweek seven onwards, quartiles are determined by the current league table.
              </p>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed">
                Quartiles are locked at the point each gameweek deadline passes — past scores are never affected by future quartile changes.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Scoring</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-4">
                Team points depend on the result and the quartile differential between your team and their opponent.
                ↑ means your team is the underdog, ↓ means favourite. Bigger upsets, bigger points.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-white/10">
                  <thead>
                    <tr style={{ backgroundColor: '#241a12' }} className="text-[#D9A441]">
                      <th className="text-left px-3 py-2 uppercase">Result</th>
                      {diffLabels.map(l => <th key={l} className="px-2 py-2 text-center">{l}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {resultTypes.map(([key, label]) => (
                      <tr key={key} className="border-t border-white/10">
                        <td className="px-3 py-2 font-medium uppercase">{label}</td>
                        {diffs.map(d => (
                          <td key={d} className="px-2 py-2 text-center">
                            {ruleMap[`${key}_${d}`] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t border-white/10">
                      <td className="px-3 py-2 font-medium uppercase">Loss</td>
                      {diffs.map(d => <td key={d} className="px-2 py-2 text-center">0</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-[#F5ECD9]/80 mt-4">
                <strong className="text-[#D9A441]">Player points:</strong> Goal = {goalPts}pts. Assist = {assistPts}pts.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]">Tiebreakers</h2>
              <p className="text-sm text-[#F5ECD9]/80 leading-relaxed mb-3">
                If two players are tied on total points, the following criteria apply in order:
              </p>
              <ol className="text-sm text-[#F5ECD9]/80 leading-relaxed list-decimal pl-5 space-y-1">
                <li>Total points</li>
                <li>Points with banker multiplier removed</li>
                <li>Most away wins from picked teams</li>
                <li>Most goals from picked players</li>
                <li>Earliest competition entry</li>
              </ol>
            </section>

          </div>

        </div>
      </HeroPage>
    </Shell>
  )
}