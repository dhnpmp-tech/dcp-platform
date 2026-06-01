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

- Removed obsolete duplicate OpenAPI YAML files and retargeted API guide links to the maintained `docs/openapi.yaml` spec.
- Rewrote the root `README.md` as a clean platform overview for GitHub visitors.
- Rewrote `DEPLOYMENT.md`, `SECURITY.md`, and `docs/README.md` for public use.
- Moved the runtime verification guide to `docs/runtime-verification.mdx`.
- Removed or rewrote stale links to removed internal docs, old `dc1-platform` repository URLs, and legacy `docs.dcp.sa` references.
- Sanitized public brand docs and package metadata to use current DCP naming and links.

### Notes

- The private Codex/Claude onboarding briefing lives outside this repository at `~/.claude/ops-private/dcp/codex-onboarding/`.
- The next feature PRs should target real remaining gaps only, such as catalog alias matching, refund request workflow, pricing page refresh, and liveness/sentinel follow-ups.
