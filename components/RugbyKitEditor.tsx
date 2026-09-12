'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'
import RugbyKitPreview, { RUGBY_KIT_PATTERNS } from './RugbyKitPreview'

// Same genuine-spectrum ordering as football's components/KitEditor.tsx
// (SWATCHES there): group order runs round the colour wheel, each group's
// 6 shades run light to dark, and the flattening is TRANSPOSED (one row
// per shade level, read across every hue) so moving in any direction is
// always one small step. Kept as its own copy rather than importing
// football's — this file must never depend on a football-facing module.
const SWATCH_GROUPS: { label: string; colours: string[] }[] = [
  { label: 'Neutrals', colours: ['#FFFFFF', '#F5ECD9', '#D6C7A1', '#9CA3AF', '#2A1F17', '#1A1A1A'] },
  { label: 'Reds', colours: ['#FECACA', '#F87171', '#EF4444', '#DC2626', '#991B1B', '#450A0A'] },
  { label: 'Oranges', colours: ['#FED7AA', '#FB923C', '#F97316', '#EA580C', '#9A3412', '#431407'] },
  { label: 'Golds', colours: ['#FDE68A', '#FBBF24', '#F59E0B', '#D97706', '#92400E', '#451A03'] },
  { label: 'Limes', colours: ['#D9F99D', '#A3E635', '#84CC16', '#65A30D', '#3F6212', '#1A2E05'] },
  { label: 'Greens', colours: ['#BBF7D0', '#4ADE80', '#22C55E', '#16A34A', '#166534', '#052E16'] },
  { label: 'Teals', colours: ['#99F6E4', '#2DD4BF', '#14B8A6', '#0D9488', '#115E59', '#042F2E'] },
  { label: 'Blues', colours: ['#BFDBFE', '#60A5FA', '#3B82F6', '#2563EB', '#1E40AF', '#172554'] },
  { label: 'Purples', colours: ['#DDD6FE', '#A78BFA', '#8B5CF6', '#7C3AED', '#5B21B6', '#2E1065'] },
  { label: 'Magentas', colours: ['#FBCFE8', '#F472B6', '#EC4899', '#DB2777', '#9D174D', '#500724'] },
]
const SWATCHES = SWATCH_GROUPS[0].colours.map((_, shadeIndex) => SWATCH_GROUPS.map(g => g.colours[shadeIndex])).flat()
const SWATCH_GRID_COLUMNS = SWATCH_GROUPS.length

type SavedKit = {
  pattern: string; colour1: string; colour2: string; colour3: string | null
  backText: string | null; backShape: 'circle' | 'square'; backShapeColour: string; backTextColour: string
  shortsColour: string | null; socksColour: string | null; socksHooped: boolean; socksColour2: string | null
}
type TabKey = 'pattern' | 'colour1' | 'colour2' | 'trim' | 'number' | 'shorts' | 'socks'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'pattern', label: 'Pattern' },
  { key: 'colour1', label: 'Colour 1' },
  { key: 'colour2', label: 'Colour 2' },
  { key: 'trim', label: 'Collar' },
  { key: 'number', label: 'Number' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'socks', label: 'Socks' },
]

