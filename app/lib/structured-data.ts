// ─────────────────────────────────────────────────────────────────────────
// structured-data.ts — schema.org JSON-LD builders for AEO/GEO.
//
// AI answer engines (ChatGPT, Gemini / Google AI Overviews, Perplexity, Claude)
// parse schema.org JSON-LD to resolve entities, products, prices, and Q&A. This
// module centralises every graph DCP ships so the facts stay in ONE place and
// can never drift between pages.
//
// TRUTH RULES (non-negotiable):
//   - Prices, GPU SKUs, and VRAM mirror app/pricing/page.tsx exactly.
//   - NEVER name a GPU vendor partner, machine, endpoint, or node count beyond
//     the public NVIDIA model names already shown on the pricing page.
//   - No fabricated ratings, review counts, or availability promises.
// ─────────────────────────────────────────────────────────────────────────

export const SITE_URL = 'https://dcp.sa'
export const ORG_NAME = 'DCP'
export const ORG_LEGAL_NAME = 'DC Power Solutions'
export const SAR_PER_USD = 3.75

// The renter-facing GPU rental SKUs. Mirrors GPU_RATES in app/pricing/page.tsx.
// price is SAR/hour (priceCurrency SAR). usdPerHour is shown in the description
// for the global, USD-thinking buyer that AI engines serve.
export interface GpuSku {
  readonly model: string
  readonly vramGb: number
  readonly sarPerHour: number
  readonly usdPerHour: number
}

export const GPU_SKUS: ReadonlyArray<GpuSku> = [
  // The first six are the on-demand types live now from
  // GET https://api.dcp.sa/api/renters/available-providers, priced cost-plus
  // from the live market (each is a "from" floor). RTX 3090 is the native
  // (in-Kingdom community) card. Never advertise a type that is not rentable.
  { model: 'NVIDIA H200', vramGb: 141, sarPerHour: 23.05, usdPerHour: 6.15 },
  { model: 'NVIDIA H100', vramGb: 80, sarPerHour: 17.27, usdPerHour: 4.61 },
  { model: 'NVIDIA A100', vramGb: 80, sarPerHour: 7.3, usdPerHour: 1.95 },
  { model: 'NVIDIA L40S', vramGb: 48, sarPerHour: 5.2, usdPerHour: 1.39 },
  { model: 'NVIDIA RTX 5090', vramGb: 32, sarPerHour: 5.2, usdPerHour: 1.39 },
  { model: 'NVIDIA RTX 4090', vramGb: 24, sarPerHour: 3.62, usdPerHour: 0.97 },
  { model: 'NVIDIA RTX 3090', vramGb: 24, sarPerHour: 0.5, usdPerHour: 0.13 },
]

// Organization — the entity record AI engines resolve "DCP / dcp.sa" against.
export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: ORG_NAME,
    legalName: ORG_LEGAL_NAME,
    alternateName: ['Datacenter Compute Platform', 'DCP Platform'],
    url: SITE_URL,
    logo: `${SITE_URL}/dcp-logo-512.png`,
    image: `${SITE_URL}/og-image.png`,
    description:
      "DCP is Saudi Arabia's sovereign AI compute platform: an OpenAI-compatible inference API, on-demand GPU rental (H200, H100, A100, L40S, RTX 5090, RTX 4090), persistent in-Kingdom storage, and an official MCP server for AI agents. All compute runs on Saudi-owned hardware inside the Kingdom under full PDPL data-residency compliance.",
    foundingLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressCountry: 'SA' },
    },
    areaServed: { '@type': 'Country', name: 'Saudi Arabia' },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@dcp.sa',
      contactType: 'customer support',
    },
  }
}

// WebSite — lets engines associate the domain with the brand + a sitelinks box.
export function webSiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: ORG_NAME,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: ['en', 'ar'],
  }
}

