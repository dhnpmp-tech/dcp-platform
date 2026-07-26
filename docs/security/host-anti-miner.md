# Host-level anti-miner security system

**Task:** `task_a74c15efb7a0`  
**Status:** design + initial implementation  
**Tier:** critical (runs on provider hosts; can kill processes + quarantine)

## Problem

Node 2 was compromised by a **host-level** crypto miner. Existing defenses:

| Control | Scope | Cadence | Gap |
|---------|-------|---------|-----|
| `mining_guard.scan_and_kill_miners` | renter **pod** containers only | pod hold loop | Host miners invisible |
| `dcp_daemon._startup_miner_sweep` | host process names via `pkill` | **once** at daemon start | No continuous coverage; no persistence hunt; no backend signal |

A miner running as the provider host user (or root), re-launched via cron/systemd, bypasses both.

## Goals

1. Continuous host-level GPU-process monitoring (timer, not just startup).
2. Host process + connection scan reusing mining heuristics.
3. Persistence hunt: crontab, systemd units, shell rc, `/etc/rc.local`.
4. Report `mining_detected` to backend → admin surface + Telegram Alerts.
5. Auto-create Mission Control task on detection.
6. Quarantine provider (`is_paused=1`, status flagged) until human clear.
7. Lightweight binary/driver integrity baseline (nvidia module + guard self-hash).

## Non-goals (this PR)

- Kernel rootkit detection / full EDR.
- Windows host parity (Linux first; Windows uses existing process name list only).
- Automatic driver reinstall.

## Architecture

```
┌──────────────── dcp_daemon (provider host) ─────────────────┐
│  heartbeat_loop (must never block)                           │
│       │                                                      │
│       └── host_miner_guard_thread (daemon=True)              │
│              every HOST_MINER_INTERVAL_S (default 120s)      │
│              hard wall-clock budget (default 20s)            │
│              │                                               │
│              ├── scan_host_gpu_processes()                   │
│              ├── scan_host_processes_and_conns()             │
│              ├── hunt_persistence()                          │
│              ├── optional kill (HOST_MINER_KILL=1 default)   │
│              └── report_event("mining_detected", critical)   │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/providers/daemon-event
                            ▼
┌──────────────── backend ────────────────────────────────────┐
│  INSERT daemon_events                                        │
│  if event_type == mining_detected:                           │
│    - sendAlert → Telegram Alerts topic                       │
│    - quarantine provider (is_paused=1, status=flagged)       │
│    - auto-create mission task (deduped 24h by external_id)   │
│  GET /api/security/events includes mining_detected rows      │
└─────────────────────────────────────────────────────────────┘
```

## Host allowlist (GPU compute)

Only these GPU-using binaries are expected on the **provider host** outside pods:

- `llama-server`, `llama.cpp`, `ollama`, `vllm`, `sglang`, `tgi`
- `python` / `python3` when cmdline clearly training/inference (torch serve, etc.)
- `dcp_daemon`, nvidia tools (`nvidia-smi`, `nv-hostengine`), docker runtime helpers

Anything else with meaningful VRAM (≥100 MiB) or matching miner patterns → flag.

## Safety constraints (critical path)

1. **Never block heartbeat.** Guard runs in a dedicated daemon thread with a hard timeout; exceptions swallowed + logged.
2. **Kill is explicit.** Default ON for confirmed miner patterns / known miner binaries; unknown GPU process → report only first, kill on second consecutive hit (reduces false positives on new engines).
3. **Quarantine is backend-side** so a compromised host cannot silently re-enable itself without API credentials + admin clear.
4. **Security review + Tareq merge required** before rolling daemon to fleet.

## Files

- `docs/security/host-anti-miner.md` — this note
- `backend/installers/mining_guard.py` — host-scope functions
- `backend/installers/dcp_daemon.py` — periodic hook thread
- `backend/src/routes/providers.js` — mining_detected side-effects
- `backend/src/routes/security.js` — surface events in admin feed
- tests: Python detection unit tests + JS route test

## Rollout

1. Merge after security review.
2. Canary on Node 1 / lab provider.
3. Fleet auto-update once canary clean for 24h.
4. Document clear procedure: admin unflag + `is_paused=0` after forensic wipe.

## Open questions

- Should quarantine set `status=suspended` (harder) vs `flagged`+`is_paused` (recoverable)? **This PR uses flagged + is_paused.**
- Integrity baseline storage: local `~/.dcp/integrity.json` only in v1 (no remote attest yet).
