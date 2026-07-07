# DCP Codebase and Production Audit - 2026-07-07

Audit timestamp: 2026-07-07 16:53 UTC / 20:53 +04.

## Purpose

Confirm which repositories are authoritative, whether local/GitHub/VPS/Vercel are
in sync, and what should be fixed next so DCP development can move without
working from the wrong tree or regressing production.

## Source of Truth

The active platform working tree for this session is:

- Local: `/Users/pp/DC1-Platform/dc1-platform`
- GitHub: `https://github.com/dhnpmp-tech/dcp-platform`
- VPS2: `root@76.13.179.86:/root/dc1-platform`

Current verified platform commit:

- Local `main`: `237b77949a64`
- GitHub `origin/main`: `237b77949a64`
- GitHub `origin/security/staged-rollouts`: `237b77949a64`
- VPS2 branch `security/staged-rollouts`: `237b77949a64`

Result: `dcp-platform` is aligned across local, GitHub, and VPS2.

## Local Workspace Inventory

| Local path | GitHub repo | State | Notes |
|---|---|---|---|
| `/Users/pp/DC1-Platform/dc1-platform` | `dhnpmp-tech/dcp-platform` | aligned | Active repo. Untracked local files: `.verify/home-1440.png`, `ops/dcp-deploy-watch.sh`. |
| `/Users/pp/DC1-Platform/dcp-desktop` | `DCP-SA/dcp-desktop` | aligned | Fast-forwarded local `main` from `0cddab2` to `9f56ba4` during this audit. Untracked `.claude/worktrees/agent-a3969583/` remains local. |
| `/Users/pp/DC1-Platform/dcp-agent` | `DCP-SA/dcp-agent` | not aligned | Detached local checkout at `faf4cf9`; `origin/main` is `cfb8f29` and 13 commits ahead. A local gateway process is running from this checkout, so do not mutate blindly. |
| `/Users/pp/DC1-Platform/dcp-contracts` | `DCP-SA/dcp-contracts` | aligned | Cloned during this audit at `194fbb1`. |
| `/Users/pp/DC1-Platform/dcp-mcp` | `dhnpmp-tech/dcp-mcp` | aligned | Cloned during this audit at `b9d485a`. |
| `/Users/pp/DC1-Platform/dc1-platform-internal` | `dhnpmp-tech/dc1-platform-internal` | aligned | Cloned during this audit at `96176e7`. Private/internal docs. |
| `/Users/pp/DC1-Platform/GPUScreener` | `dhnpmp-tech/dcpgpuscreen` | aligned | `main` at `00e0d96`. |

Legacy/side local paths:

- `/Users/pp/Desktop/DC1` is an old `dhnpmp-tech/dc1-platform` clone. It is not
  the active working tree and was slow/hanging on `git status`/`git log`.
- `/Users/pp/Desktop/DC1-repo` is another old `dhnpmp-tech/dc1-platform` clone,
  aligned with its own remote at `91f5c06`.
- `/Users/pp/DC1-Platform/dcp-v2-cutover-safety` and
  `/Users/pp/DC1-Platform/strategy-internal` are local non-git snapshots/docs,
  not current deployment sources.

## GitHub Repository Inventory

| Repo | URL | Default | Visibility | Last pushed |
|---|---|---|---|---|
| `dhnpmp-tech/dcp-platform` | `https://github.com/dhnpmp-tech/dcp-platform` | `main` | public | 2026-07-07 |
| `DCP-SA/dcp-desktop` | `https://github.com/DCP-SA/dcp-desktop` | `main` | public | 2026-07-03 |
| `DCP-SA/dcp-agent` | `https://github.com/DCP-SA/dcp-agent` | `main` | public | 2026-05-30 |
| `DCP-SA/dcp-contracts` | `https://github.com/DCP-SA/dcp-contracts` | `main` | public | 2026-05-30 |
| `dhnpmp-tech/dcp-mcp` | `https://github.com/dhnpmp-tech/dcp-mcp` | `main` | public | 2026-06-19 |
| `dhnpmp-tech/dcpgpuscreen` | `https://github.com/dhnpmp-tech/dcpgpuscreen` | `main` | private | 2026-05-20 |
| `dhnpmp-tech/dc1-platform-internal` | `https://github.com/dhnpmp-tech/dc1-platform-internal` | `main` | private | 2026-04-26 |

Open PRs observed:

- `dhnpmp-tech/dcp-platform`: PR #676
  (`frontend/redesign-wip-2026-06-30`) remains open.
- `DCP-SA/dcp-agent`: Dependabot workflow bump PRs #2, #4, #20, #21, #22.
- No open PRs found in `DCP-SA/dcp-desktop`, `DCP-SA/dcp-contracts`,
  `dhnpmp-tech/dcp-mcp`, `dhnpmp-tech/dcpgpuscreen`, or
  `dhnpmp-tech/dc1-platform-internal`.

## Production Mapping

### VPS2 Backend

- Hostname: `srv1328172`
- Backend repo: `/root/dc1-platform`
- Branch: `security/staged-rollouts`
- Commit: `237b77949a64`
- PM2 process: `dc1-provider-onboarding`
- Nginx: `api.dcp.sa` proxies to `http://127.0.0.1:8083`

Health observed:

- `https://api.dcp.sa/api/health`: HTTP 200
- `/api/health` provider snapshot: 21 total providers, 13 online/heartbeating,
  2 endpoint-reachable, 2 serving.
- `/v1/models`: HTTP 200, 33 models.

VPS DCP-related cron observed:

