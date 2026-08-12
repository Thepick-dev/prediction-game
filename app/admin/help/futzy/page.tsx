export default function FutzyHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Futzy</h1>
      <p className="text-gray-500 text-sm mb-8">Setting up and understanding the AI participant.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">What he is</h2>
          <p className="text-sm text-gray-700">
            Futzy is a real participant — visible on the leaderboard and results, with his own picks every
            gameweek — powered by Claude rather than a person. He&apos;s clearly labelled everywhere he appears, and
            can&apos;t be crowned the winner even if he tops the table. Phase 1 (what&apos;s live now): he makes a
            real team + two-player pick every gameweek. He doesn&apos;t play Banker, All or Nothing, or the Bonus
            Card yet — that&apos;s a later phase.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Setting him up</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to <a href="/admin/futzy" className="underline">the Futzy page</a> and click <strong>Create Futzy</strong> — a one-time action, done once ever, not per competition.</li>
            <li>Go to <a href="/admin/competitions" className="underline">Competitions</a>, select the competition, and click <strong>Enable</strong> under the &quot;🤖 Futzy&quot; section.</li>
            <li>That&apos;s it — he&apos;ll appear on the leaderboard immediately, and submit his first real pick the next time the cron job runs (once a day).</li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">Keeping him sharp</h2>
          <p className="text-sm text-gray-700">
            He re-derives his pick every single day (via the same cron job that handles autopicks and locking),
            reading whatever&apos;s currently in the players table — expected goals, expected assists, form, and
            injury/availability. That data only updates when you run <a href="/admin/sync" className="underline">
            FPL Sync</a>. Syncing regularly (a good habit already, but especially matters here) keeps his picks
            genuinely informed rather than stale.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">How he actually thinks</h2>
          <p className="text-sm text-gray-700 mb-2">
            For every available team and player, he projects expected points against{' '}
            <em>this competition&apos;s own scoring rules</em> (not real-world Fantasy Premier League points):
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            <li><strong>Teams</strong>: a simple win/draw/loss probability model built from the quartile gap between your team and the opponent, weighted against the actual points your Scoring page has set for each result.</li>
            <li><strong>Players</strong>: expected goals × your goal points, plus expected assists × your assist points, reduced for injury/rotation doubt and nudged by recent form.</li>
          </ul>
          <p className="text-sm text-gray-700 mt-2">
            He then picks whichever legal combination scores highest, respecting the same team-used-once/player-used-twice
            rules as anyone else. You can see exactly what he considered — not just what he picked — on{' '}
            <a href="/admin/futzy" className="underline">his page</a>, admin-only (never shown publicly, so it never
            leaks a still-hidden pick before the deadline).
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Disabling him</h2>
          <p className="text-sm text-gray-700">
            Click <strong>Disable</strong> on the same Competitions panel. This only stops new picks — his history
            and points stand either way, same as disabling the Bonus Card.
          </p>
        </div>
      </div>
    </div>
  )
}
