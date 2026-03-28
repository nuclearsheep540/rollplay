import { Inter, New_Rocker, Metamorphous, Ubuntu, Outfit } from 'next/font/google'
import QueryProvider from './shared/providers/QueryProvider'
import './globals.css'
import '@melloware/coloris/dist/coloris.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

const newRocker = New_Rocker({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-new-rocker',
  display: 'swap'
})

const ubuntu = Ubuntu({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-ubuntu',
  display: 'swap'
})

const outfit = Outfit({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap'
})

const metamorphous = Metamorphous({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-metamorphous',
  display: 'swap'
})

export const metadata = {
  title: `Rollplay v${process.env.NEXT_PUBLIC_RELEASE || 'dev'}`,
  description: 'Made for my friends',
}

// viewport-fit=cover extends rendering into notch/home-indicator zones.
// Safe area insets (env(safe-area-inset-*)) are then used in CSS to push
// content clear of those zones.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${newRocker.variable} ${metamorphous.variable} ${ubuntu.variable} ${outfit.variable}`}>
      <head>
        {/* Preconnect to S3 so the TCP/TLS handshake is ready before the map image URL is known */}
        <link rel="preconnect" href="https://s3.eu-west-1.amazonaws.com" crossOrigin="anonymous" />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}

