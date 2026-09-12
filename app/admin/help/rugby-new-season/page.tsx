export default function RugbyNewSeasonHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Starting A New Rugby Season</h1>
      <p className="text-gray-500 text-sm mb-8">Re-running the Six Nations (or any future rugby competition) for a new year.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">1. Update the spreadsheet</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Open your rugby data workbook and clear out (or overwrite) the <strong>Fixtures</strong> tab — last season&rsquo;s rounds, results, and scorers shouldn&rsquo;t carry into the new one.</li>
            <li>Add the new season&rsquo;s fixtures: Round, Home Team, Away Team, Kickoff for each match. Leave Home Score/Away Score/Scorer/Event/Minute blank until matches are actually played.</li>
            <li>Check the <strong>Squads</strong> tab — players don&rsquo;t get removed automatically, so if anyone&rsquo;s retired or been dropped, delete their row yourself. New call-ups just get added as new rows, same as always.</li>
            <li>Save the file, ready to upload once the new competition is active (next step).</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">2. Create and activate the new competition</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Go to <a href="/admin/rugby" className="underline">Admin → Rugby</a> and create the new competition (name, season, dates).</li>
            <li>Click <strong>Activate</strong> on it. This automatically archives whichever competition was active before — its data is kept forever, just no longer the live one.</li>
            <li>
              This step matters: the spreadsheet sync only ever writes into whichever competition is currently
              active. Skipping it means new results would silently land in last year&rsquo;s (now archived) competition
              instead of the new one.
            </li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">3. Upload and sync</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Upload the updated workbook to the site&rsquo;s <code className="bg-gray-100 px-1 rounded">public</code> folder via GitHub&rsquo;s web interface, replacing <code className="bg-gray-100 px-1 rounded">rugby-data.xlsx</code> — the same way you already swap other files like the Bonus Card photo.</li>
            <li>Go to <a href="/rugby" className="underline">the Rugby page</a> and click <strong>Sync from spreadsheet</strong>. Rounds and fixtures are created fresh under the newly active competition; squads simply gain whatever&rsquo;s new since last time.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">What carries over automatically vs. what starts fresh</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li><strong>Carries over:</strong> player squads — they&rsquo;re not tied to any one competition, so last season&rsquo;s names are still there unless you remove them yourself in the spreadsheet.</li>
            <li><strong>Starts fresh:</strong> rounds, fixtures, results, scorers, and everyone&rsquo;s predictions and points — all scoped to whichever competition they belong to, so activating a new one gives you a clean slate for all of that automatically.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">If you ever need to undo an Activate</h2>
          <p className="text-sm text-gray-700">
            Go back to <a href="/admin/rugby" className="underline">Admin → Rugby</a> and click <strong>Activate</strong> on
            the one you want live instead — it archives whichever is currently active and reactivates your choice.
            Nothing is ever deleted by this, only relabelled.
          </p>
        </div>
      </div>
    </div>
  )
}
