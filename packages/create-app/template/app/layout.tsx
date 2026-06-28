import type { Metadata } from 'next'

const nodeName = process.env.NEXT_PUBLIC_NODE_NAME || '__NODE_NAME__'

export const metadata: Metadata = {
  title: `${nodeName} - Open Stellar`,
  description: 'Open Stellar node scaffolded with create-open-stellar-app',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#04070d', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  )
}
