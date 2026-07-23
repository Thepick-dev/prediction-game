'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'linear-gradient(160deg, #2A1F17 0%, #1a120b 55%, #241a12 100%)' }}
      />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-3 py-8">
        <div
          className="w-full max-w-md rounded-lg shadow-2xl border border-[#D9A441]/30 p-8 text-center"
          style={{ backgroundColor: 'rgba(30, 25, 20, 0.88)' }}
        >
          <p className="text-4xl mb-3">⚠️</p>
          <h1 className="text-lg font-bold uppercase tracking-wide mb-2 text-[#F5ECD9]" style={{ fontFamily: 'var(--font-heading), serif' }}>
            Something Went Wrong
          </h1>
          <p className="text-sm text-[#F5ECD9]/60 mb-6">
            That&apos;s on us, not you — try again, and if it keeps happening let an admin know.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={reset}
              className="rounded-lg py-2.5 font-bold uppercase tracking-wider text-sm"
              style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}
            >
              Try Again
            </button>
            <Link
              href="/"
              className="rounded-lg py-2.5 font-bold uppercase tracking-wider text-sm border border-[#D9A441]/40 text-[#D9A441]"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
