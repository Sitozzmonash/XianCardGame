import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const serifSC = localFont({
  src: [
    { path: './fonts/NotoSerifSC-Regular.ttf', weight: '400' },
    { path: './fonts/NotoSerifSC-SemiBold.ttf', weight: '600' },
    { path: './fonts/NotoSerifSC-Bold.ttf', weight: '700' },
    { path: './fonts/NotoSerifSC-Black.ttf', weight: '900' },
  ],
  variable: '--font-serif-sc',
  display: 'swap',
})

const sansSC = localFont({
  src: [
    { path: './fonts/NotoSansSC-Regular.ttf', weight: '400' },
    { path: './fonts/NotoSansSC-Medium.ttf', weight: '500' },
    { path: './fonts/NotoSansSC-Bold.ttf', weight: '700' },
  ],
  variable: '--font-sans-sc',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '天劫战牌 · 修仙卡牌',
  description: '东方修仙策略卡牌手游 —— 天命既定，亦可改之。',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#040d0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`${serifSC.variable} ${sansSC.variable}`}>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
