import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DCP Quickstart — API in under two minutes',
  description:
    'Copy-paste your first DCP call. OpenAI-compatible API at api.dcp.sa with examples in curl, Python, and Node.js, including multimodal, auth, billing, and error codes.',
  alternates: { canonical: 'https://dcp.sa/quickstart' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Quickstart',
    description: 'OpenAI-compatible API at api.dcp.sa. Get a key and run your first call in under two minutes.',
    url: 'https://dcp.sa/quickstart',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Quickstart',
    description: 'OpenAI-compatible API at api.dcp.sa.',
  },
}

export default function QuickstartLayout({ children }: { children: React.ReactNode }) {
  return children
}
