import Link from 'next/link'

type Props = {
  children: React.ReactNode
  active?: string
  user?: any
  displayName?: string
}

const navItems = [
  { label: 'PICK', href: '/picks' },
  { label: 'TABLE', href: '/leaderboard' },
  { label: 'RULES', href: '/rules' },
  { label: 'NEWS', href: '/news' },
  { label: 'ARCHIVE', href: '/archive' },
  { label: 'SETTINGS', href: '/settings' },
]

export default function Shell({ children, active, user, displayName }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">

      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <Link href="/" className="text-2xl font-bold tracking-tight">
              The Coupon
            </Link>
            {user && (
              <span className="text-sm text-gray-500">{displayName ?? user.email}</span>
            )}
          </div>

          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {navItems.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className={`px-5 py-3 text-sm font-bold tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                  active === item.label
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>

    </div>
  )
}