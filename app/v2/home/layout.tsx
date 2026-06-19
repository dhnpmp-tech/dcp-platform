import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import {
  gpuRentalServiceLd,
  inferenceApiServiceLd,
  mcpServerLd,
  faqPageLd,
  rentGpuHowToLd,
  callInferenceHowToLd,
  HOME_FAQ,
} from '@/app/lib/structured-data'

// Server layout for the marketing home. The page itself is a client component
// and cannot export metadata or server-render JSON-LD, so both live here. The
// title/description carry the global high-intent terms buyers actually type
// ("rent an H100", "on-demand GPU cloud", "OpenAI-compatible inference API") so
// AI answer engines can match DCP to those queries.
export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP — Rent GPUs On Demand (H100, A100, RTX 4090) + OpenAI-Compatible Inference API · Saudi Arabia',
  description:
    'DCP is Saudi Arabia\'s sovereign AI compute cloud. Rent a whole GPU on demand (NVIDIA H200, H100, A100, RTX 4090 and more) from 0.33 SAR/hr, or use the OpenAI-compatible inference API at api.dcp.sa/v1. Official MCP server lets AI agents rent GPUs and run inference. In-Kingdom, PDPL-compliant, billed in Saudi Riyal.',
  keywords: [
    'rent GPU on demand',
    'rent H100',
    'rent A100',
    'on-demand GPU cloud',
    'OpenAI-compatible inference API',
    'sovereign AI compute Saudi Arabia',
    'in-Kingdom GPU rental',
    'MCP server rent GPU',
    'RTX 4090 cloud',
    'PDPL compliant AI',
  ],
  alternates: { canonical: 'https://dcp.sa/v2/home' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP — Rent GPUs On Demand + OpenAI-Compatible Inference · Saudi Arabia',
    description:
      'Rent a whole GPU on demand (H200, H100, A100, RTX 4090) from 0.33 SAR/hr or call the OpenAI-compatible API at api.dcp.sa/v1. Sovereign, in-Kingdom, PDPL-compliant. Agents can rent GPUs via MCP.',
    url: 'https://dcp.sa/v2/home',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP — Saudi Arabia sovereign AI compute' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP — Rent GPUs On Demand + OpenAI-Compatible Inference · Saudi Arabia',
    description:
      'Rent a whole GPU on demand from 0.33 SAR/hr or call the OpenAI-compatible API at api.dcp.sa/v1. Sovereign, in-Kingdom, PDPL-compliant.',
    images: ['/og-image.png'],
  },
}

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Organization + WebSite are emitted sitewide by app/layout.tsx; the
          services below reference them by @id. */}
      <JsonLd
        data={[
          gpuRentalServiceLd(),
          inferenceApiServiceLd(),
          mcpServerLd(),
          faqPageLd(HOME_FAQ),
          rentGpuHowToLd(),
          callInferenceHowToLd(),
        ]}
      />
      {children}
    </>
  )
}
