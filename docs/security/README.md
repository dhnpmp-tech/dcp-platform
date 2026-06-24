# DCP Security — tracker & re-audit system

A versioned, repeatable security-management system for the DCP platform. Goal: always know exactly where we stand, and re-run the audit on demand or on a schedule.

## Files
- **`STATUS.md`** — the single source of truth: every finding (id, severity, status, where-fixed, last-verified). **Read first, update last.**
- **`CHANGELOG.md`** — chronological log of what changed each session.
- **`runbooks/`** — phased, adversarially-reviewed rollout plans for the staged (not-yet-shipped) items. Each has GATES — honor them.
- **`audits/`** — dated raw audit reports (baseline + each re-audit), so we can diff over time.

## How to re-audit (repeatable)
Run the **`/dcp-security-audit`** skill (`~/.claude/skills/dcp-security-audit/`). It:
1. reads `STATUS.md`, 2. fans out parallel agents to scan vuln classes read-only, 3. adversarially verifies each finding live (kills stale ones), 4. reconciles NEW/REGRESSED/STILL-OPEN/CLOSED vs the tracker, 5. fixes safe items live (pod-aware `safe-reload` + fleet check) or stages a runbook, 6. updates `STATUS.md` + `CHANGELOG.md` + drops a dated `audits/` report.

It encodes the hard constraints (daemon `DC1_HMAC_SECRET` = task_spec key; heartbeat enforcement = fleet 401; never drop plaintext columns mid-migration; blue-green deps; Vercel-fail-safe) so a re-run can't repeat the traps.

## Periodic
A scheduled run keeps this honest over time (see the cron/routine set up alongside this system). Any team member can also trigger a fresh external audit via Tito/Croc and drop the report in `audits/`.

## Deploy discipline (always)
Backend = pod-aware `/root/dc1-platform/safe-reload.sh` + HTTP verify + fleet-heartbeat check. Frontend = `security/*` branch → Vercel preview → merge to main. Fleet-critical/credential = phased runbook, never hot-applied.
