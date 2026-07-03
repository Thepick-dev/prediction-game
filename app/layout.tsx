import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Coupon',
  description: 'The Premier League Prediction Game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}