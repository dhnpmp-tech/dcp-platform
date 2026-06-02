# Changelog

All notable public-facing changes to the DCP platform repository are tracked here.

This changelog is for repository, product, and release-level changes. Detailed engineering notes may still live near the subsystem they describe, but internal handoffs, private operations notes, generated reports, and launch checklists do not belong in the public repository.

## [Unreleased]

### Repository

- Cleaned the public repository surface for the `dcp-platform` GitHub repo.
- Removed internal coordination notes, agent handoffs, private planning docs, generated reports, stale workflow files, disabled source copies, and build artifacts from the tracked tree.
- Added public repository orientation through `README.md`, `REPO_MAP.md`, folder `OVERVIEW.md` files, and a pull request template.
- Updated GitHub repository metadata with a public description, homepage, and topics.
- Disabled stale GitHub Actions workflows that referenced removed or missing files.
- Added ignore rules for local/private docs, generated installer outputs, local agent state, build artifacts, and runtime data.

### Documentation

- Synced the deployed `/docs/openapi.yaml` public spec copy with the maintained `docs/openapi.yaml` refund-request API documentation.
- Removed obsolete duplicate OpenAPI YAML files and retargeted API guide links to the maintained `docs/openapi.yaml` spec.
- Added OpenAPI coverage for renter refund requests, the admin payments audit queue, and refund approve/reject actions.
- Rewrote the root `README.md` as a clean platform overview for GitHub visitors.
- Refreshed the public pricing page with auto-top-up behavior, the 402 pre-flight balance gate, subscription discount math, and per-model-class token rates.
- Rewrote `DEPLOYMENT.md`, `SECURITY.md`, and `docs/README.md` for public use.
- Moved the runtime verification guide to `docs/runtime-verification.mdx`.
- Removed or rewrote stale links to removed internal docs, old `dc1-platform` repository URLs, and legacy `docs.dcp.sa` references.
- Sanitized public brand docs and package metadata to use current DCP naming and links.

### Backend

- Added Qwen2.5-VL alias coverage and canonical provider-count matching so cached `bge-m3` / `qwen2.5vl` variants surface correctly in the model catalog.
- Reused the canonical model alias matcher in multi-engine routing, legacy routing, and `/api/providers/model-catalog` so requests such as `BAAI/bge-m3`, `qwen/qwen2.5-vl-3b-instruct`, or `ALLaM-AI/ALLaM-7B-Instruct-preview` can discover providers serving canonical cached tags.
- Removed the legacy queued-job pre-debit in `/v1/chat/completions`; queued inference now uses the same `settleInferenceOnce` completion settlement path as direct provider proxying.
- Tightened backend provider liveness so catalog and routing require a real endpoint probe verdict, persist consecutive probe failures, and no longer treat heartbeat-only freshness as routable capacity.
- Hardened WireGuard provider registration so live `wg0` peer changes roll back when the provider DB write fails, preventing DB/server tunnel drift during registration or reinstall.
- Added a renter refund-request queue for paid top-ups with admin approve/reject actions on the payments audit screen.

### CI

- Added disk cleanup before scheduled worker-image Docker builds so heavyweight vLLM/SDXL layers have enough GitHub runner headroom.
- Uptime monitor sentinel inference now warns and alerts when skipped, auto-selects an online model for its smoke request, and fails after a missing sentinel renter key remains unresolved for 24 hours.
- Added a second Docker/Buildx prune between instant LLM and SD worker builds so the SD image starts with fresh runner headroom after the large vLLM image publish.

### Repository

- Swapped the README logo to the vector SVG asset so GitHub renders it sharply at large widths.
- Removed the stale `public/dcp-logo-horizontal.webp` asset after confirming it was an unused 128px PNG with a `.webp` extension.

### Notes

- The private Codex/Claude onboarding briefing lives outside this repository at `~/.claude/ops-private/dcp/codex-onboarding/`.
- The next feature PRs should target real remaining gaps only, such as earned-first/strict routing validation, provider catalog follow-ups, and launch readiness checks.
