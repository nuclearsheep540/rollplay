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
  title: 'Rollplay - Online Dice Roll',
  description: 'Made for my friends',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${newRocker.variable} ${metamorphous.variable} ${ubuntu.variable} ${outfit.variable}`}>
      <body className={inter.className}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}

