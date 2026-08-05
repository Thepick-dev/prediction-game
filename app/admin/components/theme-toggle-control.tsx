'use client'

import { usePopArtTheme } from '../../lib/usePopArtTheme'

// The only place the Classic/Pop Art switch lives — regular users always
// get Pop Art with no way to change it (see usePopArtTheme), so this is an
// admin-only escape hatch to compare against Classic, not a feature for
// every page to expose its own floating button for.
export default function ThemeToggleControl({ userId }: { userId: string }) {
  const { popArt, toggle } = usePopArtTheme(userId)

  return (
    <div className="bg-white border rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Site Theme (you only)</p>
        <p className="font-bold text-sm">Currently: {popArt ? 'Pop Art' : 'Classic'}</p>
      </div>
      <button
        onClick={toggle}
        className="border rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-gray-50"
      >
        Switch to {popArt ? 'Classic' : 'Pop Art'}
      </button>
    </div>
  )
}
