import type { Metadata } from 'next'
import './globals.css'
import { LanguageWrapper } from './lib/i18n'
import V1GlobalChrome from './components/ui/V1GlobalChrome'
import JsonLd from './components/JsonLd'
import { organizationLd, webSiteLd } from './lib/structured-data'

export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: {
    default: 'DCP — Rent GPUs On Demand + OpenAI-Compatible Inference API · Saudi Arabia',
    template: '%s · DCP',
  },
  description:
    "DCP is Saudi Arabia's sovereign AI compute cloud. Rent a whole GPU on demand (NVIDIA H200, H100, A100, RTX 4090 and more), use the OpenAI-compatible inference API at api.dcp.sa/v1, or let AI agents rent GPUs via the official MCP server. In-Kingdom, PDPL-compliant, billed in Saudi Riyal.",
  applicationName: 'DCP',
  icons: {
    icon: '/dcp-logo-primary.png',
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'DCP',
    url: 'https://dcp.sa',
    title: 'DCP — Sovereign AI Compute · Saudi Arabia',
    description:
      'Rent GPUs on demand (H100, A100, RTX 4090), use the OpenAI-compatible inference API at api.dcp.sa/v1, or let agents rent GPUs via MCP. In-Kingdom, PDPL-compliant.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP — Saudi Arabia sovereign AI compute' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP — Sovereign AI Compute · Saudi Arabia',
    description:
      'Rent GPUs on demand, use the OpenAI-compatible inference API at api.dcp.sa/v1, or let agents rent GPUs via MCP. In-Kingdom, PDPL-compliant.',
    images: ['/og-image.png'],
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
        {/* Umami — self-hosted, in-Kingdom web analytics (sovereign, cookieless, PDPL-friendly).
            data-domains limits collection to production (skips localhost/preview). */}
        <script
          defer
          src="https://analytics.76.13.179.86.nip.io/script.js"
          data-website-id="1cce8020-c547-4ae1-bb35-e26423ed9cb3"
          data-domains="dcp.sa,www.dcp.sa"
        />
      </head>
      <body className="font-inter bg-dc1-void text-dc1-text-primary antialiased">
        <JsonLd data={[organizationLd(), webSiteLd()]} />
        <LanguageWrapper>
          {children}
          <V1GlobalChrome />
        </LanguageWrapper>
      </body>
    </html>
  )
}
