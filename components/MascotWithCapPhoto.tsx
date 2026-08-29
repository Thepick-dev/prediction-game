// The full mascot with a real player photo patched onto the front of the
// cap. Deliberately layered in code rather than baked into logo.png itself
// — swapping in a different player is just replacing the one file at
// public/mascot-cap-photo.png, no code change needed. Only ever used in
// the full-screen loading animation, never the small header logo (see
// PopArtLoading.tsx) — that split is intentional, not an oversight.
//
// Renders immediately, unconditionally — both images are small and
// preloaded (see app/layout.tsx's <link rel="preload">), so there's no
// good reason to hide the mascot behind an "onLoad" gate. An earlier
// version did exactly that (opacity 0 until both images fired onLoad),
// which meant the bounce-in CSS animation — its clock starts the instant
// this div mounts, whether visible or not — was often already partway
// through its cycle by the time the gate lifted: a clipped, awkward pop
// instead of a clean bounce. Simpler and faster to just show it.
export default function MascotWithCapPhoto({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{ position: 'relative', aspectRatio: '1118 / 960', ...style }}
    >
      <img
        src="/logo.png"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <img
        src="/mascot-cap-photo.png"
        alt=""
        style={{
          position: 'absolute',
          left: '40%',
          top: '12.5%',
          width: '8.6%',
          aspectRatio: '220 / 278',
          objectFit: 'cover',
          borderRadius: '50%',
          border: '2.5px solid white',
          transform: 'translate(-50%, -50%) rotate(-8deg)',
        }}
      />
    </div>
  )
}
