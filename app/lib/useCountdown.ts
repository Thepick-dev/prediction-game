import { useState, useEffect } from 'react'

export type CountdownTime = { days: number; hours: number; mins: number; secs: number; expired: boolean }

export function useCountdown(deadline: string | null): CountdownTime | null {
  const [timeLeft, setTimeLeft] = useState<CountdownTime | null>(null)

  useEffect(() => {
    if (!deadline) return

    function tick() {
      const now = new Date().getTime()
      const end = new Date(deadline!).getTime()
      const diff = end - now
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0, expired: true })
        return
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        mins: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        secs: Math.floor((diff % (1000 * 60)) / 1000),
        expired: false,
      })
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  return timeLeft
}
