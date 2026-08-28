export default function PauseGameHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Pausing The Game</h1>
      <p className="text-gray-500 text-sm mb-8">Showing &quot;Game Cancelled&quot; to every player, e.g. while sorting out a dispute.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">What it does</h2>
          <p className="text-sm text-gray-700">
            Instantly shows a &quot;Game Cancelled&quot; page to every player, on every page of the site. It&apos;s
            purely cosmetic — deadlines, autopick and scoring all keep running exactly as normal underneath, and
            nothing is deleted, frozen or reset. You (any admin) always keep seeing the real site everywhere, not
            just under <code className="bg-gray-100 px-1 rounded">/admin</code>, so you&apos;re never locked out of
            turning it back off.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Turning it on and off</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to <a href="/admin/competitions" className="underline">Competitions</a> — the &quot;Pause Game&quot; panel is right at the top, above &quot;Create New Competition&quot;.</li>
            <li>Click <strong>Cancel Game</strong>, confirm — every player sees the cancelled page immediately.</li>
            <li>The same button becomes <strong>Reactivate Game</strong> once paused — click it, confirm, and the real site is back for everyone straight away.</li>
          </ol>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">The message players see</h2>
          <p className="text-sm text-gray-700">
            Leave it blank for a generic &quot;paused by the admin&quot; message, or set something more specific in
            the &quot;Message shown to players&quot; box on the same panel — e.g. &quot;Paused while we sort
            something out — back soon&quot;.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">Worth knowing</h2>
          <p className="text-sm text-gray-700">
            Because deadlines and scoring keep running underneath, a gameweek can still lock and get autopicked
            while the game shows as cancelled — this was a deliberate choice, not an oversight, so nobody&apos;s
            deadline is unfairly affected by however long the pause lasts. If you specifically need a deadline to
            NOT pass while sorting something out, that needs handling separately (e.g. via Gameweeks) — pausing on
            its own won&apos;t stop it.
          </p>
        </div>
      </div>
    </div>
  )
}
