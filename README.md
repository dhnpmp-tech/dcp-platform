<div align="center">

<img src="public/dcp-logo-horizontal.webp" alt="DCP — Decentralized Compute Platform" width="520" />

### GPU compute, in-kingdom. Per-token billing, on-chain settlement, Arabic-native.

[![Website](https://img.shields.io/badge/dcp.sa-00f0ff?style=flat-square&labelColor=050a14&logoColor=white)](https://dcp.sa)
[![API](https://img.shields.io/badge/api.dcp.sa-050a14?style=flat-square&labelColor=00f0ff&logoColor=050a14)](https://api.dcp.sa/docs/ui)
[![PDPL](https://img.shields.io/badge/PDPL-compliant-00f0ff?style=flat-square&labelColor=050a14)](docs/compliance/pdpl-summary.md)
[![Base](https://img.shields.io/badge/Base-Sepolia-050a14?style=flat-square&labelColor=00f0ff&logoColor=050a14)](contracts/)
[![License](https://img.shields.io/badge/license-proprietary-1e293b?style=flat-square&labelColor=050a14)](#license)

**[dcp.sa](https://dcp.sa)** · **[API docs](https://api.dcp.sa/docs/ui)** · **[Providers](https://dcp.sa/setup)** · **[Renters](https://dcp.sa/renter)**

</div>

---

## What this is

**DCP** is a full-stack GPU compute marketplace built for Saudi Arabia. Providers plug in NVIDIA GPUs and earn per-job revenue. Renters rent capacity by the minute — inference, training, Arabic LLMs — and pay in SAR or USDC. Every job settles through an on-chain escrow. Every byte stays in-kingdom.

Not a research toy. Not a hyperscaler wrapper. A working platform with live providers, a live marketplace, a live daemon, and a live API.

---

## Why it's different

| | DCP | AWS Bedrock | RunPod | Vast.ai |
|---|---|---|---|---|
| **Data residency** | KSA-only, by design | Region-selectable | US / EU | Global distributed |
| **Arabic-native models** | ALLaM · JAIS · Qwen-AR · Falcon H1 | None dedicated | None | None |
| **PDPL-by-design** | Yes | Bolted-on | No | No |
| **Pricing floor** | Provider cost + margin | Hyperscaler + markup | Opaque spread | Auction |
| **Settlement** | On-chain escrow (Base) | Invoice | Invoice | Invoice |
| **Saudi payment rails** | Moyasar (SAR) | USD only | USD only | USD only |

---

## Architecture

```
                    ┌──────────────────────────┐
                    │   dcp.sa · Next.js 14    │
                    │   Renter + Provider UX   │
                    └──────────────┬───────────┘
                                   │
                    ┌──────────────▼───────────┐
                    │   api.dcp.sa · Express   │
                    │   SQLite · Moyasar · MC  │
                    └──┬────────┬────────┬─────┘
                       │        │        │
             ┌─────────▼──┐ ┌───▼───┐ ┌──▼─────────┐
             │  Escrow    │ │  P2P  │ │  Provider  │
             │  Base L2   │ │ libp2p│ │  daemon    │
             │  EIP-712   │ │  DHT  │ │  (Go/Node) │
             └────────────┘ └───────┘ └────────────┘
```

Six layers, loosely coupled, each replaceable:

- **Frontend** — Next.js 14 App Router, role-based dashboards, EN/AR i18n, Tailwind with a custom `dc1-*` token palette.
- **Backend** — Express.js + SQLite on bare metal, OpenAPI 3.0, Zod validation, scoped API keys.
- **Escrow** — Solidity on Base. 75/25 provider/platform split, EIP-712 signed claim proofs, timeout refunds.
- **P2P** — libp2p Kademlia DHT for provider discovery. Central bootstrap today; full peer-to-peer rollout phased.
- **SDKs** — Official Python + Node.js clients. Idiomatic, typed, thin.
- **IDE extension** — VSCode / Cursor. Submit jobs, stream logs, browse GPUs without leaving the editor.

---

## Features

**For providers** — register a machine, set your rate, earn. Bronze → Silver → Gold tiers unlock visibility. A lightweight daemon handles heartbeat, container lifecycle, and 429-aware backoff.

**For renters** — browse a live marketplace filtered by VRAM, model, and price. Submit via dashboard, CLI, SDK, or IDE. Stream logs over SSE. Pay per-job.

**For admins** — platform KPIs, machine health, price bands, provider leaderboard, payout controls.

**Payments** — Moyasar (SAR, halala-precise) for fiat. USDC escrow on Base for crypto. Both settle atomically.

**P2P discovery** — providers announce GPU specs to a DHT overlay. No central registry required.

**Bilingual** — every dashboard, doc, and error message. Full RTL. Arabic-optimized LLM serving.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
| Backend | Express.js · SQLite (better-sqlite3) · Zod |
| Blockchain | Solidity · Hardhat · ethers.js · Base Sepolia → mainnet |
| P2P | libp2p · Kademlia DHT · Noise · yamux |
| Payments | Moyasar · USDC escrow |
| Containers | Docker · Dockerode · NVIDIA Container Toolkit |
| Testing | Playwright · Jest |
| Deployment | Docker Compose · Vercel · bare-metal VPS |
| Email | Resend |

---

## Project structure

```
dcp-platform/
├── app/                # Next.js 14 App Router — 38+ routes
│   ├── provider/       #   Provider dashboard
│   ├── renter/         #   Renter dashboard
│   ├── admin/          #   Admin dashboard
│   ├── marketplace/    #   GPU marketplace
│   ├── jobs/           #   Job submission + monitoring
│   └── docs/           #   In-app documentation (EN/AR)
├── backend/            # Express.js API server
│   ├── src/            #   Routes, services, middleware
│   └── installers/     #   Provider daemon packages (26 OS/arch combos)
├── contracts/          # Solidity escrow + MockUSDC
├── p2p/                # libp2p overlay network
├── sdk/
│   ├── python/         # dc1 pip package
│   └── node/           # @dcp/sdk npm package
├── vscode-extension/   # VS Code/Cursor extension
├── orchestration/      # Checkpoint · failover · healthcheck · alerting
├── security/           # Guardian isolation module
├── infra/              # Docker templates · vLLM configs · nginx
├── docs/               # Public documentation
├── e2e/                # Playwright end-to-end tests
└── tests/              # Unit · integration · load · smoke
```

---

## Quick start

**Frontend**
```bash
npm install
npm run dev          # → http://localhost:3000
```

**Backend**
```bash
cd backend
npm install
node src/server.js   # → http://localhost:8083
```

**Production (Docker)**
```bash
docker compose -f docker-compose.prod.yml up -d
```

**Environment** — copy `.env.example` to `.env.local` and fill in:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
BACKEND_URL=https://api.dcp.sa
NEXT_PUBLIC_DC1_API=https://api.dcp.sa

# Payments (sandbox mode without)
MOYASAR_SECRET_KEY=sk_test_...
RESEND_API_KEY=re_...

# On-chain escrow (optional)
ESCROW_CONTRACT_ADDRESS=0x...
BASE_RPC_URL=https://sepolia.base.org
```

See `backend/.env.example` for backend-side variables.

---

## SDKs

**Python**

```bash
pip install dc1
```

```python
import dc1

client = dc1.DC1Client(api_key="dc1-renter-xxx")
job = client.jobs.submit("llm_inference", {
    "model": "allam-7b",
    "prompt": "اشرح الحوسبة الكمومية بإيجاز"
}, provider_id=1, duration_minutes=5)
result = client.jobs.wait(job.id)
```

**Node.js / TypeScript**

```bash
npm install @dcp/sdk
```

```typescript
import { DC1Client } from "@dcp/sdk";
const client = new DC1Client({ apiKey: "dc1-renter-xxx" });
const job = await client.jobs.submit("llm_inference", { model: "allam-7b" });
```

---

## IDE extension

The **DCP GPU Compute** extension for VSCode and Cursor ships a provider sidebar, marketplace tree, job submission commands, live log streaming, and a 20+ template catalog — all without leaving your editor.

```bash
cd vscode-extension
npm install && npm run compile
```

---

## Smart contracts

Escrow holds renter USDC until job completion, then releases 75% to the provider and 25% to the platform against an EIP-712 signed claim proof. Timeout triggers a full refund.

```bash
cd contracts
npm install
npx hardhat test
npx hardhat run scripts/deploy.js --network baseSepolia
```

Base Sepolia today. Mainnet after third-party audit.

---

## API

The backend exposes a REST API with OpenAPI 3.0 docs at `/api/docs/ui`:

- **Providers** — registration, heartbeat, capability reporting, earnings
- **Renters** — registration, marketplace, wallet
- **Jobs** — submit, monitor, cancel, stream (SSE)
- **Models** — vLLM catalog with pricing + Arabic model support
- **Templates** — 20+ Docker environments (LLM, training, embeddings, image gen)
- **Payments** — Moyasar top-up, invoices, refunds
- **Admin** — KPIs, health, price bands, payouts

---

## Documentation

Public docs live in [`docs/`](docs/) and are served at [docs.dcp.sa](https://docs.dcp.sa):

- [Quickstart](docs/quickstart.md) · [العربية](docs/quickstart-ar.md)
- [API Reference](docs/api-reference.md) · [العربية](docs/api-reference-ar.md)
- [Provider Setup Guide](docs/provider-guide.md)
- [SDK Guides](docs/sdk-guides.md)
- [Pricing Guide](docs/pricing-guide.md)
- [GPU Compatibility Matrix](docs/gpu-matrix.md)
- [Container Security](docs/container-security.md)
- [Escrow Integration](docs/ESCROW-INTEGRATION-GUIDE.md)
- [Provider Integration](docs/PROVIDER-INTEGRATION-GUIDE.md)
- [Migrate from RunPod](docs/guides/migrate-runpod-to-dcp.md) · [Migrate from Vast.ai](docs/guides/migrate-vast-to-dcp.md)

Operational runbooks (P2P, deployment, incident response) live in an access-controlled repo. Contact `support@dcp.sa` if you need access.

---

## Security & compliance

Defense-in-depth, every layer:

- TLS 1.3 everywhere (Let's Encrypt, valid through 2026-06)
- Cryptographic API keys (32-byte random, scoped, revocable)
- Parameterised SQL, strict CORS allowlists, per-endpoint rate limits
- Container sandboxing via the Guardian isolation module
- Kernel capability dropping for untrusted workloads
- **PDPL-compliant by design** — all data stays in KSA
- SAMA financial reporting alignment
- Data-residency planning for STC Cloud + AWS Bahrain

See [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/compliance/pdpl-summary.md`](docs/compliance/pdpl-summary.md). Responsible disclosure to `security@dcp.sa`.

---

## Provider requirements

| Requirement | Minimum |
|-------------|---------|
| GPU | NVIDIA, 8 GB+ VRAM |
| Docker | 20.10+ |
| NVIDIA Container Toolkit | latest |
| Python | 3.8+ |
| OS | Ubuntu 20.04+ |

Pre-built installer packages for 26 OS/arch combinations live in [`backend/installers/`](backend/installers/).

---

## License

Proprietary — DCP. All rights reserved.

---

<div align="center">

**[dcp.sa](https://dcp.sa)** · **[api.dcp.sa](https://api.dcp.sa)** · **[support@dcp.sa](mailto:support@dcp.sa)**

<sub>Built in Riyadh.</sub>

</div>
