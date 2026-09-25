export default function RugbyAdminGuidePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Running The Rugby Game</h1>
      <p className="text-gray-500 text-sm mb-8">Everything needed to run a Six Nations (or any future rugby competition) from the site — no code changes required.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">1. Set up a new competition</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Go to <a href="/admin/rugby" className="underline">Admin → Rugby Competitions</a>, create the new competition (name, season, dates).</li>
            <li>Click <strong>Activate</strong> — this archives whichever competition was active before and makes the new one live. The spreadsheet sync and every player-facing page always use whichever one is active.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">2. Import squads and fixtures</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Fill in the Excel workbook (Squads tab: Team, Player Name; Fixtures tab: Round, Home Team, Away Team, Kickoff).</li>
            <li>Upload it to the site&apos;s <code className="bg-gray-100 px-1 rounded">public</code> folder via GitHub, replacing <code className="bg-gray-100 px-1 rounded">rugby-data.xlsx</code>.</li>
            <li>Go to <a href="/admin/rugby" className="underline">Admin → Rugby Competitions</a> and click <strong>Sync from spreadsheet</strong>. Squads only ever grow (a name removed from the sheet stays on the site — remove it yourself in <a href="/admin/rugby/players" className="underline">Rugby Players</a> if truly needed); rounds and fixtures are created fresh for whichever competition is currently active.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">3. Set the scoring rules</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Go to <a href="/admin/rugby/scoring-rules" className="underline">Admin → Rugby Scoring Rules</a> to set every point value in the game — try/kicking points, the red card penalty, substitution limits and penalties, the underdog bonus and its threshold, and the weekly match-prediction point values.</li>
            <li>Change these any time — the Rules page shown to players always reflects whatever&apos;s set here, automatically. A &quot;Calculate Points&quot; run always uses the current values, so correcting a number retroactively re-scores fairly if you recalculate afterwards.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">4. The weekly routine, once a round&apos;s matches are played</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Go to <a href="/admin/rugby/results" className="underline">Admin → Rugby Results</a>, pick the round, and enter each fixture&apos;s final score.</li>
            <li>Click into each fixture and add every try/conversion/penalty/drop goal/card, with who scored it.</li>
            <li>Click <strong>Calculate Points for this Round</strong> — this scores everyone&apos;s Dream Team picks AND their match-score predictions for that round in one go. Safe to click again any time you correct something; it always recalculates cleanly rather than double-counting.</li>
          </ul>
          <p className="text-xs text-gray-500 mt-3">Alternatively, all of the above (scores, scorers, even squads) can still be updated in bulk via the same Excel workbook and &quot;Sync from spreadsheet&quot; — the admin pages are for quick one-off weekly updates so you&apos;re not re-uploading a whole file for a single score.</p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">5. Managing players between rounds</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li><a href="/admin/rugby/players" className="underline">Admin → Rugby Players</a> lets you add a one-off call-up or remove someone without touching the spreadsheet.</li>
            <li>The ticker banner at the top of every rugby page (deadline reminders, shout-outs) is editable from <a href="/admin/rugby" className="underline">Admin → Rugby Competitions</a> — leave it empty to hide it.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">6. Ending a season and starting the next one</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Click <strong>Mark completed</strong> on the competition at <a href="/admin/rugby" className="underline">Admin → Rugby Competitions</a> — this is what makes it show up on the public <a href="/rugby/winners" className="underline">Winners</a> page.</li>
            <li>For a new season: update the spreadsheet (clear last season&apos;s fixtures, keep or edit squads), create and activate a new competition (step 1), then re-import (step 2). Rounds/fixtures/predictions/points all start fresh per competition automatically; squads carry over unless you edit them.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">If you ever need to undo something</h2>
          <p className="text-sm text-gray-700">
            Activating a different competition or re-running &quot;Calculate Points&quot; are both safe to do
            repeatedly — nothing here is destructive. The one thing to be careful with is removing a player from{' '}
            <a href="/admin/rugby/players" className="underline">Rugby Players</a> if they&apos;ve already been
            picked by someone&apos;s squad or predictions — check first.
          </p>
        </div>
      </div>
    </div>
  )
}
