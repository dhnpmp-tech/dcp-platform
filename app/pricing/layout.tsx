import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DCP Pricing — SAR per GPU-hour',
  description:
    'DCP pricing in Saudi Riyals. Pay per GPU-active second, settled per minute. No subscription, no seat fees. 50 SAR starter credit for new renters.',
  alternates: { canonical: 'https://dcp.sa/pricing' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Pricing',
    description: 'SAR per GPU-hour. No subscription. PDPL-compliant Saudi-hosted compute.',
    url: 'https://dcp.sa/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Pricing',
    description: 'SAR per GPU-hour. No subscription. PDPL-compliant Saudi-hosted compute.',
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
