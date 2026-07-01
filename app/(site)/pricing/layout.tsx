import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import { gpuRentalServiceLd, inferenceApiServiceLd, faqPageLd, PRICING_FAQ } from '@/app/lib/structured-data'

// Server layout for /pricing. The page is a client component (lang toggle +
// FAQ <details>), so metadata + JSON-LD live here. Numbers shown on the page
// mirror GPU_SKUS + PRICING_FAQ in structured-data.ts — the single source of
// truth — so the visible copy and the FAQ graph never drift.
export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Pricing — Per-Token Inference + Per-Second GPU Rental · Saudi Riyal',
  description:
    'DCP pricing, in Saudi Riyal. Inference from 5 halala per 1M tokens by model class; on-demand whole-GPU pods billed per GPU-second (RTX 3090 from 0.5 SAR/hr, H200 from 23.05 SAR/hr), cost-plus from the live market, refunded when you stop. Optional monthly subscriptions (Starter 375 / Growth 1,500 / Scale 5,625 SAR). New accounts start with 100 SAR, no card required.',
  alternates: { canonical: 'https://dcp.sa/pricing' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Pricing — Per-Token + Per-Second GPU, in Saudi Riyal',
    description:
      'Inference per million tokens, whole-GPU pods per second (cost-plus, refunded on stop), and optional monthly subscriptions. All in SAR. New accounts start with 100 SAR, no card.',
    url: 'https://dcp.sa/pricing',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP pricing — Saudi Riyal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Pricing — Per-Token + Per-Second GPU · Saudi Riyal',
    description: 'Inference per 1M tokens, GPU pods per second (refunded on stop), optional subscriptions. All in SAR.',
    images: ['/og-image.png'],
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[gpuRentalServiceLd(), inferenceApiServiceLd(), faqPageLd(PRICING_FAQ)]} />
      {children}
    </>
  )
}