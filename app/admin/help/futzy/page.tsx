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
            gameweek — driven by AI rather than a person. Deliberately low-key about it: the only disclosure is his
            display name, &quot;Futzy (AI)&quot; — no separate badge, no explanation elsewhere. He can&apos;t be crowned the
            winner even if he tops the table. He makes a real team + two-player pick every gameweek, picks his own
            tier draft teams at the start of a competition, and plays Banker, All or Nothing and the Bonus Card
            (where enabled) using the same heuristics described below.
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
            <li><strong>Teams</strong>: a win/draw/loss probability model built from the quartile gap between your team and the opponent, weighted against the actual points your Scoring page has set for each result — calibrated against 1,140 real Premier League results (2022-25), not guessed.</li>
            <li><strong>Players</strong>: expected goals × your goal points, plus expected assists × your assist points, reduced for injury/rotation doubt and nudged by recent form, then adjusted up or down by how good this specific upcoming fixture looks for them (via Fantasy Premier League&apos;s own next-gameweek projection) — so his player choice, not just his team choice, reacts to who they&apos;re playing that week.</li>
          </ul>
          <p className="text-sm text-gray-700 mt-2">
            That maths narrows things down to a handful of the strongest legal options — respecting the same
            team-used-once/player-used-twice rules as anyone else. From there, an AI (Gemini — the same free API
            already used for his Wall comments, no extra cost) makes the actual final call from among ONLY those
            options, weighing things like injury news text the raw numbers can&apos;t interpret (e.g. preferring a
            slightly lower-projected but clearly fit player over a higher one who&apos;s a doubt). It can never pick
            anything outside the maths&apos; own shortlist, so it can&apos;t produce an illegal or nonsensical pick.
            If that step is ever unavailable (rate limit, network issue, bad response), it falls straight back to
            the single best-projected combination automatically — never blocks a pick from happening.
          </p>
          <p className="text-sm text-gray-700 mt-2">
            You can see exactly what he considered, which path decided it (Gemini or the maths fallback), and — when
            Gemini chose — its own short reasoning, on <a href="/admin/futzy" className="underline">his page</a>,
            admin-only (never shown publicly, so it never leaks a still-hidden pick before the deadline).
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Tier draft, Banker, All or Nothing &amp; the Bonus Card</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2">
            <li><strong>Tier draft</strong>: the first time he&apos;s asked to pick for a competition, he automatically drafts the strongest available team in each tier (by quartile) as his double-use teams — same as a human&apos;s one-off pre-season choice, just made for him. This only works if it happens before gameweek 1&apos;s deadline, same as a human joining.</li>
            <li><strong>Banker</strong>: played only when this week&apos;s projected score both beats his season average so far and beats his own projection for each of the next few gameweeks — i.e. only when it looks like a clearly better week than waiting.</li>
            <li><strong>All or Nothing</strong>: nominated on whichever of his two picks that gameweek is genuinely unused so far, not on the admin&apos;s exclusion list, and projects an above-average attacking threat — never played at all if neither pick qualifies, and never more than once across the competition.</li>
            <li><strong>Bonus Card</strong>: played on whichever upcoming gameweek gives the nominated player&apos;s team its best-projected fixture, as long as that player isn&apos;t already one of his two picks that week and isn&apos;t flagged with a fitness doubt. Like a human, once played it&apos;s never moved or replayed.</li>
          </ul>
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
