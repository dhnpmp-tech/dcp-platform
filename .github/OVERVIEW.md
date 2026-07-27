# GitHub Automation

Maintained: 2026-07-26

This folder owns repository automation: CI, backend tests, daemon tests, Docker image publishing, production deployment, secret scanning, uptime monitoring, and PR templates.

Keep workflows here only when they operate on `dcp-platform`. Workflows for `dcp-agent`, `dcp-desktop`, or `dcp-contracts` belong in those DCP-SA repositories.

`workflows/ecc-pr-review-trio.yml` runs the ECC pull request review trio on
opened, synchronized, reopened, and ready-for-review PRs. It comments sticky
findings for `silent-failure-hunter`, `pr-test-analyzer`, and
`type-design-analyzer`.
