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

const SWATCHES = [
  '#FFFFFF', '#F5ECD9', '#2A1F17', '#1A1A1A',
  '#E8552B', '#B5493C', '#DC2626', '#7A2426',
  '#1E4D6B', '#3C5A6B', '#1D4ED8', '#0EA5E9',
  '#2F3E2E', '#16A34A', '#4ADE80', '#065F46',
  '#D9A441', '#FBBF24', '#F59E0B', '#EAB308',
  '#7C3AED', '#A855F7', '#EC4899', '#463A4A',
]

type Kit = { pattern: string; colour1: string; colour2: string; colour3: string | null }

// Shared by the Settings page's "Your Kit" card and the header's click-the-
// shirt popup — one editor, one save/shuffle implementation, so the two
// entry points can never quietly drift apart.
export default function KitEditor({
  userId,
  onSaved,
  compact = false,
}: {
  userId: string
  onSaved?: (kit: Kit) => void
  compact?: boolean
}) {
  const [kitPattern, setKitPattern] = useState('solid')
  const [kitColour1, setKitColour1] = useState('#1E4D6B')
  const [kitColour2, setKitColour2] = useState('#F5ECD9')
  const [kitColour3, setKitColour3] = useState<string | null>(null)
  const [kitStars, setKitStars] = useState(0)
  const [kitEarths, setKitEarths] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
  }

  if (loading) {
    return <p className="text-sm text-[#F5ECD9]/50 text-center py-4">Loading...</p>
  }

  const swatchSize = compact ? 'w-6 h-6' : 'w-8 h-8'
  const btnClass = "w-full rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
  const btnStyle = { backgroundColor: '#D9A441', color: '#241a12' }

  return (
    <div>
      <div className="flex justify-center mb-3">
        <KitPreview pattern={kitPattern} colour1={kitColour1} colour2={kitColour2} colour3={kitColour3} stars={kitStars} earths={kitEarths} size={compact ? 100 : 140} />
      </div>
      {(kitStars > 0 || kitEarths > 0) && (
        <p className="text-xs text-center text-[#F5ECD9]/40 mb-3">Awarded by the league admin.</p>
      )}

      <div className="flex justify-center mb-4">
        <button
          onClick={shuffleKit}
          type="button"
          className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441] hover:bg-[#D9A441]/10 transition-colors"
        >
          🎲 Shuffle
        </button>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Pattern</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {PATTERNS.map(p => (
          <button
            key={p.value}
            onClick={() => setKitPattern(p.value)}
            className={`flex flex-col items-center gap-1 p-2 rounded border text-xs ${
              kitPattern === p.value ? 'border-[#D9A441] bg-[#D9A441]/10 font-bold' : 'border-white/10'
            }`}
          >
            <KitBadge pattern={p.value} colour1={kitColour1} colour2={kitColour2} colour3={kitColour3} size={28} />
            {!compact && <span className="text-center">{p.label}</span>}
          </button>
        ))}
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Colour 1</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {SWATCHES.map(colour => (
          <button
            key={colour}
            onClick={() => setKitColour1(colour)}
            className={`${swatchSize} rounded-full border-2 ${kitColour1 === colour ? 'border-[#D9A441]' : 'border-transparent'}`}
            style={{ backgroundColor: colour }}
          />
        ))}
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Colour 2</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {SWATCHES.map(colour => (
          <button
            key={colour}
            onClick={() => setKitColour2(colour)}
            className={`${swatchSize} rounded-full border-2 ${kitColour2 === colour ? 'border-[#D9A441]' : 'border-transparent'}`}
            style={{ backgroundColor: colour }}
          />
        ))}
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-[#F5ECD9]/50 mb-2">Trim (collar &amp; cuffs, optional)</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setKitColour3(null)}
          className={`${swatchSize} rounded-full border-2 flex items-center justify-center text-[#F5ECD9]/60 ${
            kitColour3 === null ? 'border-[#D9A441]' : 'border-white/10'
          }`}
          style={{ backgroundColor: 'transparent' }}
          title="No trim"
        >
          ✕
        </button>
        {SWATCHES.map(colour => (
          <button
            key={colour}
            onClick={() => setKitColour3(colour)}
            className={`${swatchSize} rounded-full border-2 ${kitColour3 === colour ? 'border-[#D9A441]' : 'border-transparent'}`}
            style={{ backgroundColor: colour }}
          />
        ))}
      </div>

      {message && (
        <p className={`text-sm mb-3 ${message.startsWith('Kit saved') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
      )}
      <button onClick={saveKit} disabled={saving} className={btnClass} style={btnStyle}>
        {saving ? 'Saving...' : 'Save Kit'}
      </button>
    </div>
  )
}
