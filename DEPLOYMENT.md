# DCP Deployment

This document describes the public deployment shape for the DCP platform.

## Environments

| Surface | Runtime | Notes |
| --- | --- | --- |
| Web app | Vercel | Next.js application served at `https://dcp.sa`. |
| Backend API | VPS / PM2 | Express backend behind nginx at `https://api.dcp.sa`. |
| Static assets | Vercel / backend public assets | Logo, docs assets, provider installer entry points. |
| CI | GitHub Actions | Build, tests, template validation, secret scanning, deployment gates. |

## Frontend

```bash
npm install
npm run build
npm start
```

Required deployment variables depend on the enabled integrations. At minimum, configure API origin values and any public client keys used by the app.

## Backend

```bash
cd backend
npm install
node src/server.js
```

Production deployments use PM2 and environment variables supplied by the host. Do not commit `.env` files or production secrets.

Common backend variables:

| Variable | Purpose |
| --- | --- |
| `DC1_ADMIN_TOKEN` | Admin API token, retained for compatibility with existing backend code. |
| `DC1_HMAC_SECRET` | HMAC secret for signed daemon/job messages. |
| `BACKEND_URL` | Public backend URL used in generated installer commands. |
| `FRONTEND_URL` | Public web app URL used by payment callbacks. |
| `MOYASAR_SECRET_KEY` | Moyasar server key for payment operations. |
| `MOYASAR_WEBHOOK_SECRET` | Moyasar webhook signature secret. |
| `ESCROW_CONTRACT_ADDRESS` | Optional escrow contract address. |
| `BASE_RPC_URL` | Optional Base RPC URL for escrow operations. |

## Mission Control Dispatcher

A separate pm2 process (`dc1-mission-dispatcher`) runs the agent-orchestration
janitor loop: expired-lease resets, escalations, the morning digest, assignment
pings, and provider-repair task creation. It talks to the backend exclusively
over HTTP with a `dispatcher`-scoped mission key — it holds no DB access and no
admin token. See `docs/orchestration/AGENT_PROTOCOL.md` for the agent protocol
and `docs/superpowers/specs/2026-07-24-mission-control-orchestration-design.md`
for the design.

```bash
# one-time: seed the agent roster and issue keys (prints each key ONCE)
cd backend && node scripts/mission-seed-agents.js --issue-keys

# start (dry-run by default — logs planned actions, executes nothing)
pm2 start backend/ecosystem.dispatcher.config.js

# after reviewing one day of logs:
DISPATCHER_DRY_RUN=0 pm2 restart dc1-mission-dispatcher --update-env
```

| Variable | Purpose |
| --- | --- |
| `MISSION_BASE_URL` | Backend API base (default `http://127.0.0.1:8083`). |
| `MISSION_DISPATCHER_KEY` | REQUIRED — dispatcher-scoped mission agent key. |
| `DISPATCHER_DRY_RUN` | `1` (default) logs actions without executing; `0` goes live. |
| `DISPATCHER_STATE_FILE` | Dedup ledger + cursor JSON (default `backend/data/`). |
| `DISPATCH_INTERVAL_MS` | Tick interval, default 300000 (5 min). |
| `DCP_TG_BOT_TOKEN` / `DCP_TG_CHAT_ID` | Telegram bridge (write-only); unset = notifications disabled. |
| `DCP_TG_TOPIC_TEAM` / `DCP_TG_TOPIC_ALERTS` | Forum topic ids (defaults 7 / 4). |

## Deployment Checks

Before promoting a change:

```bash
npm run build
npm --prefix backend run templates:validate
```

For backend changes, run the focused Jest suite that covers the touched service or route. For frontend workflow changes, run the relevant Playwright flow.

## Security

- Keep real secrets in the deployment secret store only.
- Do not commit local databases, PM2 logs, generated reports, or operator runbooks.
- Run secret scanning before merging sensitive changes.

See [SECURITY.md](SECURITY.md) for disclosure and security policy.
