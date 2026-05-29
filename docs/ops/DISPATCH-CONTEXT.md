# DCP Dispatch Context — for remote Claude Code agents

> ⚠️ **This file must never contain live secrets.** It previously held a
> production admin token, a renter API key, and a Telegram bot token in
> plaintext on a public repository. Those credentials are now considered
> **compromised and must be rotated.** Reference secrets by environment-variable
> name only; fetch real values from the VPS environment or a secure channel.

## Hosts

- **Frontend:** https://dcp.sa (Vercel)
- **API:** https://api.dcp.sa (Express + better-sqlite3, PM2 on the VPS)
- **VPS:** set via the deploy environment — do not hardcode the IP here.
- **DB:** SQLite at `backend/data/providers.db` (WAL mode) on the VPS.

## Auth (names only — never values)

| Purpose | Where it lives | How to send |
|---|---|---|
| Admin endpoints | `DC1_ADMIN_TOKEN` (VPS PM2 env) | `x-admin-token: $DC1_ADMIN_TOKEN` header |
| Renter API calls | a renter key from the dashboard | `Authorization: Bearer <renter-key>` |
| Provider daemon HMAC | `DC1_HMAC_SECRET` (VPS PM2 env) | signed per the daemon protocol |
| Ops Telegram bot | `TG_DEV_BOT_TOKEN` + `TG_ALERT_CHAT_ID` (env / GH secrets) | Bot API |

## Example (uses env vars, no literals)

```bash
# Admin fleet health — token comes from the environment, never inline
curl -sS https://api.dcp.sa/api/admin/fleet-health \
  -H "x-admin-token: ${DC1_ADMIN_TOKEN:?set DC1_ADMIN_TOKEN in your shell first}"

# Public health (no auth)
curl -sS https://api.dcp.sa/api/health
```

## If you need a real credential

Pull it from the VPS PM2 process env (`pm2 env <id>`) or request it through the
team's secure channel. Do **not** paste live tokens back into this file, commit
messages, code defaults, or chat logs.
