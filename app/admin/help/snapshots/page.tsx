export default function SnapshotsHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Competition Snapshots</h1>
      <p className="text-gray-500 text-sm mb-8">Saving a point-in-time backup you can reverse-engineer a problem from later.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">What it is</h2>
          <p className="text-sm text-gray-700">
            A full copy of everything about one competition, taken the moment you click the button — picks, points,
            tier draft data, scoring rules, quartiles, match events, teams, players, profiles, all of it — saved as
            one file. Nothing is saved automatically; a snapshot only ever exists because you asked for one.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Taking one</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to <a href="/admin/snapshots" className="underline">Snapshots</a> and pick the competition.</li>
            <li>Optionally add a short label — e.g. &quot;before recalculating GW5&quot; — so you can tell snapshots apart later.</li>
            <li>Click <strong>Save Snapshot Now</strong>. It appears in the list below straight away.</li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">When to take one</h2>
          <p className="text-sm text-gray-700">
            Before anything you&apos;re not 100% sure about — recalculating an old gameweek&apos;s points, correcting
            quartiles after the fact, manually editing a pick, re-syncing players mid-transfer-window. If it turns
            out to have caused a problem, you&apos;ve got an exact copy of how things looked right before, to compare
            against.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Reading one back</h2>
          <p className="text-sm text-gray-700">
            Click <strong>Download JSON</strong> next to any snapshot to save it as a file on your computer. It&apos;s
            plain text (readable in any text editor), organised by table name — e.g. everyone&apos;s picks are under
            <code className="bg-gray-100 px-1 rounded mx-1">picks</code>, points under
            <code className="bg-gray-100 px-1 rounded mx-1">points</code>, and so on. If something looks wrong later,
            the easiest way to make sense of it is to hand the downloaded file to Claude Code and describe what looks
            off — reading through a raw JSON dump by eye isn&apos;t necessary.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Deleting old ones</h2>
          <p className="text-sm text-gray-700">
            Tick the checkbox next to any snapshot (or the header checkbox to select all), then click
            <strong> Delete Selected</strong>. There&apos;s no undo, so double check before confirming — but nothing
            else on the site depends on a snapshot existing, so deleting old ones is always safe for the live game
            itself.
          </p>
        </div>
      </div>
    </div>
  )
}
