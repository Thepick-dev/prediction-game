export default function WeeklyHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Weekly Routine</h1>
      <p className="text-gray-500 text-sm mb-8">What to check and do each week during the season.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Happens automatically — nothing to do</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Every night, the site checks whether any gameweek’s deadline has just passed. If so, it locks that gameweek and fills in a computer pick (“AUTOPICK”) for anyone who didn’t pick in time.</li>
            <li>Once Gameweek 1’s deadline passes, everyone’s double-use tier picks lock permanently for the rest of the competition.</li>
          </ul>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">Sync players weekly while transfer windows are open</h2>
          <p className="text-sm text-gray-700">
            During the summer and January transfer windows, clubs’ squads change — players move between teams,
            new signings arrive, others leave. Click <strong>Import Players</strong> on <a href="/admin/sync" className="underline">the Sync page</a> once
            a week while a transfer window is open, so the pick lists stay accurate and no one can pick a player who’s moved on.
            Outside of transfer windows, this doesn’t need to be done weekly — the squads aren’t changing.
          </p>
          <p className="text-sm text-gray-700 mt-2">
            One real risk this creates: if a player transfers clubs and you later use <strong>Recalculate Points</strong>
            (below) on an OLD gameweek from before the move, it rescores that historical pick against the player&apos;s
            new club instead of the one they actually played for that week. Avoid recalculating gameweeks from before
            a transfer window once players have been re-synced — if you do need to, check the result looks sane
            afterward.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">The weekly cycle, in order</h2>
          <p className="text-sm text-gray-700 mb-3">
            The important thing to understand hasn&apos;t changed: <strong>quartiles for a gameweek must be locked in
            BEFORE that gameweek opens for picking</strong>, not afterwards — players need to see the real bands
            while they&apos;re choosing. What HAS changed is how that gets enforced: instead of a manual "reset
            quartiles, then remember not to touch it again" discipline, opening a gameweek now goes through a
            dedicated <strong>Prepare → Confirm</strong> step on the <a href="/admin/gameweeks" className="underline">Gameweeks</a> page
            that freezes everything at the moment you do it.
          </p>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to <a href="/admin/sync" className="underline">Sync</a> and click <strong>Sync Results</strong> — pulls in the finished scores for the gameweek that just finished.</li>
            <li>Click <strong>Sync Standings</strong> — updates the league table with those results. Do this before the next step, since it feeds straight into it.</li>
            <li>
              Go to <a href="/admin/events" className="underline">Match Events</a>, pick that gameweek, and click <strong>Sync from FPL</strong>.
              This fills in goalscorers, assists, own goals automatically. Wait roughly an hour after the last match
              finishes before doing this — that&apos;s how long the Fantasy Premier League site takes to fully confirm
              a match. If you click it too early it just skips anything not ready yet rather than pulling anything
              wrong, so there&apos;s no harm trying.
            </li>
            <li>
              Go to <a href="/admin/gameweeks" className="underline">Gameweeks</a>, find that gameweek, and set its status to <strong>completed</strong>.
              This is what actually calculates everyone&apos;s points for it. It uses the quartile bands that were
              frozen for THIS gameweek back when it was prepared and opened (see step 6, below, from when this was
              the "next" gameweek) — not whatever the live table says right now. Timing this step no longer matters
              the way it used to; the snapshot already locked in the right bands weeks ago.
            </li>
            <li>
              Spot-check the <a href="/leaderboard" className="underline">Leaderboard</a> — does it look right?
            </li>
            <li>
              Now go to <a href="/admin/gameweeks" className="underline">Gameweeks</a>, find the NEXT gameweek (still
              showing as "upcoming"), and click <strong>📸 Prepare to Open</strong>. This takes a permanent snapshot
              of the league table, quartiles, and fixtures as they stand right now, and freezes that gameweek&apos;s
              bands from it immediately. Check the summary it shows you (team/quartile/fixture counts), then click
              <strong> ✓ Confirm &amp; Open</strong>. <strong>This is the step that used to be easy to get wrong</strong> —
              now, nothing opens for picking until you&apos;ve explicitly reviewed and confirmed it.
            </li>
          </ol>
          <p className="text-sm text-gray-700 mt-3">
            The old warning about never touching Quartiles once a gameweek is open still applies in spirit, but it&apos;s
            no longer as fragile: if you do need to fix a mistake after opening, use that specific gameweek&apos;s own
            <strong> 🔄 Correct quartiles</strong> button on the Gameweeks page (see "Fixing a mistake" below) rather
            than the general <a href="/admin/quartiles" className="underline">Quartiles</a> page — that button only
            changes what was frozen for THAT gameweek, without risking anything else.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Fixing a mistake</h2>
          <p className="text-sm text-gray-700 mb-2">
            Worth taking a <a href="/admin/snapshots" className="underline">Snapshot</a> first, before making any of
            the corrections below — a one-click backup of everything about the competition, so you&apos;ve got an
            exact copy of how things looked right before, in case the fix itself needs reverse-engineering later.
          </p>
          <p className="text-sm text-gray-700 mb-2">
            If a goal or assist was wrong, go back to <a href="/admin/events" className="underline">Match Events</a> and click
            <strong> Sync from FPL</strong> again for that gameweek — it replaces that gameweek&apos;s events with a fresh pull rather
            than adding on top, so it&apos;s safe to re-run. You can also add or delete individual events by hand on that
            same page if something needs a manual correction FPL wouldn&apos;t reflect.
          </p>
          <p className="text-sm text-gray-700 mb-2">
            If the quartiles themselves were wrong for a gameweek — open or already completed — go to
            that gameweek on <a href="/admin/gameweeks" className="underline">Gameweeks</a> and click
            <strong> 🔄 Correct quartiles (re-take snapshot)</strong>. This re-freezes that gameweek&apos;s bands from
            the current league table. On an already-completed gameweek this only affects future recalculations —
            it does <em>not</em> retroactively change existing points on its own, so follow it with Recalculate
            Points (next) to actually apply the fix.
          </p>
          <p className="text-sm text-gray-700 mb-2">
            Once events and/or quartiles are right, click <strong>🔁 Recalculate Points</strong> on that gameweek
            (Gameweeks page — needs status locked or completed) to re-run its scoring. Safe to run as many times as
            you need, it always recalculates from scratch. The <strong>Recalculate Scoring</strong> box
            on <a href="/admin/sync" className="underline">the Sync page</a> does the same underlying thing if you
            prefer working from there.
          </p>
          <p className="text-sm text-gray-700 mb-2">
            Need to fully reopen a completed or locked gameweek — say, picks need changing too? Use
            <strong> ↩ Reopen</strong> on that gameweek. It asks you to confirm first, since picks become editable
            again.
          </p>
          <p className="text-sm text-gray-700">
            To fix an individual player&apos;s pick directly, use <a href="/admin/edit-pick" className="underline">Edit Pick</a>.
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-green-800">When the competition ends</h2>
          <p className="text-sm text-gray-700 mb-2">
            Once every gameweek has been marked completed and you&apos;re happy the final standings are right, go
            to <a href="/admin/competitions" className="underline">Competitions</a> and click <strong>Finalize</strong> on
            the active competition.
          </p>
          <p className="text-sm text-gray-700 mb-2">
            This is the one deliberate step that switches everything from &ldquo;still in progress&rdquo; to
            &ldquo;final&rdquo; — the <a href="/awards" className="underline">Awards</a> page drops its
            &ldquo;Provisional&rdquo; banner, and every player&apos;s shareable Season Summary ticket (from their own row
            on the <a href="/leaderboard" className="underline">Leaderboard</a>) switches from &ldquo;Provisional&rdquo;
            to &ldquo;Final&rdquo; too. Both are viewable and shareable by anyone at any time before that, they just
            carry the Provisional label until you press this.
          </p>
          <p className="text-sm text-gray-700">
            Finalizing doesn&apos;t archive or delete anything, and it&apos;s independent of starting the next
            competition — create and activate the new one whenever you&apos;re ready, following
            the <a href="/admin/help/pre-season" className="underline">New Season Setup</a> guide if it&apos;s a new season, or
            just <strong>Create Competition</strong> on the Competitions page for the next half of the same season.
          </p>
        </div>
      </div>
    </div>
  )
}
