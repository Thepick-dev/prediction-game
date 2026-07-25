'use client'

import { useState } from 'react'
import { createClient } from '../app/lib/supabase'
import KitBadge from './KitBadge'

type Member = {
  display_name: string
  kit_pattern: string
  kit_colour_1: string
  kit_colour_2: string
}

// Wraps any mention of "the Sporting Panel" in the rules text — click it and
// see who's actually on it right now, with their shirt. Fetched lazily
// (only on first click), and cached after that so re-clicking any mention
// on the page doesn't re-fetch.
let cachedMembers: Member[] | null = null

export default function SportingPanelLink({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<Member[] | null>(cachedMembers)
  const [loading, setLoading] = useState(false)

  async function openPopup() {
    setOpen(true)
    if (cachedMembers !== null) return
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('display_name, kit_pattern, kit_colour_1, kit_colour_2')
      .eq('is_sporting_panel', true)
      .order('display_name')
    const result = (data ?? []).map(m => ({
      display_name: m.display_name ?? 'Unknown',
      kit_pattern: m.kit_pattern ?? 'solid',
      kit_colour_1: m.kit_colour_1 ?? '#1E4D6B',
      kit_colour_2: m.kit_colour_2 ?? '#F5ECD9',
    }))
    cachedMembers = result
    setMembers(result)
    setLoading(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPopup}
        className="underline decoration-dotted underline-offset-2 font-bold"
        style={{ color: '#D9A441' }}
      >
        {children}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-lg p-5 border"
            style={{ backgroundColor: '#1e1914', borderColor: 'rgba(217,164,65,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3
              className="text-sm font-bold uppercase tracking-wider mb-1 leading-snug"
              style={{ color: '#D9A441', fontFamily: 'var(--font-heading), serif' }}
            >
              The Sporting Panel for the Avoidance of Manifestly Unfair Outcomes
            </h3>
            <p className="text-xs text-[#F5ECD9]/50 mb-4 uppercase tracking-wider">Current members</p>

            {loading ? (
              <p className="text-sm text-[#F5ECD9]/50">Loading...</p>
            ) : members && members.length > 0 ? (
              <div className="space-y-2.5">
                {members.map((m, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <KitBadge pattern={m.kit_pattern} colour1={m.kit_colour_1} colour2={m.kit_colour_2} size={26} />
                    <span className="text-sm font-bold uppercase text-[#F5ECD9]">{m.display_name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#F5ECD9]/50">No panel members have been appointed yet.</p>
            )}

            <button
              onClick={() => setOpen(false)}
              className="w-full mt-5 rounded-lg py-2 text-xs font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#D9A441', color: '#241a12' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
