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

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">After each round of matches</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to <a href="/admin/sync" className="underline">Sync</a> and click <strong>Sync Results</strong> — pulls in the finished scores.</li>
            <li>Click <strong>Sync Standings</strong> — updates the league table. Do this before the next step, since it feeds straight into it.</li>
            <li>
              Go to <a href="/admin/quartiles" className="underline">Quartiles</a> and click <strong>Reset to League Table</strong>. This re-splits
              the 20 clubs into four bands based on the table you just synced. <strong>This is the step that’s easy to
              forget</strong> — if you skip it, that week’s scoring will silently keep using old, stale quartile bands
              instead of the current table.
            </li>
            <li>
              Go to <a href="/admin/gameweeks" className="underline">Gameweeks</a>, find this gameweek, and set its status to <strong>completed</strong>.
              This is what actually calculates everyone’s points — it locks in a snapshot of the quartile bands you just
              set, then works out points from the results and any goals/assists. (The Scoring page is only for editing
              the points formula itself, it doesn’t calculate anything.)
            </li>
            <li>Spot-check the <a href="/leaderboard" className="underline">Leaderboard</a> — does it look right?</li>
          </ol>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Fixing a mistake</h2>
          <p className="text-sm text-gray-700">
            If a result or a goal was wrong and you’ve since fixed it, use the <strong>Recalculate Scoring</strong> box
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
