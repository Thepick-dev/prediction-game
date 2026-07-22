export default function PreSeasonHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Setting Up A New Season</h1>
      <p className="text-gray-500 text-sm mb-8">Everything to work through before players start picking.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="font-bold mb-3 text-red-800">0. Code changes you can make yourself</h2>
          <p className="text-sm text-gray-700 mb-4">
            These three things live in the site&rsquo;s actual code rather than any admin page, but you don&rsquo;t need
            Claude to change them — here&rsquo;s exactly how, step by step.
          </p>

          <div className="bg-white border border-red-100 rounded-lg p-4 mb-5">
            <h3 className="font-bold text-sm mb-2">How to make any of these edits, in general</h3>
            <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1.5">
              <li>Open the project in VS Code (the program this chat runs inside).</li>
              <li>
                Press <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">Ctrl</kbd> + <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">P</kbd> (on
                a Mac, <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">Cmd</kbd> + <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">P</kbd>). A
                small search box appears at the top of the screen.
              </li>
              <li>Type the file name (given for each change below) and press Enter — that exact file opens.</li>
              <li>
                Press <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">Ctrl</kbd> + <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">F</kbd> and
                paste in the text shown below to jump straight to the right line.
              </li>
              <li>Change <strong>only</strong> the specific part described — leave everything else on the line exactly as it is (spacing, commas, quote marks all matter).</li>
              <li>Save with <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">Ctrl</kbd> + <kbd className="bg-gray-100 border rounded px-1.5 py-0.5 text-xs">S</kbd>.</li>
              <li>Once you&rsquo;ve made all the edits for one change, publish them: click the Source Control icon in the far-left sidebar (it looks like a branch with dots, usually the 3rd or 4th icon down). Type a short message in the box at the top, e.g. &ldquo;Update season year&rdquo;, then click the checkmark button above it to commit. Then click <strong>Sync Changes</strong> (may also show as a circular arrow icon). The live site updates automatically within a minute or two.</li>
            </ol>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="font-bold text-sm mb-1">1. The season year (4 files)</h3>
              <p className="text-sm text-gray-700 mb-2">
                Each file below fetches data from football-data.org for a specific season, written as the year that
                season <em>starts</em> — e.g. the 2027-28 season is <code className="bg-gray-100 px-1 rounded">2027</code>.
                Every one of these needs updating at the start of a new season, or the site keeps quietly pulling last
                season&rsquo;s data forever.
              </p>

              <p className="text-xs font-bold text-gray-500 mb-1">File: <code className="bg-gray-100 px-1 rounded">app/api/sync/teams/route.ts</code></p>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`'https://api.football-data.org/v4/competitions/PL/teams?season=2026',`}</code></pre>
              <p className="text-xs text-gray-500 mb-3">Change the <code className="bg-gray-100 px-1 rounded">2026</code> to the new year. Appears once in this file.</p>

              <p className="text-xs font-bold text-gray-500 mb-1">File: <code className="bg-gray-100 px-1 rounded">app/api/sync/fixtures/route.ts</code></p>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`'https://api.football-data.org/v4/competitions/PL/matches?season=2026',`}</code></pre>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`season: '2026'`}</code></pre>
              <p className="text-xs text-gray-500 mb-3">Two separate spots in this file — change the year in both.</p>

              <p className="text-xs font-bold text-gray-500 mb-1">File: <code className="bg-gray-100 px-1 rounded">app/api/sync/standings/route.ts</code></p>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`'https://api.football-data.org/v4/competitions/PL/standings?season=2026',`}</code></pre>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`season: '2026'`}</code></pre>
              <p className="text-xs text-gray-500 mb-3">Two separate spots in this file — change the year in both.</p>

              <p className="text-xs font-bold text-gray-500 mb-1">File: <code className="bg-gray-100 px-1 rounded">app/api/sync/results/route.ts</code></p>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`'https://api.football-data.org/v4/competitions/PL/matches?season=2026&status=FINISHED',`}</code></pre>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`message: 'No finished matches yet for 2026 season'`}</code></pre>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-1 overflow-x-auto"><code>{`season: '2026'`}</code></pre>
              <p className="text-xs text-gray-500">Three separate spots in this file — change the year in all three.</p>
            </div>

            <div className="border-t border-red-100 pt-4">
              <h3 className="font-bold text-sm mb-1">2. Adding a promoted club&rsquo;s short code</h3>
              <p className="text-sm text-gray-700 mb-2">
                First, find the club&rsquo;s official 3-letter code — check the Fantasy Premier League website/app&rsquo;s
                team list (it&rsquo;s the short code they show next to the club name), or ask Claude to look it up.
                Then open this file:
              </p>
              <p className="text-xs font-bold text-gray-500 mb-1">File: <code className="bg-gray-100 px-1 rounded">app/api/sync/fpl/route.ts</code></p>
              <p className="text-sm text-gray-700 mb-2">Find this block near the top (it&rsquo;s a list of existing clubs, yours will look similar but not identical):</p>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-2 overflow-x-auto"><code>{`const FPL_CODE_TO_OUR_SHORT_NAME: Record<string, string> = {
  ARS: 'Arsenal',
  AVL: 'Villa',
  ...
  WOL: 'Wolves',
}`}</code></pre>
              <p className="text-sm text-gray-700 mb-2">
                Add one new line inside the <code className="bg-gray-100 px-1 rounded">{'{ }'}</code> braces, before the closing brace — for
                example, for Coventry (once you know their FPL code):
              </p>
              <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 mb-2 overflow-x-auto"><code>{`  COV: 'Coventry',`}</code></pre>
              <p className="text-sm text-gray-700">
                The bit on the right (in quotes, e.g. <code className="bg-gray-100 px-1 rounded">&apos;Coventry&apos;</code>) must exactly match that
                club&rsquo;s <strong>Short Name</strong> as shown on <a href="/admin/teams" className="underline">the Teams admin page</a> — check
                there first if you&rsquo;re not sure of the exact spelling. Don&rsquo;t forget the comma at the end of the line.
              </p>
            </div>

            <div className="border-t border-red-100 pt-4">
              <h3 className="font-bold text-sm mb-1">3. Adding new hero background images</h3>
              <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1.5">
                <li>
                  Add your new image files into the <code className="bg-gray-100 px-1 rounded">private/hero-images/</code> folder
                  (in VS Code&rsquo;s file explorer on the left, or by dragging files into that folder on your computer) — note
                  this is <code className="bg-gray-100 px-1 rounded">private/</code>, not <code className="bg-gray-100 px-1 rounded">public/</code>; images
                  live outside the public folder on purpose so they can only be seen by people logged in.
                  Name them following the existing pattern — if the last one is <code className="bg-gray-100 px-1 rounded">hero-04</code>,
                  your new ones are <code className="bg-gray-100 px-1 rounded">hero-05-desktop.png</code> and <code className="bg-gray-100 px-1 rounded">hero-05-mobile.png</code> (a
                  separate image for phone screens vs computer screens, same number).
                </li>
                <li>
                  Open <code className="bg-gray-100 px-1 rounded">components/HeroPage.tsx</code> and find this line near the top:
                  <pre className="bg-gray-900 text-gray-100 text-xs rounded p-3 my-2 overflow-x-auto"><code>{`const TOTAL_HEROES = 4`}</code></pre>
                  Change <code className="bg-gray-100 px-1 rounded">4</code> to however many pairs of images you now have in total (e.g. <code className="bg-gray-100 px-1 rounded">5</code>).
                </li>
                <li>Save, then publish using the same steps as above. This can be done any time, not just pre-season.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">1. Update the clubs</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Mark newly relegated clubs as <strong>inactive</strong> on <a href="/admin/teams" className="underline">the Teams page</a>.</li>
            <li>Mark newly promoted clubs as <strong>active</strong> (add them first via Sync if they’re not already in the list).</li>
            <li>
              Check the outside player data source is ready before syncing. Player info comes from the Fantasy
              Premier League website, and every summer it takes them a little while to update their team list
              after promotion/relegation is confirmed. If a newly promoted club’s players are missing after
              clicking <strong>Import Players</strong> on <a href="/admin/sync" className="underline">Sync</a>, this is usually why —
              just try again in a week or two.
            </li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">2. Set up the competition</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Create the new competition at <a href="/admin/competitions" className="underline">Competitions</a> (name, dates) and mark it <strong>active</strong>.</li>
            <li>Add each gameweek’s deadline at <a href="/admin/gameweeks" className="underline">Gameweeks</a>.</li>
            <li>Import fixtures via <a href="/admin/sync" className="underline">Sync</a> (“Import Fixtures”), then check they’ve landed in the right gameweeks at <a href="/admin/fixtures" className="underline">Fixtures</a>.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">3. Set starting positions, quartiles, and draft tiers</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>
              Since there are no real results yet, use the manual override editor at <a href="/admin/standings" className="underline">Standings</a> to
              enter odds-based or predicted starting positions.
            </li>
            <li>
              <strong>Important:</strong> once real results start coming in and you begin syncing standings during the season,
              don’t go back and manually override again — the next sync will just overwrite it anyway.
            </li>
            <li>
              Set the scoring quartiles at <a href="/admin/quartiles" className="underline">Quartiles</a> — splits teams into four bands of
              difficulty, used to work out how many points a result is worth. This isn’t a one-time job: it needs
              resetting every week once the season starts, see <a href="/admin/help/weekly" className="underline">Weekly Routine</a>.
            </li>
            <li>Set the draft tiers at <a href="/admin/draft-tiers" className="underline">Draft Tiers</a> — separate from quartiles, this is what players pick their “double-use” team from when they join.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">4. Before it goes live</h2>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1.5">
            <li>Do a full dress rehearsal of one gameweek with a couple of test accounts — make a pick, let the deadline pass, run the weekly routine, and check the points come out right.</li>
            <li>Confirm you stay logged in properly on the live site (not just locally).</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
