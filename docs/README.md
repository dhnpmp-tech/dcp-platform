# DCP Documentation

This folder contains public product, API, compliance, and architecture documentation for the DCP platform.

Private operations notes, launch checklists, agent handoffs, unpublished drafts, and generated reports should live outside this repository.

## Start Here

| Document | Description |
| --- | --- |
| [Quickstart](./quickstart.md) | Submit a first workload through the DCP API. |
| [Quickstart Arabic](./quickstart-ar.md) | Arabic quickstart for first workload submission. |
| [API Reference](./api-reference.md) | Endpoint overview and authentication patterns. |
| [OpenRouter 60-Second First Request](./api/openrouter-60s-quickstart.md) | Signup to first `/v1/chat/completions` call. |
| [Provider Guide](./provider-guide.md) | Connect a GPU machine and receive jobs. |
| [Renter Guide](./renter-guide.mdx) | Use marketplace, billing, and job workflows. |
| [SDK Guides](./sdk-guides.md) | Python and JavaScript integration examples. |
| [Pricing Guide](./pricing-guide.md) | SAR pricing bands and provider/renter planning guidance. |
| [GPU Compatibility Matrix](./gpu-matrix.md) | GPU-to-model fit, batch sizing, and throughput planning. |
| [Container Security](./container-security.md) | Docker hardening controls and verification checks. |
| [Escrow Architecture](./escrow-architecture.md) | Settlement architecture and escrow flow. |
| [PDPL Summary](./compliance/pdpl-summary.md) | Public compliance summary. |

## Live Docs

The in-app documentation surface is available at [dcp.sa/docs](https://dcp.sa/docs).

## OpenAPI Spec

The maintained OpenAPI spec is [docs/openapi.yaml](./openapi.yaml). Public API routes also expose machine-readable and browser docs from the deployed backend.

## Local Test Note

If tests fail with a `better-sqlite3` native module version mismatch after switching Node.js versions or using a fresh environment, run:

```bash
cd backend
npm rebuild better-sqlite3
```

Then run E2E tests with:

```bash
npm run test:e2e
```
