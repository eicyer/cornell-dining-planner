import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Cornell Dining Planner',
  description: 'Plan healthy, personalized meals at Cornell dining halls',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CornellEats',
  },
}

export const viewport: Viewport = {
  themeColor: '#b31b1b',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} font-sans antialiased bg-slate-950 text-slate-50 min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