// Service — on-demand GPU rental, with one Offer per GPU SKU (price/hr in SAR).
// This is the graph that "rent an H100 on demand" / "cheapest H100" match against.
export function gpuRentalServiceLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${SITE_URL}/#gpu-rental`,
    serviceType: 'On-demand GPU cloud rental',
    name: 'DCP On-Demand GPU Rental',
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: { '@type': 'Country', name: 'Saudi Arabia' },
    description:
      'Rent a whole GPU on demand in Saudi Arabia — NVIDIA H200, H100, A100, L40S, RTX 5090 and RTX 4090 (plus the native in-Kingdom RTX 3090) — with root, Jupyter and SSH access in about a minute. Billed prepaid per GPU-second in Saudi Riyal, cost-plus from the live market. Data and hardware stay inside the Kingdom (PDPL compliant).',
    offers: GPU_SKUS.map((g) => ({
      '@type': 'Offer',
      name: `${g.model} (${g.vramGb} GB) — on-demand GPU rental`,
      priceCurrency: 'SAR',
      price: g.sarPerHour,
      unitText: 'HOUR',
      description: `${g.model} with ${g.vramGb} GB VRAM from ${g.sarPerHour} SAR/hour (about $${g.usdPerHour}/hour). Whole-GPU, dedicated, in-Kingdom. Billed per second, prorated refund on early stop.`,
      availability: 'https://schema.org/InStock',
      eligibleRegion: { '@type': 'Country', name: 'Saudi Arabia' },
    })),
  }
}

// Service — the OpenAI-compatible inference API (the drop-in base_url story).
export function inferenceApiServiceLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${SITE_URL}/#inference-api`,
    serviceType: 'AI inference API',
    name: 'DCP OpenAI-Compatible Inference API',
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: { '@type': 'Country', name: 'Saudi Arabia' },
    description:
      'An OpenAI-compatible inference API at https://api.dcp.sa/v1. Point any OpenAI SDK at it by changing base_url and using a DCP renter key — no rewrite needed. Per-token billing in Saudi Riyal. Arabic-first and long-tail open-source model catalog served from in-Kingdom GPUs.',
    url: 'https://api.dcp.sa/v1',
  }
}

// SoftwareApplication — the official MCP server agents discover + install.
export function mcpServerLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#mcp-server`,
    name: 'DCP MCP Server',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any (Node.js)',
    description:
      'An official Model Context Protocol (MCP) server (npx -y github:dhnpmp-tech/dcp-mcp) that lets any AI agent self-register a DCP renter account (zero human, with a SAR trial credit), rent a GPU, run OpenAI-compatible inference, manage persistent storage, and check wallet balance through tool calls. Tools: register_agent, list_models, chat, get_balance, list_gpus, create_pod, get_pod, extend_pod, stop_pod, rent_volume and get_volume.',
    softwareHelp: { '@type': 'CreativeWork', url: `${SITE_URL}/v2/agents` },
    provider: { '@id': `${SITE_URL}/#organization` },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  }
}

// FAQPage — Q&A shaped to the exact prompt patterns buyers/agents type.
export interface FaqItem {
  readonly q: string
  readonly a: string
}

export const HOME_FAQ: ReadonlyArray<FaqItem> = [
  {
    q: 'How do I rent an H100 (or other GPU) on demand on DCP?',
    a: "Sign up for a DCP renter account at dcp.sa, fund your wallet in Saudi Riyal, then launch a pod from the console or via the API: POST https://api.dcp.sa/api/pods with a Bearer renter key. You get a whole NVIDIA GPU (H200, H100, A100, L40S, RTX 5090 or RTX 4090) with root, Jupyter over TLS and SSH in about a minute. Billing is prepaid per GPU-second in SAR, with a prorated refund when you stop early.",
  },
  {
    q: 'Is DCP an OpenAI-compatible inference API?',
    a: 'Yes. DCP exposes an OpenAI-compatible API at https://api.dcp.sa/v1 (POST /v1/chat/completions, GET /v1/models). Point any OpenAI SDK at it by setting base_url to https://api.dcp.sa/v1 and using your DCP renter key as the Bearer token — no code rewrite needed. Inference is billed per token in Saudi Riyal.',
  },
  {
    q: 'Can an AI agent rent a GPU on DCP via MCP?',
    a: "Yes. DCP ships an official Model Context Protocol (MCP) server. An MCP-capable agent (such as Claude) can list models, run inference, list available GPU types, create and extend GPU pods, rent storage volumes, and check wallet balance through tool calls. See dcp.sa/v2/docs for the MCP setup and tool reference.",
  },
  {
    q: 'What is sovereign / in-Kingdom AI compute in Saudi Arabia?',
    a: 'Sovereign AI compute means your data, the models, the storage, and the control plane all stay inside Saudi Arabia, under Saudi law. DCP runs on Saudi-owned hardware in the Kingdom with full PDPL data-residency compliance, so prompts and answers never leave the country unless a tenant explicitly opts in to cross-border frontier models.',
  },
  {
    q: 'How much does it cost to rent a GPU on DCP?',
    a: 'GPU rental is billed prepaid per GPU-second in Saudi Riyal, cost-plus from the live market. On-demand types and indicative hourly rates: NVIDIA RTX 4090 from about 3.62 SAR/hr, RTX 5090 from 5.2 SAR/hr, L40S from 5.2 SAR/hr, A100 (80 GB) from 7.3 SAR/hr, H100 (80 GB) from 17.27 SAR/hr, and H200 (141 GB) from 23.05 SAR/hr. The native in-Kingdom RTX 3090 is 0.5 SAR/hr. New renter accounts start with 100 SAR of credit and no card is required to begin.',
  },
  {
    q: 'Where does my data live when I use DCP?',
    a: 'Inside Saudi Arabia. Inference, GPU pods, agents, and persistent storage volumes all run on in-Kingdom, Saudi-owned hardware under PDPL data-residency rules. Cross-border frontier models are available only by explicit per-tenant opt-in.',
  },
]

