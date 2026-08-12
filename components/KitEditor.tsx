'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'
import KitBadge from './KitBadge'
import KitPreview from './KitPreview'

const PATTERNS = [
  { value: 'solid', label: 'Solid' },
  { value: 'horizontal', label: 'Horizontal Stripes' },
  { value: 'vertical', label: 'Vertical Stripes' },
  { value: 'halves', label: 'Halves' },
  { value: 'sleeves', label: 'Different Sleeves' },
  { value: 'hoops', label: 'Hoops' },
  { value: 'sash', label: 'Sash' },
  { value: 'quarters', label: 'Quarters' },
  { value: 'pinstripes', label: 'Pinstripes' },
]

// Grouped by hue (each group is 4 shades, muted-to-vivid) rather than one
// flat, visually random-looking block — SWATCHES below stays the flattened
// version classic mode still uses unchanged.
const SWATCH_GROUPS: { label: string; colours: string[] }[] = [
  { label: 'Neutrals', colours: ['#FFFFFF', '#F5ECD9', '#2A1F17', '#1A1A1A'] },
  { label: 'Reds', colours: ['#E8552B', '#B5493C', '#DC2626', '#7A2426'] },
  { label: 'Blues', colours: ['#1E4D6B', '#3C5A6B', '#1D4ED8', '#0EA5E9'] },
  { label: 'Greens', colours: ['#2F3E2E', '#16A34A', '#4ADE80', '#065F46'] },
  { label: 'Golds', colours: ['#D9A441', '#FBBF24', '#F59E0B', '#EAB308'] },
  { label: 'Purples', colours: ['#7C3AED', '#A855F7', '#EC4899', '#463A4A'] },
  { label: 'Teals', colours: ['#0D9488', '#14B8A6', '#06B6D4', '#155E75'] },
  { label: 'Limes', colours: ['#84CC16', '#65A30D', '#CCFA00', '#3F6212'] },
  { label: 'Oranges', colours: ['#F97316', '#FB923C', '#FDBA74', '#9A3412'] },
  { label: 'Magentas', colours: ['#BE185D', '#F472B6', '#6B21A8', '#312E81'] },
]
const SWATCHES = SWATCH_GROUPS.flatMap(g => g.colours)

type Kit = { pattern: string; colour1: string; colour2: string; colour3: string | null }

