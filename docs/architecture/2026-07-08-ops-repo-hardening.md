# Ops Repo Hardening - 2026-07-08

**Timestamp:** 2026-07-08 04:14 UTC / 2026-07-08 08:14 +04
**Slice:** Fireworks/Tinker execution order item 1 - ops cleanup and repo parity.
**Production target:** VPS2 `root@76.13.179.86:/root/dc1-platform`, branch `security/staged-rollouts`.

## Current platform parity

At the start of this slice the platform repo was aligned across all three product surfaces:

| Surface | State |
| --- | --- |
| Local checkout | `main` at `7e90559ead65` |
| GitHub `origin/main` | `7e90559ead65` |
| GitHub `origin/security/staged-rollouts` | `7e90559ead65` |
| VPS2 `/root/dc1-platform` | `7e90559ead65` |

Local untracked items observed:

- `.verify/home-1440.png` - generated screenshot artifact, left untouched.
- `ops/dcp-deploy-watch.sh` - live production watcher, byte-identical to the VPS copy, now promoted into Git.

## Deploy watcher reconciliation

`ops/dcp-deploy-watch.sh` was already live on VPS2 and cron pointed directly at the repo copy:

```text
*/3 * * * * /root/dc1-platform/ops/dcp-deploy-watch.sh >> /var/log/dcp-deploy-watch.log 2>&1
```

The local untracked copy and the VPS copy were byte-identical. The script watches:

- latest Vercel production deployment state for `dcp.sa`;
- stuck Vercel builds older than 10 minutes;
- backend `https://api.dcp.sa/api/health` with a two-poll failure threshold;
- edge-triggered Telegram alert and recovery messages to the Alerts topic.

Secrets are intentionally not stored in Git. The script loads them from `/root/dc1-platform/ops/.watchdog-env` and only requires environment variable names in the tracked source.

## dcp-agent drift finding

The separate local repo `/Users/pp/DC1-Platform/dcp-agent` is not currently aligned with its GitHub remotes:

| Item | Observed state |
| --- | --- |
| Local process | PID `1731`, started 2026-06-03, running `/Users/pp/DC1-Platform/dcp-agent/.venv/bin/python -m hermes_cli.main gateway run --replace` |
| Local checkout | detached `HEAD` at `faf4cf9ff` |
| Local `main` | `bf0805fe86a0`, behind remote |
| `DCP-SA/dcp-agent` `main` | `cfb8f29143fc` |
| `dhnpmp-tech/dcp-agent` `main` | `cfb8f29143fc` |

Do not blindly `git pull` that checkout while the gateway is running from it. The safe order is:

1. Announce a short maintenance window for the local gateway.
2. Capture current gateway environment and command line.
3. Stop the gateway process cleanly.
4. Switch `/Users/pp/DC1-Platform/dcp-agent` to `main`.
5. Fast-forward to `cfb8f29143fc`.
6. Reinstall or refresh the virtualenv if package metadata changed.
7. Restart the gateway with the captured command.
8. Verify the gateway can reach the platform and send a heartbeat.
9. Only then rebuild any served installer/archive if the platform release needs the new agent payload.

This dcp-agent reconciliation is intentionally documented here instead of performed as a side effect of a platform-docs PR, because it touches a live local gateway process outside the platform repo.

## Follow-up order

1. Keep `ops/dcp-deploy-watch.sh` tracked and deployed with the platform repo.
2. Add the deploy watcher to any future production bootstrap/runbook so a fresh VPS restore includes it.
3. Reconcile the local `dcp-agent` checkout in a controlled gateway window.
4. Continue the Fireworks/Tinker execution order with inference metadata and rate consistency.
