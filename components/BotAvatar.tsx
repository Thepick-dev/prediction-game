export default function BotAvatar({ size }: { size: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--pop-blue, #00F2FA), var(--pop-pink, #A000FA))', fontSize: Math.round(size * 0.6), lineHeight: 1 }}
    >
      🤖
    </span>
  )
}
