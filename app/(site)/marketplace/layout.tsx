import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import { gpuRentalServiceLd, inferenceApiServiceLd } from '@/app/lib/structured-data'

// Server layout for /marketplace. The page is a client component (it polls
// /api/health/detailed + /v1/models for honest live capacity), so metadata +
// JSON-LD live here so AI crawlers get the graph in the initial HTML.
export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Marketplace — Live Saudi GPU & Model Capacity, Verified · KSA',
  description:
    'Live Saudi GPU marketplace. Every provider and model is published only after live verification — a real question asked and a real answer checked. See verified capacity, served models, and per-token SAR rates straight from the catalog. In-Kingdom, PDPL-compliant.',
  alternates: { canonical: 'https://dcp.sa/marketplace' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Marketplace — Live Saudi GPU & Model Capacity',
    description:
      'Verified-live Saudi GPU + model marketplace. Capacity is published only after a live provider passes verification. In-Kingdom, PDPL-compliant, billed in SAR.',
    url: 'https://dcp.sa/marketplace',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP live GPU marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Marketplace — Live Saudi GPU & Model Capacity',
    description: 'Verified-live Saudi GPU + model marketplace. In-Kingdom, PDPL-compliant, SAR-billed.',
    images: ['/og-image.png'],
  },
}

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[gpuRentalServiceLd(), inferenceApiServiceLd()]} />
      {children}
    </>
  )
}