import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import {
  inferenceApiServiceLd,
  mcpServerLd,
  callInferenceHowToLd,
  rentGpuHowToLd,
} from '@/app/lib/structured-data'

// Server layout for the agent-first docs page. The page is a client component;
// metadata + JSON-LD live here. Docs content already server-renders, so this
// adds the machine-readable graph an AI engine needs to cite the OpenAI-compat
// API and the MCP server for "MCP server to rent a GPU" / "OpenAI alternative"
// queries.
export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP Docs — OpenAI-Compatible API, GPU Pods & MCP Server for Agents',
  description:
    'DCP developer + agent docs. OpenAI-compatible inference at api.dcp.sa/v1 (drop-in base_url), on-demand GPU pods (rent an H100/A100/RTX 4090), persistent storage, and an official MCP server so AI agents can rent GPUs and run inference through tool calls. Bilingual EN/AR.',
  alternates: { canonical: 'https://dcp.sa/v2/docs' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP Docs — OpenAI-Compatible API + MCP Server for Agents',
    description:
      'OpenAI-compatible inference at api.dcp.sa/v1, on-demand GPU pods, and an official MCP server for AI agents. In-Kingdom, PDPL-compliant.',
    url: 'https://dcp.sa/v2/docs',
    siteName: 'DCP',
    type: 'article',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP developer and agent documentation' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP Docs — OpenAI-Compatible API + MCP Server for Agents',
    description: 'OpenAI-compatible inference at api.dcp.sa/v1, GPU pods, and an MCP server for AI agents.',
    images: ['/og-image.png'],
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Organization + WebSite are emitted sitewide by app/layout.tsx. */}
      <JsonLd data={[inferenceApiServiceLd(), mcpServerLd(), callInferenceHowToLd(), rentGpuHowToLd()]} />
      {children}
    </>
  )
}
