import Link from 'next/link'

export default function Nav({ user, displayName }: { user?: any; displayName?: string }) {
  return (
    <header className="border-b-2 border-coupon-ink bg-coupon-paper">
      <div className="max-w-4xl mx-auto px-4">

        <div className="py-6 text-center border-b border-coupon-rule">
          <Link href="/">
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-coupon-green uppercase">
              The Coupon
            </h1>
            <p className="font-mono text-xs tracking-widest text-coupon-muted mt-1 uppercase">
              The Premier League Prediction Game — Est. 2026
            </p>
          </Link>
        </div>

        <nav className="flex items-center justify-between py-2 text-xs font-mono uppercase tracking-wider overflow-x-auto gap-4">
          <div className="flex gap-4 md:gap-6">
            <Link href="/leaderboard" className="hover:text-coupon-green whitespace-nowrap">Leaderboard</Link>
            <Link href="/results" className="hover:text-coupon-green whitespace-nowrap">Results</Link>
            <Link href="/rules" className="hover:text-coupon-green whitespace-nowrap">Rules</Link>
            <Link href="/stats" className="hover:text-coupon-green whitespace-nowrap">Stats</Link>
            <Link href="/dispatch" className="hover:text-coupon-green whitespace-nowrap">Dispatch</Link>
          </div>
          <div className="flex gap-4">
            {user ? (
              <>
                <Link href="/picks" className="hover:text-coupon-green whitespace-nowrap">My Pick</Link>
                <Link href="/history" className="hover:text-coupon-green whitespace-nowrap">History</Link>
                <Link href="/settings" className="hover:text-coupon-green whitespace-nowrap">
                  {displayName ?? 'Settings'}
                </Link>
              </>
            ) : (
              <Link href="/login" className="hover:text-coupon-green whitespace-nowrap">Log In</Link>
            )}
          </div>
        </nav>

      </div>
    </header>
  )
}