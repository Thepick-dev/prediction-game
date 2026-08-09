export default function BonusCardHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: The Bonus Card</h1>
      <p className="text-gray-500 text-sm mb-8">Setting up and managing the optional Bonus Card feature for a competition.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">What it is</h2>
          <p className="text-sm text-gray-700">
            One nominated player that every entrant can play once across the whole competition, on any gameweek of
            their choosing, for a bonus score on top of their normal two picks. It&apos;s entirely optional — a
            competition works fine with it left off — and everything lives on the{' '}
            <a href="/admin/competitions" className="underline">Competitions page</a>, under the &quot;Bonus Card&quot;
            section once you&apos;ve selected a competition.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Setting it up</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Go to <a href="/admin/competitions" className="underline">Competitions</a> and select the competition.</li>
            <li>Under &quot;Bonus Card&quot;, search for and select the player — any player, any team.</li>
            <li>Click <strong>Enable</strong>. Nothing is visible to players until this is on.</li>
            <li>
              Optional: give it a custom <strong>display name</strong> if you don&apos;t want it called &quot;The [Player]
              Card&quot; — e.g. &quot;The Golden Boot Card&quot;. Leave it blank to just use the player&apos;s name automatically.
            </li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">Changing the player later</h2>
          <p className="text-sm text-gray-700">
            You can renominate a different player at any time, but this should be rare — it&apos;s asked to be
            confirmed for exactly that reason. Changing it only affects <strong>future</strong> plays: anyone who has
            already played their card keeps whoever they actually played it on, and their points don&apos;t change.
            The Picks, Results, Leaderboard and Rules pages all pick up the new name/player automatically once
            you&apos;ve made the change — nothing else needs updating by hand.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Disabling it</h2>
          <p className="text-sm text-gray-700">
            Click <strong>Disable</strong> on the same panel. This only stops <em>new</em> plays — anyone who already
            played their card keeps their points and history either way. In practice this is something you&apos;d
            mostly decide once, at the start of a new competition, rather than toggle mid-season.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">The card&apos;s image</h2>
          <p className="text-sm text-gray-700">
            There&apos;s no upload button for this — it&apos;s a fixed file, the same way the mascot and logo images
            work. See <a href="/admin/help/deploying-changes" className="underline">Making Changes Yourself</a> for the
            exact steps; the filename to replace is <code>public/bonus-card-player.png</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
