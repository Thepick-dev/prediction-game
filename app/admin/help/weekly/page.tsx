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
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">The weekly cycle, in order</h2>
          <p className="text-sm text-gray-700 mb-3">
            The important thing to understand: <strong>quartiles for a gameweek must be set BEFORE that gameweek opens
            for picking</strong>, not afterwards. Players need to see the actual bands (which team is the "underdog",
            worth more points) while they&apos;re choosing — so the cycle below always sets up gameweek N+1&apos;s
            quartiles as part of closing out gameweek N, not as a separate later job. If you find yourself resetting
            quartiles on a gameweek that&apos;s already open for picking, something&apos;s out of order.
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
              This is what actually calculates everyone&apos;s points for it — it takes a permanent snapshot of
              whatever quartile bands are <em>currently</em> set and works out points from the results and any
              goals/assists against that snapshot. (The Scoring page is only for editing the points formula itself,
              it doesn&apos;t calculate anything.) This is exactly why step 5 below has to happen <em>after</em> this,
              not before — the snapshot needs to match what players actually picked against, i.e. the OLD bands, not
              the ones about to be set for next week.
            </li>
            <li>
              Spot-check the <a href="/leaderboard" className="underline">Leaderboard</a> — does it look right?
            </li>
            <li>
              Now go to <a href="/admin/quartiles" className="underline">Quartiles</a> and click <strong>Reset to League Table</strong>.
              This re-splits the 20 clubs into four bands based on the table you just synced in step 2 — <strong>this
              is what the players picking the NEXT gameweek will see and use</strong>, so it needs to be done before
              that gameweek opens, ideally right away as the last step of this cycle. <strong>This is the step that&apos;s
              easy to get wrong</strong> — if you skip it, or do it too late, the next gameweek opens with stale bands
              from two gameweeks ago instead of the current table.
            </li>
          </ol>
          <p className="text-sm text-gray-700 mt-3">
            One thing to avoid: once a gameweek is open for picking, don&apos;t touch <a href="/admin/quartiles" className="underline">Quartiles</a> again
            until it&apos;s locked and completed (step 4) — whatever the bands say at the exact moment you mark it
            completed is what gets frozen and scored, so changing them mid-week would mean players are scored against
            different bands to the ones they actually saw when picking.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Fixing a mistake</h2>
          <p className="text-sm text-gray-700 mb-2">
            If a goal or assist was wrong, go back to <a href="/admin/events" className="underline">Match Events</a> and click
            <strong> Sync from FPL</strong> again for that gameweek — it replaces that gameweek&apos;s events with a fresh pull rather
            than adding on top, so it&apos;s safe to re-run. You can also add or delete individual events by hand on that
            same page if something needs a manual correction FPL wouldn&apos;t reflect.
          </p>
          <p className="text-sm text-gray-700">
            Once the events are right, use the <strong>Recalculate Scoring</strong> box
            on <a href="/admin/sync" className="underline">the Sync page</a> to re-run points for that gameweek — safe to run as many times as
            you need, it always recalculates from scratch. Note this does <em>not</em> refresh the quartile snapshot — if
            the quartiles themselves were wrong for that week, you’d need to fix that gameweek’s row directly, or ask
            Claude. To fix an individual player’s pick directly, use <a href="/admin/edit-pick" className="underline">Edit Pick</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
