import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import { inferenceApiServiceLd } from '@/app/lib/structured-data'

export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Models — Live OpenAI-Compatible Model Catalog · Saudi AI',
  description:
    'DCP model directory backed by GET /v1/models. Shows serveable models, provider counts, context windows, SAR token prices, and catalog-only rows without stale capacity claims.',
  alternates: { canonical: 'https://dcp.sa/models' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Models — Live OpenAI-Compatible Model Catalog',
    description:
      'Live DCP model catalog. Provider-backed rows come from /v1/models; zero-provider rows remain catalog metadata, not capacity promises.',
    url: 'https://dcp.sa/models',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP live model catalog' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Models — Live Model Catalog',
    description: 'OpenAI-compatible model directory backed by /v1/models, in Saudi Riyal.',
    images: ['/og-image.png'],
  },
}

export default function ModelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={inferenceApiServiceLd()} />
      {children}
    </>
  )
}
