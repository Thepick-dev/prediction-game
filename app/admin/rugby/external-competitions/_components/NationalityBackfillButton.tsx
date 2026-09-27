'use client'

import { useState } from 'react'

// A standalone catch-up trigger — the automatic backfill only ever runs
// right after a fresh pull that stored new player rows, so anyone whose
// qualifying international appearances were pulled in BEFORE that
// automatic step existed never got caught up. This button re-scans
// everyone with a still-blank nationality, any time, so Kit can run it
// on demand rather than needing a whole new pull to trigger it.
export default function NationalityBackfillButton({ action }: { action: () => Promise<{ playersUpdated: number }> }) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    setPending(true)
    setResult(null)
    try {
      const r = await action()
      setResult(`Done — updated ${r.playersUpdated} player${r.playersUpdated === 1 ? '' : 's'}' nationality.`)
    } catch (e: any) {
      setResult(`Failed: ${e?.message ?? String(e)}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mb-4 flex items-center gap-3 flex-wrap">
      <button
        type="button" onClick={run} disabled={pending}
        className="px-3 py-1.5 bg-black text-white rounded text-sm disabled:opacity-50"
      >
        {pending ? 'Checking every player… (a few seconds)' : 'Backfill nationality from repeated international appearances'}
      </button>
      {result && <span className="text-sm text-gray-700">{result}</span>}
    </div>
  )
}