export function faqPageLd(items: ReadonlyArray<FaqItem>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/#faq`,
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
}

// HowTo — procedural graph favoured by AI Overviews for "how do I…" queries.
export function rentGpuHowToLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${SITE_URL}/#howto-rent-gpu`,
    name: 'How to spin up a GPU on demand in Saudi Arabia with DCP',
    description:
      'Rent a whole NVIDIA GPU on DCP in about a minute, with root, Jupyter and SSH, billed per second in Saudi Riyal.',
    totalTime: 'PT2M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'SAR', value: '0.50' },
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Create a renter account',
        text: 'Sign up at dcp.sa and create a renter API key. New accounts start with 100 SAR of credit.',
        url: `${SITE_URL}/v2/setup`,
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Launch a pod',
        text: 'Call POST https://api.dcp.sa/api/pods with a Bearer renter key (or use the launch console). Choose a GPU type such as H200, H100, A100, L40S, RTX 5090 or RTX 4090.',
        url: `${SITE_URL}/v2/renter/pods`,
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Connect',
        text: 'Poll GET /api/pods/{id} for the Jupyter access_url and ssh_command. The whole GPU is dedicated to you with a pinned driver.',
        url: `${SITE_URL}/v2/docs`,
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Extend or stop',
        text: 'Extend without restart via POST /api/pods/{id}/extend, or stop early with DELETE /api/pods/{id} for a prorated refund. The host enforces a hard deadline even across reboots.',
        url: `${SITE_URL}/v2/docs`,
      },
    ],
  }
}

// HowTo — the zero-human agent flow: self-register → key + trial → rent a GPU,
// no email click and no human in the loop. Distinct @id from rentGpuHowToLd so
// both can ship without colliding; this one is keyed to the agents surface.
export function agentRentGpuHowToLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${SITE_URL}/#howto-agent-rent-gpu`,
    name: 'How an AI agent rents a GPU on DCP with no human in the loop',
    description:
      'An autonomous agent self-registers a DCP renter account, receives a real API key plus a 20 SAR trial credit, lists GPU types, rents a whole GPU, runs work, and stops it — entirely through API or MCP tool calls, no email click and no human.',
    totalTime: 'PT2M',
    estimatedCost: { '@type': 'MonetaryAmount', currency: 'SAR', value: '0.50' },
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Self-register (zero human)',
        text: 'POST https://api.dcp.sa/api/renters/agent-register with an optional JSON body ({email, label, use_case}). The response (201) returns a real api_key (dcp-renter-...) and a 20 SAR trial credit — no human approval and no email verification. Via MCP this is the register_agent tool.',
        url: `${SITE_URL}/v2/agents`,
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'List GPU types',
        text: 'GET https://api.dcp.sa/api/renters/available-providers (or the list_gpus MCP tool) to see rentable GPU types — H200, H100, A100, L40S, RTX 5090, RTX 4090 — each with VRAM and live availability. Pick a gpu_type string.',
        url: `${SITE_URL}/v2/agents`,
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Rent a whole GPU',
        text: 'POST https://api.dcp.sa/api/pods with Authorization: Bearer <key>, an Idempotency-Key header (safe retries), and a body of { gpu_type, duration_minutes }. You get root, Jupyter over TLS and SSH in about a minute. If the wallet is short, the API returns HTTP 402 insufficient_balance with a topup_url and creates no pod.',
        url: `${SITE_URL}/v2/agents`,
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Run, then stop',
        text: 'Poll GET /api/pods/{id} for the access_url and ssh_command, run the workload, then DELETE /api/pods/{id} (stop_pod) for a prorated refund of unused minutes.',
        url: `${SITE_URL}/v2/agents`,
      },
    ],
  }
}

