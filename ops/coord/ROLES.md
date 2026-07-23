# DCP Work Roles (SSOT)

Last updated: 2026-07-22

## Who exists

| Agent | Channel | Owns | Does NOT own |
|-------|---------|------|--------------|
| **Tareq (Founder)** | Telegram DCP, human | Priority, merge-to-prod approval, deploy approval, keys/money | Day-to-day implementation |
| **Codex** | Repo / GitHub PRs | Branches, PRs vs `main`, CI green, conflict resolution, code merge path | VPS runtime, PM2, live DB, unapproved deploys |
| **Claude Code** | @TitoThe_bot (WSL → VPS SSH) | VPS ops, daemon/backend runtime, live incident response, security review on box | Opening noisy parallel PRs without board claim |
| **Hermes** | This chat / DCP Telegram | Intake, board updates, assignment, unblocking, status reports, glue between Codex↔Claude | Silent dual-work on claimed items |

## Dead systems (do not depend on)

- **Paperclip** (`:3100`) — `bootstrap_pending`, never onboarded. Freeze until founder decides bootstrap or kill.
- **23-persona agent swarm** — docs/personas only. Not running.
- **OpenClaw multi-bot fleet** — containers up; not the dev team.

## Conflict rules

1. **One owner per board item.** If two agents touch the same thing, Hermes stops one.
2. **Repo changes → Codex lane** (branch + PR). Claude may patch on VPS for hotfix only if board item says `hotfix` and founder approved.
3. **VPS/runtime → Claude lane.** Hermes investigates; Claude executes on box when hands-on needed.
4. **No deploy without founder.** Merge ≠ deploy. PM2 restart / fleet daemon push needs explicit "deploy".
5. **Board is truth.** If it's not on `ops/coord/board.json`, it is not assigned work.
