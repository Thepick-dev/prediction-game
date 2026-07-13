import type { Metadata } from 'next'
import { Alfa_Slab_One, Lora, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const alfaSlabOne = Alfa_Slab_One({
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
  title: 'LMS All-Stars Predictions',
  description: 'The Premier League Prediction Game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${alfaSlabOne.variable} ${lora.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}