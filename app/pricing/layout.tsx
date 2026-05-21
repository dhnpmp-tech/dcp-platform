import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DCP Pricing — PAYG + monthly tiers in SAR',
  description:
    'DCP pricing in Saudi Riyals. Pay-as-you-go per million tokens, or pick a monthly tier (Starter / Growth / Scale) for a 15–30% discount. 100 SAR starter credit for new renters.',
  alternates: { canonical: 'https://dcp.sa/pricing' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Pricing',
    description: 'PAYG per million tokens or monthly subscription. PDPL-compliant Saudi-hosted compute.',
    url: 'https://dcp.sa/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Pricing',
    description: 'PAYG per million tokens or monthly subscription. PDPL-compliant Saudi-hosted compute.',
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
