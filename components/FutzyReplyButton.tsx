'use client'

import { useState } from 'react'

// Admin-only trigger, shown next to an already-approved Wall comment (see
// app/wall/page.tsx). Generates a draft reply via Gemini in Futzy's voice
// and queues it in the normal pending-approval flow — nothing here posts
// anything directly; the actual approve/discard step happens on
// /admin/wall exactly like any human reply.
const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'funny', label: 'Funny' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'sad', label: 'Sad' },
] as const

type Tone = (typeof TONES)[number]['value']

export default function FutzyReplyButton({
  targetType, targetId, popArt,
}: {
  targetType: 'pick' | 'comment'
  targetId: string
  popArt: boolean
}) {
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState<Tone>('funny')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function generate() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/futzy-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, tone, hint: hint.trim() || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, message: 'Queued for approval — check Admin > Wall.' })
        setHint('')
      } else {
        setResult({ ok: false, message: data.error ?? 'Something went wrong.' })
      }
    } catch {
      setResult({ ok: false, message: 'Something went wrong.' })
    } finally {
      setLoading(false)
    }
  }

  const accent = popArt ? 'var(--pop-blue)' : '#60A5FA'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] uppercase tracking-wide font-bold"
        style={{ color: accent }}
      >
        🤖 Futzy reply
      </button>
    )
  }

  return (
    <div
      className="mt-1.5 p-2 rounded-lg max-w-xs"
      style={{ background: popArt ? 'rgba(0,242,250,0.08)' : 'rgba(96,165,250,0.08)', border: `1px solid ${popArt ? 'rgba(0,242,250,0.25)' : 'rgba(96,165,250,0.25)'}` }}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {TONES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTone(t.value)}
            className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
            style={{
              background: tone === t.value ? accent : 'transparent',
              color: tone === t.value ? '#000' : 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={hint}
        onChange={e => setHint(e.target.value)}
        placeholder="Optional hint (e.g. mention his GW3 pick)"
        className="text-xs w-full rounded px-2 py-1 mb-1.5"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'inherit' }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="text-[10px] uppercase font-bold px-2 py-1 rounded disabled:opacity-50"
          style={{ background: accent, color: '#000' }}
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null) }}
          className="text-[10px] uppercase font-bold"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          Cancel
        </button>
      </div>
      {result && (
        <p className="text-[10px] mt-1.5" style={{ color: result.ok ? (popArt ? 'var(--pop-green)' : '#4ADE80') : (popArt ? 'var(--pop-red)' : '#F87171') }}>
          {result.message}
        </p>
      )}
    </div>
  )
}
