interface IconProps {
  size?: number
  color?: string
  className?: string
}

// Pop-art-only icon set replacing the handful of emoji that repeat across
// the site (leader crown, streak flame, All-or-Nothing status, archive
// winner). Thick single-colour strokes so they sit on the accent palette
// instead of each device's own emoji rendering. Classic theme keeps emoji
// untouched everywhere — these are never used there.

export function CrownIcon({ size = 16, color = 'var(--pop-yellow)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 18h16M4.5 18l1-8L9 12l3-6 3 6 3.5-2 1 8" />
      <circle cx="5.5" cy="10" r="1" fill={color} stroke="none" />
      <circle cx="12" cy="6" r="1" fill={color} stroke="none" />
      <circle cx="18.5" cy="10" r="1" fill={color} stroke="none" />
    </svg>
  )
}

export function FlameIcon({ size = 16, color = 'var(--pop-orange)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M12 2c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-2.5-1.5-4-1.5-4s.5 2.5-1 3.5c-1.5 1-3-0.5-2-2C15 8 12 6 12 2z" />
    </svg>
  )
}

export function BoltIcon({ size = 16, color = 'var(--pop-pink)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  )
}

export function CheckIcon({ size = 16, color = 'var(--pop-green)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

export function CrossIcon({ size = 16, color = 'var(--pop-red)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  )
}

export function TrophyIcon({ size = 16, color = 'var(--pop-pink)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M8 3h8v2h3a1 1 0 0 1 1 1c0 3-2 5-4.5 5.3A5 5 0 0 1 13 15v3h3v2H8v-2h3v-3a5 5 0 0 1-2.5-3.7C6 10 4 8 4 5a1 1 0 0 1 1-1h3V3z" />
    </svg>
  )
}

// Vibes Champion — admin-assigned, see profiles.is_vibes_champion.
export function ShadesIcon({ size = 16, color = 'var(--pop-blue)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10h6a3 3 0 0 1-3 5 3 3 0 0 1-3-5Z" />
      <path d="M15 10h6a3 3 0 0 1-3 5 3 3 0 0 1-3-5Z" />
      <path d="M9 10h6" />
    </svg>
  )
}

// Cash pool — admin-assigned, see profiles.in_cash_pool.
export function PoundCoinIcon({ size = 16, color = 'var(--pop-orange)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.3 15.5h6M8 11.6h4.2M9.3 15.5V8.7a2.6 2.6 0 0 1 4.5-1.7" />
    </svg>
  )
}