// Shared by the Settings page's "Your Kit" card and the header's click-the-
// shirt popup — one editor, one save/shuffle implementation, so the two
// entry points can never quietly drift apart.
export default function KitEditor({
  userId,
  onSaved,
  compact = false,
  theme = 'classic',
}: {
  userId: string
  onSaved?: (kit: Kit) => void
  compact?: boolean
  // Only the header's popup passes 'pop-art' (mirrors Shell's own theme
  // prop) — the Settings page's embedded editor never does, so it always
  // renders exactly as before.
  theme?: 'classic' | 'pop-art'
}) {
  const isPopArt = theme === 'pop-art'
  const [kitPattern, setKitPattern] = useState('solid')
  const [kitColour1, setKitColour1] = useState('#1E4D6B')
  const [kitColour2, setKitColour2] = useState('#F5ECD9')
  const [kitColour3, setKitColour3] = useState<string | null>(null)
  const [kitStars, setKitStars] = useState(0)
  const [kitEarths, setKitEarths] = useState(0)
  const [topScore, setTopScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [shuffleSpin, setShuffleSpin] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadKit() }, [userId])

  async function loadKit() {
    setLoading(true)
    const { data: profile } = await supabase
      .from('profiles')
      .select('kit_pattern, kit_colour_1, kit_colour_2')
      .eq('id', userId)
      .single()

    // Kept as its own request, deliberately separate from the profile query
    // above: if these columns ever have a problem, it should only affect
    // the badge itself, never take down the rest of this editor with it.
    const { data: kitExtras } = await supabase
      .from('profiles')
      .select('kit_stars, kit_earths')
      .eq('id', userId)
      .single()

    // Also its own request, same reason — the trim colour is a newer,
    // optional column, and this must never be able to take the rest of
    // the kit editor down with it.
    const { data: kitTrim } = await supabase
      .from('profiles')
      .select('kit_colour_3')
      .eq('id', userId)
      .single()

    if (profile) {
      setKitPattern(profile.kit_pattern ?? 'solid')
      setKitColour1(profile.kit_colour_1 ?? '#1E4D6B')
      setKitColour2(profile.kit_colour_2 ?? '#F5ECD9')
    }
    setKitColour3(kitTrim?.kit_colour_3 ?? null)
    setKitStars(kitExtras?.kit_stars ?? 0)
    setKitEarths(kitExtras?.kit_earths ?? 0)
    setLoading(false)

    // Also its own request, same reason as above — the minigame score
    // shirt number is a separate feature entirely, so a problem with it
    // must never be able to block the rest of the kit editor loading.
    const { data: scoreRow } = await supabase
      .from('minigame_penalty_scores')
      .select('best_score')
      .eq('user_id', userId)
      .single()
    setTopScore(scoreRow?.best_score ?? 0)
  }

  async function saveKit() {
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({ kit_pattern: kitPattern, kit_colour_1: kitColour1, kit_colour_2: kitColour2 })
      .eq('id', userId)

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    // Saved as its own update, deliberately separate from the one above:
    // the trim colour is a newer, optional column, so if it isn't there
    // yet in the database this shouldn't block saving pattern/colour
    // changes, which have worked here all along.
    const { error: trimError } = await supabase
      .from('profiles')
      .update({ kit_colour_3: kitColour3 })
      .eq('id', userId)

    setMessage(trimError ? 'Kit saved (trim colour not saved — ask the admin to check the database)' : 'Kit saved')
    setSaving(false)
    if (isPopArt && !trimError) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1400)
    }
    onSaved?.({ pattern: kitPattern, colour1: kitColour1, colour2: kitColour2, colour3: kitColour3 })
  }

  // A one-click random kit for anyone who doesn't want to work through 9
  // patterns times 24x24x(24+no-trim) colour combinations by hand — pure
  // client-side randomisation, nothing saved until Save Kit is pressed.
  function shuffleKit() {
    const randomPattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)].value
    const randomSwatch = () => SWATCHES[Math.floor(Math.random() * SWATCHES.length)]
    setKitPattern(randomPattern)
    setKitColour1(randomSwatch())
    setKitColour2(randomSwatch())
    // One time in three, no trim — keeps "no trim" a genuinely common,
    // deliberate-looking result rather than the shuffle always adding one.
    setKitColour3(Math.random() < 0.33 ? null : randomSwatch())
    setMessage('')
    if (isPopArt) {
      setShuffleSpin(true)
      setTimeout(() => setShuffleSpin(false), 500)
    }
  }

  if (loading) {
    return isPopArt
      ? <p className="text-sm text-center py-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading...</p>
      : <p className="text-sm text-[#F5ECD9]/50 text-center py-4">Loading...</p>
  }

  const swatchSize = compact ? 'w-5 h-5' : 'w-6 h-6'
  const btnClass = "w-full rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
  const btnStyle = { backgroundColor: '#D9A441', color: '#241a12' }
  const labelClass = isPopArt
    ? 'text-xs font-black uppercase tracking-wider mb-2'
    : 'text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2'
  const labelStyle = isPopArt ? { color: 'rgba(255,255,255,0.5)' } : undefined

  function swatchProps(selected: boolean, colour: string) {
    return isPopArt
      ? {
          className: `${swatchSize} rounded-full shrink-0 ${selected ? 'pop-pop-in' : ''}`,
          style: {
            backgroundColor: colour,
            border: selected ? '3px solid var(--pop-green)' : '3px solid rgba(255,255,255,0.2)',
            boxShadow: selected ? '0 0 12px rgba(204,250,0,0.6)' : 'none',
          },
        }
      : {
          className: `${swatchSize} rounded-full border-2 ${selected ? 'border-[#D9A441]' : 'border-transparent'}`,
          style: { backgroundColor: colour },
        }
  }

  // In pop-art mode, each colour picker shows its swatches grouped by hue
  // with a small label per row, instead of one long undifferentiated strip
  // — classic mode keeps the original flat layout untouched.
  function SwatchPicker({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
    if (!isPopArt) {
      return (
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map(colour => (
            <button key={colour} onClick={() => onSelect(colour)} {...swatchProps(selected === colour, colour)} />
          ))}
        </div>
      )
    }
    return (
      <div className="space-y-1.5">
        {SWATCH_GROUPS.map(group => (
          <div key={group.label} className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono uppercase tracking-wide shrink-0" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', width: compact ? 44 : 54 }}>
              {group.label}
            </span>
            {group.colours.map(colour => (
              <button key={colour} onClick={() => onSelect(colour)} {...swatchProps(selected === colour, colour)} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const sectionClass = isPopArt ? 'pop-panel p-3 mb-3' : 'mb-4'

  return (
    <div>
      <div
        className={isPopArt ? 'rounded-xl p-5 mb-3 flex flex-col items-center' : 'flex justify-center mb-3'}
        style={isPopArt ? { background: 'radial-gradient(circle at 50% 30%, rgba(160,0,250,0.14), rgba(255,255,255,0.03) 70%)', border: '1px solid rgba(255,255,255,0.08)' } : undefined}
      >
        {isPopArt && <p className="pop-headline text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Your Kit</p>}
        <KitPreview pattern={kitPattern} colour1={kitColour1} colour2={kitColour2} colour3={kitColour3} stars={kitStars} earths={kitEarths} size={compact ? 130 : 190} topScore={topScore} starColor={isPopArt ? 'var(--pop-pink)' : undefined} />
      </div>
      {(kitStars > 0 || kitEarths > 0) && (
        <p
          className={isPopArt ? 'text-xs text-center mb-3 font-bold' : 'text-xs text-center text-[#F5ECD9]/40 mb-3'}
          style={isPopArt ? { color: 'rgba(255,255,255,0.5)' } : undefined}
        >
          Awarded by the league admin.
        </p>
      )}

      <div className="flex justify-center mb-4">
        <button
          onClick={shuffleKit}
          type="button"
          className={isPopArt
            ? `pop-button pop-button--yellow px-3 py-1.5 text-xs ${shuffleSpin ? 'pop-shuffle-spin' : ''}`
            : 'text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors'}
        >
          {isPopArt ? 'Shuffle' : '🎲 Shuffle'}
        </button>
      </div>

      <div className={sectionClass}>
        <p className={labelClass} style={labelStyle}>Pattern</p>
        <div className="grid grid-cols-3 gap-2">
          {PATTERNS.map(p => {
            const selected = kitPattern === p.value
            return (
              <button
                key={p.value}
                onClick={() => setKitPattern(p.value)}
                className={isPopArt
                  ? `flex flex-col items-center gap-1 p-2 rounded-lg text-xs ${selected ? 'pop-pop-in' : ''}`
                  : `flex flex-col items-center gap-1 p-2 rounded border text-xs ${selected ? 'border-[#D9A441] bg-[#D9A441]/10 font-bold' : 'border-white/10'}`}
                style={isPopArt ? {
                  border: selected ? '2px solid var(--pop-green)' : '2px solid rgba(255,255,255,0.15)',
                  boxShadow: selected ? '0 0 14px rgba(204,250,0,0.4)' : 'none',
                  background: selected ? 'rgba(204,250,0,0.12)' : 'transparent',
                  color: 'var(--pop-white)',
                } : undefined}
              >
                <KitBadge pattern={p.value} colour1={kitColour1} colour2={kitColour2} colour3={kitColour3} size={28} />
                {!compact && <span className="text-center">{p.label}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className={sectionClass}>
        <p className={labelClass} style={labelStyle}>Colour 1</p>
        <SwatchPicker selected={kitColour1} onSelect={setKitColour1} />
      </div>

      <div className={sectionClass}>
        <p className={labelClass} style={labelStyle}>Colour 2</p>
        <SwatchPicker selected={kitColour2} onSelect={setKitColour2} />
      </div>

      <div className={sectionClass}>
        <p className={labelClass} style={labelStyle}>Trim (collar &amp; cuffs, optional)</p>
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <button
            onClick={() => setKitColour3(null)}
            className={isPopArt
              ? `${swatchSize} rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${kitColour3 === null ? 'pop-pop-in' : ''}`
              : `${swatchSize} rounded-full border-2 flex items-center justify-center text-[#F5ECD9]/60 ${kitColour3 === null ? 'border-[#D9A441]' : 'border-white/10'}`}
            style={isPopArt ? {
              background: 'transparent',
              color: 'var(--pop-white)',
              border: kitColour3 === null ? '3px solid var(--pop-green)' : '3px solid rgba(255,255,255,0.2)',
              boxShadow: kitColour3 === null ? '0 0 12px rgba(204,250,0,0.6)' : 'none',
            } : { backgroundColor: 'transparent' }}
            title="No trim"
          >
            ✕
          </button>
          {isPopArt && <span className="text-[9px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>No trim</span>}
        </div>
        <SwatchPicker selected={kitColour3 ?? ''} onSelect={setKitColour3} />
      </div>

      {message && (
        isPopArt ? (
          <p className={`pop-badge ${message.startsWith('Kit saved') ? 'pop-badge--green' : 'pop-badge--red'} px-2.5 py-1 text-xs mb-3 inline-block`}>{message}</p>
        ) : (
          <p className={`text-sm mb-3 ${message.startsWith('Kit saved') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
        )
      )}
      {isPopArt ? (
        <button
          onClick={saveKit}
          disabled={saving}
          className={`pop-button ${justSaved ? 'pop-button--green pop-celebrate' : ''} w-full py-2.5 text-sm`}
        >
          {saving ? 'Saving...' : justSaved ? 'Kit Saved!' : 'Save Kit'}
        </button>
      ) : (
        <button onClick={saveKit} disabled={saving} className={btnClass} style={btnStyle}>
          {saving ? 'Saving...' : 'Save Kit'}
        </button>
      )}
    </div>
  )
}
