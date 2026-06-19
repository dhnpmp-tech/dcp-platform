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
  title: 'DCP Pricing — Rent GPUs on demand (RTX 4090, RTX 5090, L40S, A100, H100, H200) + Per-Token Inference (SAR)',
  description:
    'DCP pricing in Saudi Riyals, cost-plus from the live market. Rent a whole GPU on demand — RTX 4090 from 3.62 SAR/hr, RTX 5090 from 5.2 SAR/hr, L40S from 5.2 SAR/hr, A100 (80 GB) from 7.3 SAR/hr, H100 (80 GB) from 17.27 SAR/hr, H200 (141 GB) from 23.05 SAR/hr; native RTX 3090 0.5 SAR/hr. Or pay per million tokens on the OpenAI-compatible API. Monthly tiers give a 15–30% discount. 100 SAR starter credit, no card required.',
  alternates: { canonical: 'https://dcp.sa/pricing' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Pricing — Rent GPUs on demand + Per-Token Inference',
    description: 'On-demand GPU rental (RTX 4090 from 3.62 SAR/hr, RTX 5090 / L40S from 5.2 SAR/hr, A100 from 7.3 SAR/hr, H100 from 17.27 SAR/hr, H200 from 23.05 SAR/hr) and per-token inference. PDPL-compliant Saudi-hosted compute.',
    url: 'https://dcp.sa/pricing',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP pricing — Saudi sovereign GPU compute' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Pricing — Rent GPUs on demand, billed in SAR',
    description: 'On-demand GPU rental (H200, H100, A100, L40S, RTX 5090, RTX 4090) and per-token inference, billed in Saudi Riyal. PDPL-compliant Saudi-hosted compute.',
    images: ['/og-image.png'],
  },
}

const PRICING_FAQ: ReadonlyArray<FaqItem> = [
  {
    q: 'How much does it cost to rent a GPU on DCP?',
    a: 'GPU rental is billed prepaid per GPU-second in Saudi Riyal, cost-plus from the live market. On-demand types and indicative hourly rates: NVIDIA RTX 4090 from about 3.62 SAR/hr, RTX 5090 from 5.2 SAR/hr, L40S from 5.2 SAR/hr, A100 (80 GB) from 7.3 SAR/hr, H100 (80 GB) from 17.27 SAR/hr, and H200 (141 GB) from 23.05 SAR/hr. The native in-Kingdom RTX 3090 is 0.5 SAR/hr. New renter accounts start with 100 SAR of credit and no card is required to begin.',
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
