import Nav from '../components/nav'
import { createServerSupabaseClient } from '../lib/supabase-server'

export default async function RulesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user ? await supabase.from('profiles').select('display_name').eq('id', user.id).single() : { data: null }

  return (
    <>
      <Nav user={user} displayName={profile?.display_name ?? undefined} />

      <main className="max-w-2xl mx-auto px-4 py-8">

        <div className="border-b-2 border-coupon-ink pb-6 mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-coupon-muted mb-2">How To Play</p>
          <h1 className="font-display text-4xl font-bold">The Rules</h1>
        </div>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="font-display text-xl font-bold mb-3 pb-2 border-b border-coupon-rule">The Competition</h2>
            <p className="mb-3">The Coupon runs for roughly half a Premier League season. There are two competitions per season — one for each half. Each competition is self-contained with its own picks, points and leaderboard.</p>
            <p>Join before the first gameweek deadline. Late entries are not permitted.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold mb-3 pb-2 border-b border-coupon-rule">The Tier Draft</h2>
            <p className="mb-3">Before joining, each player completes a tier draft. The admin divides the 20 Premier League clubs into tiers. You pick one team from each tier — these are your double-use teams. You may use each of them twice during the competition instead of the usual once.</p>
            <p className="mb-3">Tier picks are visible to all players immediately. They can be changed up until the first gameweek deadline, after which they are locked for the duration of the competition.</p>
            <p>Choose wisely. A well-chosen tier pick used at the right moment is often the difference between winning and losing.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold mb-3 pb-2 border-b border-coupon-rule">Weekly Picks</h2>
            <p className="mb-3">Each gameweek, before the deadline, select:</p>
            <ul className="space-y-2 mb-3 pl-4">
              <li className="flex gap-2"><span className="font-mono text-coupon-green">—</span><span><strong>One team</strong> from the Premier League. Each team may only be used once across the competition, unless it is one of your tier draft picks.</span></li>
              <li className="flex gap-2"><span className="font-mono text-coupon-green">—</span><span><strong>Two players</strong> from any Premier League club. Each player may be selected at most twice across the whole competition. Your two players must be different people.</span></li>
            </ul>
            <p className="mb-3">Picks can be edited freely until the deadline. After the deadline, picks are locked and visible to all players.</p>
            <p>Missing the deadline results in an autopick — the system selects the lowest available team in the league table and two random players on your behalf. Autopicks are clearly marked.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold mb-3 pb-2 border-b border-coupon-rule">The Banker</h2>
            <p className="mb-3">Each player has two bankers per competition. Declaring a banker on a gameweek doubles your total points for that week — team and both players.</p>
            <p className="mb-3">The banker must be declared at the same time as your pick, before the deadline. You cannot use both bankers in the same gameweek. Unused bankers at the end of the competition are worth nothing.</p>
            <p>Bankers are never applied to autopicks.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold mb-3 pb-2 border-b border-coupon-rule">Scoring</h2>
            <p className="mb-3">Team points are determined by the result and the quartile differential between your team and their opponent. The 20 clubs are divided into four quartiles of five based on league position. The larger the gap between your team and their opponent, the more points an upset is worth.</p>

            <div className="border border-coupon-rule overflow-x-auto mb-4">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-coupon-green text-coupon-paper">
                    <th className="text-left px-3 py-2">Result</th>
                    <th className="px-3 py-2">3↓</th>
                    <th className="px-3 py-2">2↓</th>
                    <th className="px-3 py-2">1↓</th>
                    <th className="px-3 py-2">=</th>
                    <th className="px-3 py-2">1↑</th>
                    <th className="px-3 py-2">2↑</th>
                    <th className="px-3 py-2">3↑</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Home Win', 15, 20, 25, 30, 35, 40, 45],
                    ['Away Win', 25, 30, 35, 40, 45, 50, 55],
                    ['Home Draw', 4, 6, 8, 10, 12, 14, 16],
                    ['Away Draw', 7, 9, 11, 13, 15, 17, 19],
                    ['Loss', 0, 0, 0, 0, 0, 0, 0],
                  ].map(([label, ...pts]) => (
                    <tr key={label as string} className="border-t border-coupon-rule">
                      <td className="px-3 py-2 font-sans">{label}</td>
                      {(pts as number[]).map((p, i) => (
                        <td key={i} className="px-3 py-2 text-center">{p}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mb-3">↑ = your team is the underdog (lower quartile). ↓ = your team is the favourite (higher quartile). = = same quartile.</p>
            <p><strong>Player points:</strong> Goal = 12pts. Assist = 6pts.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold mb-3 pb-2 border-b border-coupon-rule">The Leaderboard</h2>
            <p className="mb-3">The leaderboard updates after each gameweek is marked complete by the admin. In the event of a tie, the following criteria apply in order:</p>
            <ol className="space-y-1 pl-4 list-decimal">
              <li>Total points</li>
              <li>Points total with banker multiplier removed</li>
              <li>Most away wins from picked teams</li>
              <li>Most goals from picked players</li>
              <li>Earliest competition entry</li>
            </ol>
          </section>

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