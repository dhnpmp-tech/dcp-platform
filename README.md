<div align="center">

<img src="public/dcp-logo-horizontal.webp" alt="DCP - Decentralized Compute Platform" width="520" />

### GPU compute marketplace and control plane for Saudi Arabia and the GCC.

[![Website](https://img.shields.io/badge/dcp.sa-00f0ff?style=flat-square&labelColor=050a14&logoColor=white)](https://dcp.sa)
[![Docs](https://img.shields.io/badge/docs-dcp.sa-050a14?style=flat-square&labelColor=00f0ff&logoColor=050a14)](https://dcp.sa/docs)
[![PDPL](https://img.shields.io/badge/PDPL-ready-00f0ff?style=flat-square&labelColor=050a14)](docs/compliance/pdpl-summary.md)
[![License](https://img.shields.io/badge/license-proprietary-1e293b?style=flat-square&labelColor=050a14)](#license)

**[Platform](https://dcp.sa)** · **[Docs](https://dcp.sa/docs)** · **[Provider setup](https://dcp.sa/setup)** · **[Renter app](https://dcp.sa/renter)**

</div>

---

## Overview

DCP is a full-stack GPU compute marketplace. Providers connect NVIDIA GPU machines, report capacity through a lightweight daemon, and earn for completed workloads. Renters use the web app, API, SDKs, or IDE extension to run inference and container jobs with SAR payments, API-key controls, and auditable settlement records.

The platform is built around three product surfaces:

- **Provider operations**: registration, daemon install, heartbeat, capability reporting, earnings, and payout settings.
- **Renter workflows**: marketplace discovery, job submission, OpenAI-compatible inference, billing, and spend controls.
- **Platform control plane**: admin dashboards, pricing, payment reconciliation, deployment templates, health checks, and security gates.

## Repository Scope

This repository contains the DCP platform application and API:

- Next.js web application and public docs
- Express backend with SQLite persistence
- Provider onboarding/installers
- Docker workload templates
- Payment, billing, and settlement services
- Local escrow-contract workspace
- SDK and IDE-extension sources
- Tests, CI, deployment, and security policy files

Related long-term source-of-truth repositories:

| Repository | Purpose |
| --- | --- |
| `DCP-SA/dcp-agent` | Provider machine agent |
| `DCP-SA/dcp-desktop` | Desktop provider app |
| `DCP-SA/dcp-contracts` | Shared API contracts and generated client types |

## Architecture

```text
Renter / SDK / IDE
        |
        v
dcp.sa Next.js app
        |
        v
api.dcp.sa Express backend
        |
        +-- SQLite data store
        +-- Moyasar payment services
        +-- Escrow settlement services
        +-- Provider routing and health
        |
        v
Provider daemon + GPU runtime
```

Core layers:

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Express.js, SQLite via `better-sqlite3`, Zod |
| Payments | Moyasar, SAR/halala accounting |
| Blockchain | Solidity, Hardhat, ethers.js, Base testnet |
| Jobs | Docker, Dockerode, NVIDIA Container Toolkit |
| P2P | libp2p discovery prototype |
| Testing | Jest, Playwright, template validation |
| Deployment | Vercel frontend, VPS backend, GitHub Actions |

## Project Structure

```text
dcp-platform/
├── app/                Next.js app, dashboards, docs, API proxies
├── backend/            Express API, services, migrations, installers, tests
├── components/         Shared React UI components
├── contracts/          Local escrow contract workspace
├── docker-templates/   GPU workload template definitions
├── docs/               Public product, API, compliance, and architecture docs
├── e2e/                Playwright end-to-end tests
├── infra/              Deployment and runtime configuration
├── lib/                Frontend utilities
├── ops/                Operator scripts
├── orchestration/      Health, monitoring, failover, and checkpoint modules
├── p2p/                libp2p discovery prototype
├── packages/           Shared package work
├── public/             Static web assets
├── scripts/            Repo-level smoke, release, and maintenance scripts
├── sdk/                Node and Python SDK sources
├── security/           Security test harnesses and policy entry points
├── tests/              Cross-cutting test suites
└── vscode-extension/   VS Code / Cursor extension source
```

See [REPO_MAP.md](REPO_MAP.md) for the maintained directory map.

## Local Development

Install root dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Run the backend:

```bash
cd backend
npm install
node src/server.js
```

Validate deploy templates:

```bash
npm --prefix backend run templates:validate
```

Build the web app:

```bash
npm run build
```

## Configuration

Start with the example environment files and only enable integrations you need locally.

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
```

Common variables:

| Variable | Purpose |
| --- | --- |
| `BACKEND_URL` | Backend API origin used by the frontend |
| `NEXT_PUBLIC_DC1_API` | Public API URL consumed by existing client code |
| `MOYASAR_SECRET_KEY` | Payment API key for top-ups and payouts |
| `MOYASAR_WEBHOOK_SECRET` | Webhook HMAC validation secret |
| `ESCROW_CONTRACT_ADDRESS` | Escrow contract address for chain-backed settlement |
| `BASE_RPC_URL` | Base RPC URL for escrow operations |

Secrets must stay in local env files or the deployment secret store. Do not commit real keys, databases, logs, or operator notes.

## Documentation

Public docs live in [docs/](docs/) and are served in the app at [dcp.sa/docs](https://dcp.sa/docs).

Useful entry points:

- [Quickstart](docs/quickstart.md)
- [API reference](docs/api-reference.md)
- [Provider guide](docs/provider-guide.md)
- [Renter guide](docs/renter-guide.mdx)
- [SDK guides](docs/sdk-guides.md)
- [Pricing guide](docs/pricing-guide.md)
- [GPU compatibility matrix](docs/gpu-matrix.md)
- [Container security](docs/container-security.md)
- [Escrow architecture](docs/escrow-architecture.md)

Operational notes, private research, launch checklists, agent memories, and informal drafts do not belong in this public repository.

## Security

DCP uses scoped API keys, rate limits, CORS allowlists, payment webhook verification, container sandboxing, and secret scanning in CI.

Read:

- [SECURITY.md](SECURITY.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/compliance/pdpl-summary.md](docs/compliance/pdpl-summary.md)

Responsible disclosure: `security@dcp.sa`.

## License

Proprietary. All rights reserved.

---

<div align="center">

**[dcp.sa](https://dcp.sa)** · **[docs](https://dcp.sa/docs)** · **[support@dcp.sa](mailto:support@dcp.sa)**

</div>
