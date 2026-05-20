import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DCP Status — live model availability',
  description:
    'Live per-model status, provider count, and p50/p95 latency for DCP. Refreshes every 30 seconds. Subscribe to availability updates.',
  alternates: { canonical: 'https://dcp.sa/status' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Status',
    description: 'Live per-model availability and latency for api.dcp.sa.',
    url: 'https://dcp.sa/status',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Status',
    description: 'Live per-model availability and latency for api.dcp.sa.',
  },
}

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children
}
