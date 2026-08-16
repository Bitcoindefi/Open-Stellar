import type { Metadata, Viewport } from 'next'
import { Press_Start_2P, VT323 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { WalletProvider } from '@/components/wallet/wallet-provider'
import { MockBanner } from '@/components/mock-banner'
import { PwaRegister } from '@/components/pwa-register'
import { Toaster } from 'sonner'
import './globals.css'

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ["latin"],
  variable: '--font-pixel'
});

const vt323 = VT323({
  weight: '400',
  subsets: ["latin"],
  variable: '--font-vt323'
});

export const metadata: Metadata = {
  title: 'Open Stellar - Agent City',
  description: 'Open Stellar - multi-chain platform with AI agents and Web3 protocols',
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  applicationName: 'Open Stellar',
  appleWebApp: {
    capable: true,
    title: 'Open Stellar',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', sizes: '32x32', type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', sizes: '32x32', type: 'image/png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${pressStart2P.variable} ${vt323.variable} font-sans antialiased`}>
        <MockBanner />
        <WalletProvider>
          {children}
        </WalletProvider>
        <PwaRegister />
        <Analytics />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#111827',
              border: '1px solid #2a3a52',
              color: '#e2e8f0',
              fontFamily: 'monospace',
              fontSize: 12,
            },
          }}
        />
      </body>
    </html>
  )
}

