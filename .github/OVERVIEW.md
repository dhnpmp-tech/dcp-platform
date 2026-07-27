# GitHub Automation

Maintained: 2026-06-01

This folder owns repository automation: CI, backend tests, daemon tests, Docker image publishing, production deployment, secret scanning, uptime monitoring, and PR templates.

Keep workflows here only when they operate on `dcp-platform`. Workflows for `dcp-agent`, `dcp-desktop`, or `dcp-contracts` belong in those DCP-SA repositories.

## Workflows

- `mission-github-issues-import.yml`: optional hourly importer from open GitHub
  issues to Mission Control. It is dry-run by default and scheduled runs are
  gated by `MISSION_GITHUB_ISSUES_IMPORT_ENABLED=1`.
