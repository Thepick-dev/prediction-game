// A richer top-of-page treatment for the rugby section, in the same spirit
// as football's hero images — purely decorative branding, no data.

export default function RugbyHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-6 px-6 py-8 md:py-10 text-center"
      style={{
        background: 'linear-gradient(135deg, rgba(250,97,0,0.18), rgba(0,242,250,0.12) 60%, rgba(125,55,165,0.15))',
        border: '2px solid rgba(255,255,255,0.12)',
      }}
    >
      <div className="text-5xl md:text-6xl mb-2" style={{ filter: 'drop-shadow(0 0 12px rgba(250,97,0,0.6))' }}>🏉</div>
      <h1 className="pop-hero pop-hero--blue text-3xl md:text-5xl">{title}</h1>
      {subtitle && (
        <p className="text-sm md:text-base mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{subtitle}</p>
      )}
    </div>
  )
}
