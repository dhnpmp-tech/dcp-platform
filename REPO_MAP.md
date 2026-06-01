# DCP Platform Repository Map

Maintained: 2026-06-01

This repository is the DCP platform monorepo: web app, public API, backend services, provider installers, deployment templates, and public product documentation.

## Source Of Truth

- Platform application and API: this repository.
- Provider machine agent: `DCP-SA/dcp-agent`.
- Desktop provider app: `DCP-SA/dcp-desktop`.
- Shared API contracts and generated client types: `DCP-SA/dcp-contracts`.

## Top-Level Folders

| Folder | Status | Purpose |
| --- | --- | --- |
| `.github/` | Active | CI, release, deployment, and monitoring workflows. |
| `app/` | Active | Next.js application routes, dashboards, docs pages, and API proxies. |
| `backend/` | Active | Express API, SQLite migrations, provider installers, billing, routing, and tests. |
| `components/` | Active | Shared React UI components used by the app. |
| `contracts/` | Active, planned split | Local escrow contract workspace. Long-term contract source should live in `DCP-SA/dcp-contracts`. |
| `docker-templates/` | Active | Job/template definitions used for deployable GPU workloads. |
| `docs/` | Active | Public product, API, compliance, and architecture documentation that belongs with platform code. |
| `e2e/` | Active but quiet | Playwright end-to-end test suites. |
| `infra/` | Active | Deployment, vLLM, Docker, and VPS infrastructure assets. |
| `lib/` | Active | Small shared frontend utilities. |
| `ops/` | Active | Operator CLI and fleet health scripts. |
| `orchestration/` | Active but quiet | Failover, checkpoint, healthcheck, and monitoring modules. |
| `p2p/` | Active but quiet | libp2p provider discovery prototype and smoke tests. |
| `packages/` | Active | Shared package/type integration work. |
| `public/` | Active | Static assets and public docs artifacts served by Next.js. |
| `scripts/` | Active | Repo-level smoke, release, and maintenance scripts. |
| `sdk/` | Active but planned split | Python and Node SDK sources. Long-term SDK publishing should align with `DCP-SA/dcp-contracts`. |
| `security/` | Active but quiet | Security isolation reports and tests. |
| `tests/` | Active | Cross-cutting tests outside backend-owned Jest suites. |
| `vscode-extension/` | Active | Current DCP VS Code/Cursor extension source. |

## Public Repository Policy

Keep this repository focused on product source, public docs, tests, and deployable configuration. Private operations notes, local agent state, generated reports, database backups, status handoffs, launch checklists, and unpublished drafts belong in private operations storage or dedicated DCP-SA repositories.
