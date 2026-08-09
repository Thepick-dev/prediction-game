interface TeamCrestProps {
  crestUrl: string | null
  teamName: string
  size?: number
  // Pop-art quartile ring — only passed where the team's current quartile
  // is already known in context (Picks fixture cards, Results pick list).
  // Omitted everywhere else rather than fetched specially for this.
  ringColor?: string
}

export default function TeamCrest({ crestUrl, teamName, size = 28, ringColor }: TeamCrestProps) {
  if (!crestUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-gray-200 text-gray-500 font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4, border: ringColor ? `2px solid ${ringColor}` : undefined }}
      >
        {teamName.charAt(0)}
      </div>
    )
  }

  const img = (
    <img
      src={crestUrl}
      alt={teamName}
      width={size}
      height={size}
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )

  if (!ringColor) return img

  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center"
      style={{ width: size + 4, height: size + 4, border: `2px solid ${ringColor}` }}
    >
      {img}
    </div>
  )
}