// Shared "Q1".."Q4" -> ring colour mapping, pop-art only. Matches the same
// blue/green/yellow/red meaning already used for the Q-badges on Picks and
// Results (see quartileColours in app/picks/page.tsx), just as CSS custom
// property values instead of Tailwind classes, for use as a crest ring.
export const QUARTILE_RING_COLORS: Record<string, string> = {
  Q1: 'var(--pop-blue)',
  Q2: 'var(--pop-green)',
  Q3: 'var(--pop-yellow)',
  Q4: 'var(--pop-red)',
}
