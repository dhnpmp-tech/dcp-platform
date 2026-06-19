import type { Metadata } from 'next'
import JsonLd from '@/app/components/JsonLd'
import {
  inferenceApiServiceLd,
  gpuRentalServiceLd,
  mcpServerLd,
  agentRentGpuHowToLd,
  callInferenceHowToLd,
  faqPageLd,
  AGENT_FAQ,
} from '@/app/lib/structured-data'

// Server layout for the agent-first product page. The page is a client
// component (it uses the EN/AR toggle), so metadata + server-rendered JSON-LD
// live here. The HowTo ("rent a GPU with no human") + FAQPage ("What is DCP?",
// "How does an AI agent use DCP?") are emitted into the initial HTML so AI
// crawlers and answer engines can cite the zero-human flow without running JS.
export const metadata: Metadata = {
  metadataBase: new URL('https://dcp.sa'),
  title: 'DCP for Agents — Zero-Human GPU Rental, OpenAI-Compatible Inference & MCP Server',
  description:
    "DCP is built for AI agents: self-register a renter account in one call (no human, no email) for a real key + 20 SAR trial, then rent a whole GPU, run OpenAI-compatible inference at api.dcp.sa/v1, and stop — over HTTPS or the official MCP server (npx -y github:dhnpmp-tech/dcp-mcp). Idempotency-Key for safe retries, HTTP 402 funding signal, sovereign in-Kingdom and PDPL-compliant.",
  keywords: [
    'AI agent rent GPU',
    'MCP server rent GPU',
    'agent self-register API key',
    'OpenAI-compatible inference API',
    'autonomous GPU rental',
    'zero human GPU cloud',
    'sovereign AI compute Saudi Arabia',
    'idempotency key GPU API',
    'HTTP 402 insufficient balance',
  ],
  alternates: { canonical: 'https://dcp.sa/v2/agents' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DCP for Agents — Compute an Agent Rents Itself',
    description:
      'Self-register (no human), get a key + SAR trial, rent a whole GPU, run OpenAI-compatible inference, stop. Over HTTPS or the official MCP server. Sovereign, in-Kingdom, PDPL-compliant.',
    url: 'https://dcp.sa/v2/agents',
    siteName: 'DCP',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'DCP for AI agents — zero-human GPU rental and inference' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DCP for Agents — Compute an Agent Rents Itself',
    description:
      'Self-register (no human), get a key + SAR trial, rent a GPU, run OpenAI-compatible inference. Over HTTPS or MCP. Sovereign, in-Kingdom.',
    images: ['/og-image.png'],
  },
}

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Organization + WebSite are emitted sitewide by app/layout.tsx; the
          services below reference them by @id. */}
      <JsonLd
        data={[
          inferenceApiServiceLd(),
          gpuRentalServiceLd(),
          mcpServerLd(),
          agentRentGpuHowToLd(),
          callInferenceHowToLd(),
          faqPageLd(AGENT_FAQ),
        ]}
      />
      {children}
    </>
  )
}