export const AGENT_FAQ: ReadonlyArray<FaqItem> = [
  {
    q: 'What is DCP?',
    a: "DCP (Datacenter Compute Platform) is Saudi Arabia's sovereign AI compute platform. It runs on Saudi-owned GPUs inside the Kingdom under full PDPL data-residency and provides an OpenAI-compatible inference API, on-demand whole-GPU rental (pods), persistent in-Kingdom storage, and an official MCP server — all billed prepaid in Saudi Riyal.",
  },
  {
    q: 'What does DCP do for AI agents?',
    a: 'DCP is built to be driven by software, not only humans. An agent can self-register a renter account in one unauthenticated call (no email click), get a real API key plus a 20 SAR trial credit, then rent GPUs, run OpenAI-compatible inference, and manage storage — over plain HTTPS or through the official MCP server (npx -y github:dhnpmp-tech/dcp-mcp).',
  },
  {
    q: 'How does an AI agent get an API key on DCP without a human?',
    a: "POST https://api.dcp.sa/api/renters/agent-register (no auth needed). It returns 201 with { api_key: 'dcp-renter-...', trial_credit_sar: 20, balance_sar: 20 }. Set that key as DCP_API_KEY (or the Bearer token) and start calling immediately. The MCP equivalent is the register_agent tool. The full 100 SAR trial stays behind human email-verified signup.",
  },
  {
    q: 'How does an AI agent start a GPU on DCP?',
    a: 'After getting a key, an agent lists GPU types (GET /api/renters/available-providers or list_gpus), then POSTs to https://api.dcp.sa/api/pods with { gpu_type, duration_minutes } and an optional Idempotency-Key header for safe retries. A whole NVIDIA GPU (H200, H100, A100, L40S, RTX 5090 or RTX 4090) comes up with root, Jupyter and SSH in about a minute, billed per minute in SAR.',
  },
  {
    q: 'What happens if an agent has insufficient balance?',
    a: "The money routes (create pod, extend pod, rent volume) return HTTP 402 with a machine-readable body: { code: 'insufficient_balance', required_sar, balance_sar, currency: 'SAR', topup_url, retryable: true }. No pod or charge is created, so an agent can read required_sar, prompt for a top-up, and safely retry with the same Idempotency-Key.",
  },
  {
    q: 'Is DCP an OpenAI-compatible inference API?',
    a: 'Yes. Point any OpenAI SDK at base_url https://api.dcp.sa/v1 with your DCP key as the Bearer token — no rewrite needed. POST /v1/chat/completions and GET /v1/models (each entry has an available flag) work as expected. Each response carries per-call usage pricing in both USD and SAR.',
  },
  {
    q: 'Where does an agent’s data live when it uses DCP?',
    a: 'Inside Saudi Arabia. Inference, GPU pods, and persistent volumes all run on in-Kingdom, Saudi-owned hardware under PDPL. DCP never exposes the underlying GPU vendor, machine, or location — only the public NVIDIA GPU type. Cross-border frontier models are available only by explicit per-tenant opt-in.',
  },
]

export function callInferenceHowToLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${SITE_URL}/#howto-inference`,
    name: 'How to call the DCP OpenAI-compatible inference API',
    description:
      'Use any OpenAI SDK against DCP by changing base_url to https://api.dcp.sa/v1 and using a DCP renter key.',
    totalTime: 'PT2M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Get a renter key',
        text: 'Create a renter account at dcp.sa and generate an API key. Fund the wallet in Saudi Riyal.',
        url: `${SITE_URL}/v2/setup`,
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Set base_url',
        text: 'Set your OpenAI client base_url to https://api.dcp.sa/v1 and the API key to your DCP renter key. No other code changes are needed.',
        url: `${SITE_URL}/quickstart`,
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Call chat completions',
        text: 'POST to /v1/chat/completions with a model from GET /v1/models (only models with available:true are serveable right now). Streaming, function calling and JSON mode are supported.',
        url: `${SITE_URL}/v2/docs`,
      },
    ],
  }
}
