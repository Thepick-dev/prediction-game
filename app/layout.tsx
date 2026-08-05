import type { Metadata } from 'next'
import { Alfa_Slab_One, Lora, IBM_Plex_Mono, Anton } from 'next/font/google'
import './globals.css'

const alfaSlabOne = Alfa_Slab_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})

// Only used by the pop-art theme (see globals.css, .pop-hero) — for the
// one or two genuine hero moments (the "Picks!" title), never for body
// copy or section labels. Bold condensed poster/sports-headline face,
// swapped in for Bangers after "comic" was explicitly the wrong framing —
// loaded globally like the other fonts here since next/font requires
// that, but it costs nothing on pages that never reference --font-display.
const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
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
  icons: {
    icon: '/logo.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${alfaSlabOne.variable} ${lora.variable} ${plexMono.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  )
}