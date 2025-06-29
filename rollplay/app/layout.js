import { Inter } from 'next/font/google'
import './globals.css'
import '@melloware/coloris/dist/coloris.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Rollplay - Online Dice Roll',
  description: 'Made for my friends',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}
      </body>
    </html>
  )
}