- `ops/e2e-smoke.sh` every 30 minutes.
- `ops/morning-digest.sh` daily.
- `ops/dcp-deploy-watch.sh` every 3 minutes.
- `/usr/local/bin/dcp-low-balance-watch.sh` hourly at minute 17.
- Provider serving and VRAM parking watches every 10 minutes.
- Burst pod reap every 5 minutes and stock refresh every 4 minutes.

### Vercel Frontend

- Domain: `https://dcp.sa`
- Deployment: `dc1-platform-mm9e1mhy6-dc11.vercel.app`
- Status: Ready
- Created: 2026-07-07 13:26:22 +04
- Aliases include `dcp.sa`, `www.dcp.sa`, `dc1-platform.vercel.app`.
- Public HTML returned HTTP 200 and title
  `DCP - Rent GPUs On Demand (H100, A100, RTX 4090) + OpenAI-Compatible Inference API - Saudi Arabia`.

## Findings

### P0/P1 - Reconcile before using `dcp-agent`

Local `dcp-agent` is detached at `faf4cf9` while `origin/main` is `cfb8f29`.
The remote includes the Phase 0 daemon-sole-runtime fix. A long-running local
gateway process is currently executing from the stale checkout.

Recommended next action:

1. Stop or checkpoint the local gateway intentionally.
2. Preserve the current detached state with a named branch/tag if needed.
3. Fast-forward/switch local `dcp-agent` to `origin/main`.
4. Rebuild/reinstall the local venv if required.
5. Restart the gateway and verify Telegram/agent behavior.

### P1 - Low-balance watcher drift and secret hygiene

VPS `/usr/local/bin/dcp-low-balance-watch.sh` had drifted from the Git-tracked
`ops/dcp-low-balance-watch.sh` and contained inline runtime Telegram values.
The tracked script has now been changed to load runtime secrets from
`/root/dc1-platform/backend/.env` so the deployed `/usr/local/bin` copy can be
made identical without breaking cron.

Current configured threshold:

- `LOW_BALANCE_HALALA=1000` by default, i.e. 10 SAR.
- Alerts dedupe at most once per renter per UTC day.
- Alerts target the DCP Nexus Group Alerts topic by default.

Recommended next action:

- Deploy the tracked script to `/usr/local/bin/dcp-low-balance-watch.sh`, verify
  `bash -n`, run once manually, and confirm no secrets remain inline in the file.

### P1 - Dependency advisories still open

`npm audit --omit=dev --audit-level=high` currently reports:

- Root app: 1 high and 3 moderate prod advisories (`ws`, `next-intl`/`next`/`postcss` chain).
- Backend: 3 high and 5 moderate prod advisories (`@grpc/grpc-js`, `protobufjs`,
  `ws`, plus `express`/`qs`/`dockerode`/`uuid` chain).

This matches the broader H9 security work already tracked in
`docs/security/STATUS.md` and the blue-green dependency runbook, but it is still
open as of this audit.

### P1 - Public research/docs contain credential-shaped material

The repo still contains at least one public research/doc example with embedded
basic-auth-shaped credentials. Do not reproduce the credential in reports or
chat. This should be scrubbed with the security docs/history process rather than
left as a normal example.

Recommended next action:

- Add a focused secret-scan/scrub PR for current tree docs.
- Decide separately whether history scrub/rotation is required.

### P1 - Docker worker image CI is failing

Recent GitHub Actions runs on `main` showed:

- `Build & Publish Instant-Tier Worker Images`: failure on 2026-07-07.
- `Build & Push DCP Docker Worker Images`: failure on 2026-07-07.

Frontend build, secret scan, and uptime monitor were green on `237b779`.

### P2 - Main platform repo has local untracked files

The active platform repo has untracked:

- `.verify/home-1440.png`
- `ops/dcp-deploy-watch.sh`

`ops/dcp-deploy-watch.sh` is already installed on VPS cron and should be either
promoted in Git, intentionally ignored, or archived. Leaving it ambiguous weakens
the local/GitHub/VPS parity rule.

### P2 - Contract repo exists but consumers need version discipline

`DCP-SA/dcp-contracts` is now cloned locally and should remain the source of
truth for shared shapes. Future API changes affecting platform/agent/desktop
should use the contracts train rather than local duplicate edits.

## Immediate Improvement Backlog

1. Reconcile and restart local `dcp-agent` safely.
2. Deploy the cleaned low-balance watcher to VPS `/usr/local/bin` and verify
   the hourly cron still alerts without inline credentials.
3. Triage/fix Docker worker image CI failures.
4. Run the H9 dependency maintenance window or narrow security PRs for the
   current high advisories.
5. Scrub credential-shaped public docs/current tree examples.
6. Decide whether `ops/dcp-deploy-watch.sh` should be committed, ignored, or
   retired.
7. Close or rebase stale PR #676 so frontend work is not confused by an old WIP.
8. Convert Tareq's strategic backlog into small PRs:
   - per-model pricing tiers
   - prompt-cache discount
   - batch inference pricing
   - auto HF/GGUF model pull
   - GCC startup credits
   - case studies
   - multi-model routing
   - streaming support
   - multimodal fixes

## Operating Rule Going Forward

Before any DCP work:

1. Confirm the intended repo path.
2. `git fetch --all --prune`.
3. Confirm local HEAD equals GitHub for the intended branch.
4. If backend/runtime work, confirm VPS commit and health.
5. Update root and docs changelogs with PR number, date, timestamp, behavior,
   verification, and deploy state.