export default function RugbyKitEditor({
  userId,
  onSaved,
  compact = false,
}: {
  userId: string
  onSaved?: (kit: SavedKit) => void
  compact?: boolean
}) {
  const [pattern, setPattern] = useState('hoops')
  const [colour1, setColour1] = useState('#004225')
  const [colour2, setColour2] = useState('#FFFFFF')
  const [colour3, setColour3] = useState<string | null>(null)
  const [backText, setBackText] = useState<string | null>(null)
  const [backShape, setBackShape] = useState<'circle' | 'square'>('circle')
  const [backShapeColour, setBackShapeColour] = useState('#FFFFFF')
  const [backTextColour, setBackTextColour] = useState('#000000')
  const [shortsColour, setShortsColour] = useState<string | null>(null)
  const [socksColour, setSocksColour] = useState<string | null>(null)
  const [socksHooped, setSocksHooped] = useState(false)
  const [socksColour2, setSocksColour2] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [shuffleSpin, setShuffleSpin] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('pattern')

  const supabase = createClient()

  useEffect(() => { loadKit() }, [userId])

  async function loadKit() {
    setLoading(true)
    const { data } = await supabase.schema('rugby').from('player_kits')
      .select('pattern, colour1, colour2, colour3').eq('user_id', userId).maybeSingle()
    if (data) {
      setPattern(data.pattern)
      setColour1(data.colour1)
      setColour2(data.colour2)
      setColour3(data.colour3)
    }
    // Its own separate query, deliberately not bundled with the one above:
    // these columns are newer than pattern/colour1/colour2/colour3, so if
    // they don't exist yet in the database this must only mean the new
    // fields stay at their defaults — it must never break loading the
    // kit's already-established pattern/colours too.
    const { data: extras } = await supabase.schema('rugby').from('player_kits')
      .select('back_text, back_shape, back_shape_colour, back_text_colour, shorts_colour, socks_colour, socks_hooped, socks_colour2')
      .eq('user_id', userId).maybeSingle()
    if (extras) {
      setBackText(extras.back_text ?? null)
      setBackShape((extras.back_shape as 'circle' | 'square') ?? 'circle')
      setBackShapeColour(extras.back_shape_colour ?? '#FFFFFF')
      setBackTextColour(extras.back_text_colour ?? '#000000')
      setShortsColour(extras.shorts_colour ?? null)
      setSocksColour(extras.socks_colour ?? null)
      setSocksHooped(!!extras.socks_hooped)
      setSocksColour2(extras.socks_colour2 ?? null)
    }
    setLoading(false)
  }

  async function saveKit() {
    setSaving(true)
    setMessage('')
    const { error } = await supabase.schema('rugby').from('player_kits').upsert({
      user_id: userId, pattern, colour1, colour2, colour3, updated_at: new Date().toISOString(),
    })
    if (error) {
      setSaving(false)
      setMessage(error.message)
      return
    }
    // Saved as its own update, deliberately separate from the one above:
    // these are newer, optional columns, so if they aren't there yet in
    // the database this shouldn't block saving pattern/colour changes,
    // which have worked here all along.
    const { error: extrasError } = await supabase.schema('rugby').from('player_kits').update({
      back_text: backText, back_shape: backShape, back_shape_colour: backShapeColour, back_text_colour: backTextColour,
      shorts_colour: shortsColour, socks_colour: socksColour, socks_hooped: socksHooped, socks_colour2: socksColour2,
    }).eq('user_id', userId)
    setSaving(false)
    setMessage(extrasError ? 'Kit saved (number/shorts/socks not saved — ask the admin to check the database)' : 'Kit saved')
    if (!extrasError) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1400)
      onSaved?.({ pattern, colour1, colour2, colour3, backText, backShape, backShapeColour, backTextColour, shortsColour, socksColour, socksHooped, socksColour2 })
    }
  }

  // One-click random kit — pure client-side, nothing saved until Save Kit.
  function shuffleKit() {
    const randomPattern = RUGBY_KIT_PATTERNS[Math.floor(Math.random() * RUGBY_KIT_PATTERNS.length)].value
    const randomSwatch = () => SWATCHES[Math.floor(Math.random() * SWATCHES.length)]
    setPattern(randomPattern)
    setColour1(randomSwatch())
    setColour2(randomSwatch())
    // One time in three, no contrast collar — keeps "no collar" a genuinely
    // common, deliberate-looking result rather than every shuffle adding one.
    setColour3(Math.random() < 0.33 ? null : randomSwatch())
    setBackText(String(Math.floor(Math.random() * 99) + 1))
    setBackShape(Math.random() < 0.5 ? 'circle' : 'square')
    setBackShapeColour(randomSwatch())
    setBackTextColour(randomSwatch())
    setShortsColour(randomSwatch())
    setSocksColour(randomSwatch())
    setSocksHooped(Math.random() < 0.4)
    setSocksColour2(randomSwatch())
    setMessage('')
    setShuffleSpin(true)
    setTimeout(() => setShuffleSpin(false), 500)
  }

  if (loading) return <p className="text-sm text-center py-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading kit…</p>

  const sectionClass = `pop-panel ${compact ? 'p-2 mb-2' : 'p-3 mb-3'}`
  const swatchMaxSize = compact ? 22 : 28
  const previewSize = compact ? 90 : 150

  function SwatchPicker({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
    return (
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${SWATCH_GRID_COLUMNS}, 1fr)`, justifyItems: 'center' }}>
        {SWATCHES.map(c => {
          const selectedHere = selected === c
          return (
            <button
              key={c}
              onClick={() => onSelect(c)}
              className={`aspect-square rounded-full ${selectedHere ? 'pop-pop-in' : ''}`}
              style={{
                width: '100%',
                maxWidth: swatchMaxSize,
                backgroundColor: c,
                border: selectedHere ? '3px solid var(--pop-green)' : '3px solid rgba(255,255,255,0.2)',
                boxShadow: selectedHere ? '0 0 12px rgba(204,250,0,0.6)' : 'none',
              }}
            />
          )
        })}
      </div>
    )
  }

  const previewProps = {
    pattern, colour1, colour2, colour3,
    shortsColour, socksColour, socksHooped, socksColour2,
    backText, backShape, backShapeColour, backTextColour,
  }

  return (
    <div>
      <div
        className={`rounded-xl ${compact ? 'p-2 mb-2' : 'p-5 mb-3'} flex items-center justify-center gap-4`}
        style={{ background: 'radial-gradient(circle at 50% 30%, rgba(160,0,250,0.14), rgba(255,255,255,0.03) 70%)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex flex-col items-center gap-1">
          <RugbyKitPreview {...previewProps} view="front" size={previewSize} />
          {!compact && <span className="text-[9px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>Front</span>}
        </div>
        <div className="flex flex-col items-center gap-1">
          <RugbyKitPreview {...previewProps} view="back" size={previewSize} />
          {!compact && <span className="text-[9px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>Back</span>}
        </div>
      </div>

      <div className={`flex justify-center ${compact ? 'mb-2' : 'mb-4'}`}>
        <button
          onClick={shuffleKit}
          type="button"
          className={`pop-button pop-button--yellow px-3 py-1.5 text-xs ${shuffleSpin ? 'pop-shuffle-spin' : ''}`}
        >
          Shuffle
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {TABS.map(t => {
          const active = activeTab === t.key
          const previewColour = t.key === 'colour1' ? colour1 : t.key === 'colour2' ? colour2 : t.key === 'trim' ? colour3
            : t.key === 'shorts' ? shortsColour : t.key === 'socks' ? socksColour : null
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex flex-col items-center gap-1 ${compact ? 'py-1' : 'py-2'} rounded-lg text-[10px] font-black uppercase tracking-wide`}
              style={{
                border: active ? '2px solid var(--pop-green)' : '2px solid rgba(255,255,255,0.15)',
                boxShadow: active ? '0 0 14px rgba(204,250,0,0.4)' : 'none',
                background: active ? 'rgba(204,250,0,0.12)' : 'transparent',
                color: active ? 'var(--pop-green)' : 'rgba(255,255,255,0.55)',
              }}
            >
              {t.key === 'pattern' ? (
                <RugbyKitPreview pattern={pattern} colour1={colour1} colour2={colour2} colour3={colour3} size={18} />
              ) : t.key === 'number' ? (
                <span className="rounded-full shrink-0 flex items-center justify-center" style={{ width: 16, height: 16, background: backShapeColour, color: backTextColour, fontSize: 8, fontWeight: 900, border: '1.5px solid rgba(255,255,255,0.3)' }}>
                  {backText ? backText.slice(0, 2) : '#'}
                </span>
              ) : previewColour ? (
                <span className="rounded-full shrink-0" style={{ width: 16, height: 16, background: previewColour, border: '1.5px solid rgba(255,255,255,0.3)' }} />
              ) : (
                <span className="rounded-full shrink-0 flex items-center justify-center" style={{ width: 16, height: 16, border: '1.5px dashed currentColor', fontSize: 8 }}>✕</span>
              )}
              {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'pattern' && (
        <div className={sectionClass}>
          <div className={compact ? 'grid grid-cols-4 gap-1' : 'grid grid-cols-3 gap-2'}>
            {RUGBY_KIT_PATTERNS.map(p => {
              const selected = pattern === p.value
              return (
                <button
                  key={p.value}
                  onClick={() => setPattern(p.value)}
                  className={`flex flex-col items-center gap-1 ${compact ? 'p-1' : 'p-2'} rounded-lg text-xs ${selected ? 'pop-pop-in' : ''}`}
                  style={{
                    border: selected ? '2px solid var(--pop-green)' : '2px solid rgba(255,255,255,0.15)',
                    boxShadow: selected ? '0 0 14px rgba(204,250,0,0.4)' : 'none',
                    background: selected ? 'rgba(204,250,0,0.12)' : 'transparent',
                    color: 'var(--pop-white)',
                  }}
                >
                  <RugbyKitPreview pattern={p.value} colour1={colour1} colour2={colour2} colour3={colour3} size={compact ? 22 : 28} />
                  {!compact && <span className="text-center">{p.label}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'colour1' && (
        <div className={sectionClass}>
          <SwatchPicker selected={colour1} onSelect={setColour1} />
        </div>
      )}

      {activeTab === 'colour2' && (
        <div className={sectionClass}>
          <SwatchPicker selected={colour2} onSelect={setColour2} />
        </div>
      )}

      {activeTab === 'trim' && (
        <div className={sectionClass}>
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Collar trim (optional)</p>
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <button
              onClick={() => setColour3(null)}
              className={`rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${compact ? 'w-5 h-5' : 'w-6 h-6'} ${colour3 === null ? 'pop-pop-in' : ''}`}
              style={{
                background: 'transparent',
                color: 'var(--pop-white)',
                border: colour3 === null ? '3px solid var(--pop-green)' : '3px solid rgba(255,255,255,0.2)',
                boxShadow: colour3 === null ? '0 0 12px rgba(204,250,0,0.6)' : 'none',
              }}
              title="No contrast collar"
            >
              ✕
            </button>
            <span className="text-[9px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>No contrast collar</span>
          </div>
          <SwatchPicker selected={colour3 ?? ''} onSelect={setColour3} />
        </div>
      )}

      {activeTab === 'number' && (
        <div className={sectionClass}>
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Your number or initial</p>
          <input
            type="text"
            value={backText ?? ''}
            onChange={e => setBackText(e.target.value.slice(0, 2).toUpperCase() || null)}
            maxLength={2}
            placeholder="e.g. 8 or KH"
            className="pop-input px-3 py-2 text-sm w-full mb-3"
          />
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Shape</p>
          <div className="flex gap-2 mb-3">
            {(['circle', 'square'] as const).map(shape => (
              <button
                key={shape}
                type="button"
                onClick={() => setBackShape(shape)}
                className="text-xs px-3 py-1.5 capitalize"
                style={{
                  background: backShape === shape ? 'var(--pop-green)' : 'rgba(255,255,255,0.08)',
                  color: backShape === shape ? 'var(--pop-black)' : 'rgba(255,255,255,0.6)',
                  borderRadius: shape === 'circle' ? 999 : 6,
                  fontWeight: backShape === shape ? 700 : 400,
                }}
              >
                {shape}
              </button>
            ))}
          </div>
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Shape colour</p>
          <div className="mb-3"><SwatchPicker selected={backShapeColour} onSelect={setBackShapeColour} /></div>
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Number colour</p>
          <SwatchPicker selected={backTextColour} onSelect={setBackTextColour} />
        </div>
      )}

      {activeTab === 'shorts' && (
        <div className={sectionClass}>
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Shorts colour</p>
          <SwatchPicker selected={shortsColour ?? colour2} onSelect={setShortsColour} />
        </div>
      )}

      {activeTab === 'socks' && (
        <div className={sectionClass}>
          <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <input type="checkbox" checked={socksHooped} onChange={e => setSocksHooped(e.target.checked)} />
            Hooped socks
          </label>
          <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{socksHooped ? 'First colour' : 'Socks colour'}</p>
          <div className="mb-3"><SwatchPicker selected={socksColour ?? colour1} onSelect={setSocksColour} /></div>
          {socksHooped && (
            <>
              <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Hoop colour</p>
              <SwatchPicker selected={socksColour2 ?? colour2} onSelect={setSocksColour2} />
            </>
          )}
        </div>
      )}

      {message && (
        <p className={`pop-badge ${message === 'Kit saved' ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{message}</p>
      )}
      <button
        onClick={saveKit}
        disabled={saving}
        className={`pop-button ${justSaved ? 'pop-button--green pop-celebrate' : ''} w-full py-2.5 text-sm`}
      >
        {saving ? 'Saving…' : justSaved ? 'Kit Saved!' : 'Save Kit'}
      </button>
    </div>
  )
}
