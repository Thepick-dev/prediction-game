import type { Metadata, Viewport } from 'next'
import { Alfa_Slab_One, Lora, IBM_Plex_Mono, Bebas_Neue, Anton, Barlow_Condensed, IBM_Plex_Sans, Fraunces, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const alfaSlabOne = Alfa_Slab_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
})

// Only used by the pop-art theme (see globals.css, .pop-hero) — for the
// one or two genuine hero moments (the "Picks" title), never for body
// copy or section labels. Tall condensed poster/sports face — swapped in
// for Anton after it still read as too blocky/childish; this is the same
// family of typeface used on real match-day posters and ticket stubs.
const bebasNeue = Bebas_Neue({
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

// Rugby's own "matchday broadcast" skin (see globals.css, .rugby-theme) —
// a completely separate visual identity from football's pop-art theme, so
// these three are scoped to rugby only via rugby-theme's own CSS vars,
// never touching h1-h6/body defaults above.
const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-rugby-display',
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({
  weight: ['500', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-rugby-cond',
  display: 'swap',
})

const plexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-rugby-body',
  display: 'swap',
})

// The rb2 "dark mode / kinetic" concept (see globals.css) — a distinct
// identity from rugby-theme's Anton/Barlow Condensed above, scoped to its
// own vars so it doesn't repaint the rest of the rugby site, which isn't
// part of this reskin yet.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-rb2-display',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rb2-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LMS All-Stars Predictions',
  description: 'The Premier League Prediction Game',
  icons: {
    icon: '/logo.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  // iOS Safari never reads the web manifest for "Add to Home Screen" — it
  // needs its own separate meta tags, which this generates automatically.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LMS All-Stars',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${alfaSlabOne.variable} ${lora.variable} ${plexMono.variable} ${bebasNeue.variable} ${anton.variable} ${barlowCondensed.variable} ${plexSans.variable} ${fraunces.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Preloaded so the loading-screen mascot (logo.png) and its player-photo
            cap patch (mascot-cap-photo.png) are already cached by the time
            PopArtLoading ever mounts — otherwise the photo can visibly pop onto
            the cap a beat after the base logo, mid-pulse-animation. */}
        <link rel="preload" as="image" href="/logo.png" />
        <link rel="preload" as="image" href="/mascot-cap-photo.png" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}