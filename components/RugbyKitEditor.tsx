'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'
import RugbyKitPreview, { RUGBY_KIT_PATTERNS } from './RugbyKitPreview'

const SWATCHES = [
  '#FFFFFF', '#1A1A1A', '#004225', '#7C2D12', '#1E3A8A', '#7C3AED',
  '#DC2626', '#EA580C', '#F59E0B', '#16A34A', '#0D9488', '#2563EB',
  '#DB2777', '#9CA3AF', '#450A0A', '#052E16',
]

type TabKey = 'pattern' | 'colour1' | 'colour2' | 'trim'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'pattern', label: 'Pattern' },
  { key: 'colour1', label: 'Colour 1' },
  { key: 'colour2', label: 'Colour 2' },
  { key: 'trim', label: 'Collar' },
]

export default function RugbyKitEditor({ userId }: { userId: string }) {
  const [pattern, setPattern] = useState('hoops')
  const [colour1, setColour1] = useState('#004225')
  const [colour2, setColour2] = useState('#FFFFFF')
  const [colour3, setColour3] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('pattern')

  const supabase = createClient()

  useEffect(() => { loadKit() }, [userId])

  async function loadKit() {
    setLoading(true)
    const { data } = await supabase.schema('rugby').from('player_kits').select('pattern, colour1, colour2, colour3').eq('user_id', userId).maybeSingle()
    if (data) {
      setPattern(data.pattern)
      setColour1(data.colour1)
      setColour2(data.colour2)
      setColour3(data.colour3)
    }
    setLoading(false)
  }

  async function saveKit() {
    setSaving(true)
    setMessage('')
    const { error } = await supabase.schema('rugby').from('player_kits').upsert({
      user_id: userId, pattern, colour1, colour2, colour3, updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setMessage(error ? error.message : 'Saved!')
  }

  if (loading) return <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading kit…</p>

  return (
    <div className="flex flex-col sm:flex-row gap-5 items-start">
      <RugbyKitPreview pattern={pattern} colour1={colour1} colour2={colour2} colour3={colour3} size={110} />
      <div className="flex-1 w-full">
        <div className="flex gap-2 mb-3 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="text-xs px-2.5 py-1 rounded"
              style={{
                background: activeTab === t.key ? 'var(--pop-orange)' : 'rgba(255,255,255,0.08)',
                color: activeTab === t.key ? 'var(--pop-black)' : 'rgba(255,255,255,0.7)',
                fontWeight: activeTab === t.key ? 700 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'pattern' && (
          <div className="grid grid-cols-2 gap-1.5">
            {RUGBY_KIT_PATTERNS.map(p => (
              <button
                key={p.value}
                onClick={() => setPattern(p.value)}
                className="text-xs px-2 py-1.5 rounded text-left"
                style={{
                  background: pattern === p.value ? 'var(--pop-blue)' : 'rgba(255,255,255,0.08)',
                  color: pattern === p.value ? 'var(--pop-black)' : 'rgba(255,255,255,0.7)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'colour1' && (
          <div className="grid grid-cols-8 gap-1.5">
            {SWATCHES.map(c => (
              <button key={c} onClick={() => setColour1(c)} className="w-6 h-6 rounded" style={{ background: c, outline: colour1 === c ? '2px solid var(--pop-orange)' : '1px solid rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        )}

        {activeTab === 'colour2' && (
          <div className="grid grid-cols-8 gap-1.5">
            {SWATCHES.map(c => (
              <button key={c} onClick={() => setColour2(c)} className="w-6 h-6 rounded" style={{ background: c, outline: colour2 === c ? '2px solid var(--pop-orange)' : '1px solid rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        )}

        {activeTab === 'trim' && (
          <div>
            <div className="grid grid-cols-8 gap-1.5 mb-2">
              {SWATCHES.map(c => (
                <button key={c} onClick={() => setColour3(c)} className="w-6 h-6 rounded" style={{ background: c, outline: colour3 === c ? '2px solid var(--pop-orange)' : '1px solid rgba(255,255,255,0.2)' }} />
              ))}
            </div>
            <button onClick={() => setColour3(null)} className="text-xs underline" style={{ color: 'rgba(255,255,255,0.5)' }}>No contrast collar</button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveKit} disabled={saving} className="pop-button pop-button--green text-xs" style={{ padding: '6px 14px' }}>
            {saving ? 'Saving…' : 'Save Kit'}
          </button>
          {message && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{message}</span>}
        </div>
      </div>
    </div>
  )
}
