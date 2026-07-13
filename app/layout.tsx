import type { Metadata } from 'next'
import { Bree_Serif, Lora, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const breeSerif = Bree_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

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
    <html lang="en" className={`${breeSerif.variable} ${lora.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}