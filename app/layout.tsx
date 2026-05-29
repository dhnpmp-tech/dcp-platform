import type { Metadata } from 'next'
import './globals.css'
import { LanguageWrapper } from './lib/i18n'
import V1GlobalChrome from './components/ui/V1GlobalChrome'

export const metadata: Metadata = {
  title: 'DCP — Saudi GPU Compute Marketplace',
  description: 'Saudi Arabia\'s GPU compute marketplace. Arabic AI models, PDPL-compliant data residency, per-token billing. Earn SAR with your GPU or rent inference on demand.',
  icons: {
    icon: "/dcp-logo-primary.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Tajawal:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-inter bg-dc1-void text-dc1-text-primary antialiased">
        <LanguageWrapper>
          {children}
          <V1GlobalChrome />
        </LanguageWrapper>
      </body>
    </html>
  )
}
