'use client'

// Pop-art is the only theme now — Classic has been retired, including the
// admin-only escape hatch that used to allow switching to it for
// reference (see git history for that mechanism if it's ever needed
// again). Kept as a hook rather than inlining `true` everywhere so every
// page that reads `popArt` doesn't need touching if theming ever changes
// again.
export function usePopArtTheme(_userId: string | undefined) {
  return { popArt: true }
}
