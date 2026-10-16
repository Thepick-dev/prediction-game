// Zero-pads a number for HUD-style display (e.g. SCORE 000420). Visual
// only — callers must still expose the real, unpadded number via an
// aria-label (see RetroHudStat's srValue prop), never read the padding
// itself to a screen reader.
export function pad(n: number, width: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(width, '0')
}
