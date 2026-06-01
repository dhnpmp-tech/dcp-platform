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
