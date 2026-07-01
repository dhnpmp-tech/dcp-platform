import type { Metadata } from 'next'

// Server layout for /trust-center. The page is a client component (live evidence
// + roadmap fetches, lang toggle, sticky CTA), so metadata lives here. We do NOT
// emit extra JSON-LD here: Organization + WebSite are already emitted sitewide
// by app/layout.tsx, and the trust surface has no product/FAQ graph of its own —
// fabricating one would violate the structured-data truth rules. Enterprise
// service graphs (gpuRentalServiceLd / inferenceApiServiceLd) live on the pages
// that actually sell those services (/marketplace, /pricing, /docs).
export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Trust Center — PDPL, Security & Enterprise Deployment · KSA',
  description:
    'DCP trust center: PDPL data-residency, in-Kingdom Saudi-owned infrastructure, security posture, certification roadmap, and an enterprise deployment path (run DCP in your own VPC with a signed DPA + MSA + data-flow appendix). For Saudi banks, hospitals, regulators, and agencies.',
  alternates: { canonical: 'https://dcp.sa/trust-center' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Trust Center — PDPL, Security & Enterprise Deployment',
    description:
      'PDPL data-residency, in-Kingdom infrastructure, security posture, certification roadmap, and enterprise VPC deployment with DPA + MSA. For Saudi enterprise buyers.',
    url: 'https://dcp.sa/trust-center',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP trust center — Saudi enterprise compliance' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Trust Center — PDPL, Security & Enterprise Deployment',
    description: 'PDPL data-residency, in-Kingdom infra, security posture, certification roadmap, and VPC deployment with DPA + MSA.',
    images: ['/og-image.png'],
  },
}

export default function TrustCenterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}