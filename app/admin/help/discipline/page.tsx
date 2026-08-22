export default function DisciplineHelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">How-To: Yellow &amp; Red Cards</h1>
      <p className="text-gray-500 text-sm mb-8">Issuing and managing the discipline system from the Discipline page.</p>

      <div className="space-y-6 max-w-2xl">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-blue-900">What it is</h2>
          <p className="text-sm text-gray-700">
            You can issue a yellow or red card to any player for any conduct you judge worthy of one — it&apos;s
            entirely your call, there&apos;s no fixed offense list. A straight red, or a player&apos;s <strong>second</strong>{' '}
            unresolved yellow this competition, triggers a suspension: they score zero for however many gameweeks
            it covers, but keep every team, player, Banker and Bonus Card use — nothing is spent, since they simply
            don&apos;t get a pick that week. Everything happens on the{' '}
            <a href="/admin/discipline" className="underline">Discipline page</a>.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Issuing a card</h2>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>Search for the player, pick Yellow or Red, and write the reason — this is shown to everyone who clicks the card, so word it as you&apos;d want them to read it.</li>
            <li>If this card triggers a suspension (a red, or a 2nd unresolved yellow — the form tells you which), a section appears letting you pick the starting gameweek and the length in gameweeks.</li>
            <li>
              The length defaults to the escalation pattern — 1st suspension = 1 gameweek, 2nd = 2, and so on — but
              you can change the number for a particularly bad straight red, or any other reason. That&apos;s your
              call entirely; the default is just a starting point.
            </li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="font-bold mb-2 text-yellow-800">Two yellows</h2>
          <p className="text-sm text-gray-700">
            Once two unresolved yellows combine into a suspension, the count resets — both yellows are &quot;spent&quot;,
            so a future yellow starts counting from zero again, not from where the last suspension left off.
          </p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Appeals</h2>
          <p className="text-sm text-gray-700">
            There&apos;s no in-app appeal form — a player raises it with the Sporting Panel the same way as any other
            dispute, and you record the outcome here:
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-2 mt-2">
            <li><strong>Appeal fully upheld</strong> — click <strong>Rescind</strong> on the card. If it had triggered a suspension, that suspension is overturned immediately and the player can pick again straight away, even mid-ban. If it was one of a pair of yellows, the other yellow is freed too (it goes back to being unresolved).</li>
            <li><strong>Appeal partly upheld</strong> — use <strong>− Remove last gameweek</strong> under the suspension to shorten it, without overturning it entirely.</li>
            <li><strong>Reversed a decision, or rescinded by mistake</strong> — click <strong>Reinstate</strong> on a rescinded card. This doesn&apos;t automatically bring back the exact suspension it had (those gameweeks may have moved on) — issue a fresh one from here if a ban should still apply.</li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="font-bold mb-2">Where it shows up</h2>
          <p className="text-sm text-gray-700">
            Card counts and an active &quot;Suspended&quot; tag appear next to a player&apos;s name on the Leaderboard —
            click either to see the full reason and history. A suspended player with no pick shows as a distinct
            SUSPENDED row on Results instead of just being missing. Both are visible to everyone, not just admins —
            the whole point is that discipline is transparent.
          </p>
        </div>
      </div>
    </div>
  )
}
