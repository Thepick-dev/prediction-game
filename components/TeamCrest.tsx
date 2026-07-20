interface TeamCrestProps {
  crestUrl: string | null
  teamName: string
  size?: number
}

export default function TeamCrest({ crestUrl, teamName, size = 28 }: TeamCrestProps) {
  if (!crestUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-gray-200 text-gray-500 font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {teamName.charAt(0)}
      </div>
    )
  }

  return (
    <img
      src={crestUrl}
      alt={teamName}
      width={size}
      height={size}
      className="object-contain flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}