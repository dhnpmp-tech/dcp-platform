<div align="center">

<img src="public/dcp-logo.svg" alt="DCP — DC Power" width="520" />

### Saudi Arabia's sovereign GPU compute & AI-inference marketplace.

Run AI inference and rent GPUs by the minute — on verified **in-Kingdom** GPUs, **PDPL-compliant**, billed in **Saudi Riyal**.

[![Website](https://img.shields.io/badge/dcp.sa-00f0ff?style=flat-square&labelColor=050a14&logoColor=white)](https://dcp.sa)
[![Docs](https://img.shields.io/badge/docs-dcp.sa-050a14?style=flat-square&labelColor=00f0ff&logoColor=050a14)](https://dcp.sa/docs)
[![Agents](https://img.shields.io/badge/agents-MCP%20ready-00f0ff?style=flat-square&labelColor=050a14)](https://dcp.sa/agents)
[![PDPL](https://img.shields.io/badge/PDPL-ready-00f0ff?style=flat-square&labelColor=050a14)](docs/compliance/pdpl-summary.md)
[![License](https://img.shields.io/badge/license-proprietary-1e293b?style=flat-square&labelColor=050a14)](#license)

**[Platform](https://dcp.sa)** · **[Docs](https://dcp.sa/docs)** · **[Provider setup](https://dcp.sa/setup)** · **[Renter app](https://dcp.sa/renter)** · **[For agents](https://dcp.sa/agents)**

</div>

---

## Overview

**DCP** (by **DC Power Solutions**, CR 7053667775) is Saudi Arabia's **sovereign GPU compute and AI-inference marketplace**. Workloads run on **verified in-Kingdom GPUs**, data stays in the Kingdom by default, and everything is billed in **Saudi Riyal (SAR)** with **PDPL-compliant** handling.

Two products are live today:

- **AI Inference — "AI by the token."** An OpenAI-compatible API (`api.dcp.sa/v1`) for chat/completions, billed per token in SAR. Sovereign round-trip: an Arabic prompt is served by a Saudi GPU and answered in Arabic, never routed to a foreign cloud (cross-border frontier models are strict opt-in, per tenant).
- **GPU Pods by the minute.** Launch a dedicated GPU pod (Jupyter + SSH) in minutes, billed per-second in SAR, extend it on the fly, and attach persistent in-Kingdom storage.

**Settlement is fiat SAR via Moyasar.** Top up by card (3DS), pay as you go, and — as a provider — get paid in **real Saudi Riyal**. Not crypto.

Built to be operated by humans *and* autonomous agents: an agent can register itself, get a trial balance, run inference, rent a GPU pod, and manage storage end-to-end with zero humans in the loop.

---

## Features

### 🧠 AI inference
- OpenAI-compatible `POST /v1/chat/completions` + in-browser playground; **per-token SAR billing** with prepaid balances.
- **Multi-engine provider routing** (llama.cpp · Ollama · vLLM) with live health probes, capability verification, single-in-flight gating per provider, and automatic fallback.
- **Sovereign round-trip** — served by an in-Kingdom GPU by default; cross-border/frontier models are opt-in per tenant.
- **ELM (Expert Language Models)** — fine-tuned 4–8B domain models that beat frontier APIs on a specific task at a fraction of the cost ("build a Camry for the job, don't drive a Porsche everywhere").
- Arabic-first, with a reproducible Arabic customer-service benchmark (harness + dataset + baselines).

### ⚡ GPU pods
- Renter-launchable **dedicated GPU pods** (Jupyter + SSH), billed **per-GPU-second in SAR**, prepaid with early-stop refunds.
- **Extend on the fly** — +30m / +1h / +2h, no restart, incremental SAR charge, 24h ceiling.
- **Persistent workspaces** — rentable in-Kingdom volumes (10 / 20 / 30 GB); `/workspace` reattaches across pods, with honest ephemeral-vs-persistent signalling and an upsell when ephemeral.
- Live rental countdown + sub-5-minute expiry warning; fast teardown frees the GPU (and restores inference) within ~7s.
- Container templates (PyTorch, …) on Docker + NVIDIA Container Toolkit.

### 💾 Persistent volumes
- Paid, exclusive, **in-Kingdom** persistent storage (S3-compatible, mesh-only), per-renter quota, monthly billing in advance with a 7-day suspend-but-keep-data grace on lapse. Cross-provider restore/snapshot on pod launch/teardown.

### 🤖 Agent-first (built for autonomous agents)
- **Model Context Protocol (MCP) server** (`@dcp/mcp`) exposing tools — `register_agent, list_models, chat, get_balance, list_gpus, create_pod, get_pod, extend_pod, stop_pod, rent_volume, get_volume` — so an MCP-capable agent (Claude, Cursor, custom) runs inference, rents GPUs, and manages storage via native tool calls.
- **Self-serve agent onboarding** — `POST /api/renters/agent-register` → API key + **20 SAR trial**, zero humans to a running pod.
- **Agent discoverability / AEO** — `llms.txt`, `.well-known/ai-plugin.json`, sitewide schema.org JSON-LD, a dedicated `/agents` page, and machine-readable **HTTP 402** (`insufficient_balance` → `topup_url`) before any unpaid work.

### 💳 Payments & settlement — fiat SAR (live)
- **Moyasar** card top-up (hosted invoice + 3DS — no card data touches DCP), **SAR/halala ledger**, idempotent webhook crediting.
- Per-second / per-token metering, prepaid quotes, refunds on early stop or failure, monthly volume billing.
- **Provider payouts in SAR** via Moyasar pay-out rails.
- *On-chain escrow settlement is **roadmap, not live** — see [Roadmap](#roadmap).*

### 🖥️ Provider platform
- Self-serve onboarding (web wizard · CLI · desktop app), a lightweight **auto-updating daemon**, GPU capability reporting + heartbeats, self-serve pod pricing, and an earnings dashboard.
- Connect from home/residential networks over a **self-hosted WireGuard mesh** — no public IP or port-forwarding required (works behind CGNAT), which is what makes consumer GPUs viable.

### 🛠️ Control plane & ops
- Admin command center: pricing, payment reconciliation, incident command, provider approval, fleet/launch-readiness, deployment templates, and health checks.

### 🔒 Security & compliance
- PDPL-ready, sovereign data residency, HMAC-signed daemon/webhook auth, scoped API keys, audit logging, secret scanning (CI), and hardened container isolation.

---

## Architecture

```text
Renter · SDK · IDE · Agent (MCP)
        │
        ▼
   dcp.sa            Next.js web app, dashboards, docs, agent surfaces
        │
        ▼
 api.dcp.sa          Express API
        ├─ SQLite          SAR/halala ledger · jobs · providers · volumes
        ├─ Moyasar         fiat SAR pay-in / pay-out   ← live settlement
        ├─ Routing         multi-engine health, verification, in-flight gating, fallback
        └─ WireGuard mesh  outbound-only gateway for residential providers
        │
        ▼
 Provider daemon + GPU runtime   (verified in-Kingdom GPUs)
        +  partner-backed on-demand capacity for additional GPU types
```

---

## Repository structure

```text
dcp-platform/
├── app/                Next.js app — dashboards, docs, agent surfaces, API proxies
├── backend/            Express API, services, migrations, provider installers, tests
├── components/         Shared React UI
├── contracts/          On-chain settlement workspace — ROADMAP, dormant (see Roadmap)
├── docker-templates/   GPU workload + pod template definitions
├── docs/               Public product, API, compliance, provider, and architecture docs
├── e2e/                Playwright end-to-end tests
├── infra/              Deployment and runtime configuration
├── integrations/       Agent integrations (MCP server)
├── ops/                Operator scripts
├── orchestration/      Health, monitoring, failover, checkpoint modules
├── packages/           Shared packages
├── public/             Static assets, llms.txt, .well-known/ai-plugin.json
├── scripts/            Repo-level smoke, release, maintenance scripts
├── sdk/                Node + Python SDK sources
├── security/           Security test harnesses and policy
└── vscode-extension/   VS Code / Cursor extension source
```

See [REPO_MAP.md](REPO_MAP.md) for the maintained directory map.

| Long-term source-of-truth repos | Purpose |
| --- | --- |
| `DCP-SA/dcp-agent` | Provider machine agent |
| `DCP-SA/dcp-desktop` | Desktop provider app |
| `DCP-SA/dcp-contracts` | Shared API contracts + generated client types |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Express.js, SQLite (`better-sqlite3`), Zod |
| Inference | llama.cpp · Ollama · vLLM, OpenAI-compatible API |
| Pods & jobs | Docker, Dockerode, NVIDIA Container Toolkit |
| Networking | self-hosted WireGuard mesh (residential-NAT friendly) |
| Payments | Moyasar, SAR/halala accounting |
| Agents | Model Context Protocol (MCP) server + AEO discovery |
| Testing | Jest, Playwright, template/contract validation |
| Deployment | Vercel (frontend), VPS (backend), GitHub Actions |

---

## Getting started

**Renter (API)**
```bash
# 1. Get a key (self-serve / agent)
curl -X POST https://api.dcp.sa/api/renters/agent-register
# 2. Run inference (OpenAI-compatible)
curl https://api.dcp.sa/v1/chat/completions \
  -H "Authorization: Bearer <dcp-renter-key>" \
  -d '{"model":"<model>","messages":[{"role":"user","content":"مرحبا"}]}'
```

**Rent a GPU pod**
```bash
dcp --base-url https://api.dcp.sa pod create --image pytorch --duration 60 --token <key>
dcp pod list | get | extend | stop
```

**Provider** — install the daemon / desktop app, join the WireGuard mesh, report your GPU, set your price, earn SAR. See [Provider onboarding](docs/PROVIDER-ONBOARDING-GUIDE-AR.md).

**Agent** — point an MCP client at `@dcp/mcp`; tools auto-register.

---

## Local development

```bash
npm install            # root deps
npm run dev            # web app (Next.js)

cd backend
npm install
node src/server.js     # API

npm --prefix backend run templates:validate   # validate deploy templates
npm run build          # production build
```

## Configuration

Start from the example env files; enable only the integrations you need locally.

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
```

| Variable | Purpose |
| --- | --- |
| `BACKEND_URL` | Backend API origin used by the frontend |
| `NEXT_PUBLIC_DC1_API` | Public API URL consumed by client code |
| `MOYASAR_SECRET_KEY` | Payment API key for SAR top-ups and payouts |
| `MOYASAR_WEBHOOK_SECRET` | Webhook HMAC validation secret |

Secrets stay in local env files or the deployment secret store. Never commit real keys, databases, logs, or operator notes.

---

## Documentation

- [API reference](docs/api-reference.md) · [OpenAPI](docs/openapi.yaml)
- [Provider onboarding](docs/PROVIDER-ONBOARDING-CLI.md) · [Dashboard](docs/PROVIDER-DASHBOARD-GUIDE.md) · [Earnings](docs/PROVIDER-EARNINGS-GUIDE.md)
- [Architecture overview](docs/architecture-overview.mdx) · [Container jobs](docs/container-jobs.md)
- [Compliance](docs/COMPLIANCE.md) · [Security](docs/SECURITY.md) · [Privacy](docs/PRIVACY.md) · [Terms](docs/TERMS.md)
- [Changelog](CHANGELOG.md)

---

## Roadmap

- **On-chain agent-to-agent settlement rail** — Solidity escrow / provider-staking / job-attestation contracts (Base testnet). **Not live**; kept for when autonomous agents settle payments directly with each other. Today, all settlement is fiat SAR via Moyasar.
- **ELM registry + autoscale-by-domain** — replicate in-demand domain models across providers; renters pick a model + SLA, not a provider.
- **Managed in-Kingdom object storage** — swap the mesh MinIO store for a managed KSA S3-compatible backend.

---

## License

Proprietary — © DC Power Solutions. All rights reserved.
