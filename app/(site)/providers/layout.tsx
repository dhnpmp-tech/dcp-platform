import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import { gpuRentalServiceLd, inferenceApiServiceLd } from '@/app/lib/structured-data'

export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Providers — Saudi GPU Provider Network · Earn Riyal',
  description:
    'Public DCP provider network overview. Shows aggregate model coverage and live health signals without exposing provider identities, endpoints, WireGuard details, or private Mission Control fleet data.',
  alternates: { canonical: 'https://dcp.sa/providers' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Providers — Saudi GPU Provider Network',
    description:
      'Provider network overview for DCP. Join from /earn or /provider-setup; public capacity appears only after heartbeat, endpoint reachability, verified-online serving, and model coverage gates pass.',
    url: 'https://dcp.sa/providers',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP provider network overview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Providers — Earn Riyal from GPU capacity',
    description: 'Aggregate provider network overview with public-safe model coverage and onboarding gates.',
    images: ['/og-image.png'],
  },
}

export default function ProvidersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={[gpuRentalServiceLd(), inferenceApiServiceLd()]} />
      {children}
    </>
  )
}
