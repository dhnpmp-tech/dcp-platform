import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import {
  gpuRentalServiceLd,
  inferenceApiServiceLd,
  faqPageLd,
  type FaqItem,
} from '@/app/lib/structured-data'

export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Pricing — Rent GPUs from 0.33 SAR/hr + Per-Token Inference (SAR)',
  description:
    'DCP pricing in Saudi Riyals. Rent a whole GPU on demand — RTX 3080 from 0.33 SAR/hr, RTX 4090 1.0 SAR/hr, A100 4.5 SAR/hr, H100 7.09 SAR/hr, H200 9.19 SAR/hr. Or pay per million tokens on the OpenAI-compatible API. Monthly tiers give a 15–30% discount. 100 SAR starter credit, no card required.',
  alternates: { canonical: 'https://dcp.sa/pricing' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Pricing — Rent GPUs from 0.33 SAR/hr + Per-Token Inference',
    description: 'On-demand GPU rental (RTX 4090 1.0 SAR/hr, A100 4.5 SAR/hr, H100 7.09 SAR/hr) and per-token inference. PDPL-compliant Saudi-hosted compute.',
    url: 'https://dcp.sa/pricing',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP pricing — Saudi sovereign GPU compute' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Pricing — Rent GPUs from 0.33 SAR/hr',
    description: 'On-demand GPU rental and per-token inference, billed in Saudi Riyal. PDPL-compliant Saudi-hosted compute.',
    images: ['/og-image.png'],
  },
}

const PRICING_FAQ: ReadonlyArray<FaqItem> = [
  {
    q: 'How much does it cost to rent a GPU on DCP?',
    a: 'GPU rental is billed prepaid per GPU-second in Saudi Riyal. Indicative hourly rates: NVIDIA RTX 3080 from about 0.33 SAR/hr, RTX 3090 0.5 SAR/hr, RTX 4090 1.0 SAR/hr, A100 4.5 SAR/hr, H100 7.09 SAR/hr, and H200 9.19 SAR/hr. New renter accounts start with 100 SAR of credit and no card is required to begin.',
  },
  {
    q: 'How is DCP inference billed?',
    a: 'Inference on the OpenAI-compatible API is billed per million tokens in Saudi Riyal, cost-plus by model class. You can pay as you go or choose a monthly tier (Starter, Growth, Scale) for a 15–30% discount. New accounts begin with 100 SAR of starter credit.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'No. New renter accounts receive 100 SAR of credit and usage draws from that credit before any paid balance. If your balance cannot cover a job, the API returns insufficient_balance (HTTP 402) before any unpaid work starts — there is no silent negative balance.',
  },
]

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[gpuRentalServiceLd(), inferenceApiServiceLd(), faqPageLd(PRICING_FAQ)]} />
      {children}
    </>
  )
}
