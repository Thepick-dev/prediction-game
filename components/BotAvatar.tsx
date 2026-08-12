// Futzy's avatar wherever a real player would get a KitBadge — the actual
// site mascot mark (same image used in the full-screen loading animation,
// see MascotWithCapPhoto.tsx / logo.png), not a generic robot emoji.
// Clipped to a circle so it drops into the same slot as a kit badge.
export default function BotAvatar({ size }: { size: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <img
        src="/logo.png"
        alt="Futzy"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </span>
  )
}
