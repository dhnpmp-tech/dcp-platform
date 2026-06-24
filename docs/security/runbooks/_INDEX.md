# DCP Security — Staged Rollout Runbooks (Tito audit)

Designed + adversarially-reviewed 2026-06-24. Each is a PHASED rollout; execute in order, honor every GATE. Do NOT hot-apply.

- **per-provider-taskspec-signing-and-heartbeat-hmac-enforcement** — risk fleet-critical, reviewer no-go → `staged-rollouts/per-provider-taskspec-signing-and-heartbeat-hmac-enforcement.md`
- **renter-provider-key-at-rest-hashing** — risk risky, reviewer go-with-changes → `staged-rollouts/renter-provider-key-at-rest-hashing.md`
- **frontend-localstorage-key-exfil-to-sealed-cookie-proxy** — risk risky, reviewer go-with-changes → `staged-rollouts/frontend-localstorage-key-exfil-to-sealed-cookie-proxy.md`
- **backend-dep-cve-bluegreen-runbook** — risk test, reviewer go-with-changes → `staged-rollouts/backend-dep-cve-bluegreen-runbook.md`
- **ops-closures-mc-token-rotation-git-scrub-admin-mfa** — risk risky, reviewer go-with-changes → `staged-rollouts/ops-closures-mc-token-rotation-git-scrub-admin-mfa.md`
