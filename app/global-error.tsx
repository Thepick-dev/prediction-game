'use client'

import { useEffect } from 'react'
import './globals.css'

// This only fires if the root layout itself throws — everything above it
// (including the normal fonts/providers) is gone, so this has to bring its
// own <html>/<body> and can't lean on anything else in the tree.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Georgia, serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'linear-gradient(160deg, #2A1F17 0%, #1a120b 55%, #241a12 100%)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '28rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(217,164,65,0.3)',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: 'rgba(30, 25, 20, 0.88)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            }}
          >
            <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</p>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', color: '#F5ECD9' }}>
              Something Went Wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(245,236,217,0.6)', marginBottom: '1.5rem' }}>
              The whole page failed to load — try again in a moment.
            </p>
            <button
              onClick={reset}
              style={{
                width: '100%',
                borderRadius: '0.5rem',
                padding: '0.625rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.875rem',
                backgroundColor: '#D9A441',
                color: '#241a12',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
