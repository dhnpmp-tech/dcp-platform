# Hermes Agent Liveness + Log Shipping — Hermes-side spec

**Status:** Backend ingest live in PR `feat/hermes-liveness-and-logs`.
Hermes contribution required to actually emit beacons.
**Owner:** dcp-agent / Hermes team. The Hermes source is NOT in this
repo — it lives on the provider node at `~/.dcp/agent/repo/` and is
installed by `backend/installers/dcp-agent.tar.gz`. Treat the snippets
below as a contract, not literal patches.

---

## Why

2026-05-13, Tareq Node 2: `~/.dcp/agent.log` was 134 MB locally. Central
team had zero visibility. If Hermes crashes, nobody knows.

Provider daemon (`backend/installers/dcp_daemon.py`) phones home —
visible. Hermes does not — invisible. This closes that gap with the
same auth and routing pattern the daemon already uses.

## Architecture

Hermes pushes; backend stores. Backend can request a log tail by setting
`wants_logs_at`; Hermes reads that on the next liveness ack and uploads.

```
Hermes ──60s──> POST /api/providers/:id/agent-liveness ──> provider_agent_liveness (upsert)
                            ↓ response.wants_logs_at
Hermes ───────> POST /api/providers/:id/agent-logs ─────> provider_agent_log_snapshots (prune to 50)
```

## Backend routes (already implemented)

| Route | Method | Auth | Body |
|---|---|---|---|
| `/api/providers/:id/agent-liveness` | POST | `Bearer ${DCP_PROVIDER_KEY}` | liveness blob (≤16 KB) |
| `/api/providers/:id/agent-logs` | POST | `Bearer ${DCP_PROVIDER_KEY}` | `{ log_excerpt: "..." }` (≤64 KB) |
| `/api/providers/:id/agent-state` | GET | admin OR provider key | — |

Auth accepts any of: `Authorization: Bearer <key>`, `x-provider-key: <key>`,
or `?key=<key>` — mirrors the diag PR.

## Liveness payload schema

```jsonc
{
  "agent": "hermes",                  // string, ≤32 chars
  "pid": 12345,                       // int
  "uptime_s": 3600,                   // int seconds since gateway start
  "dashboard_port": 4500,             // int, 1..65535, or null
  "gateway_state": "running",         // "running" | "starting" | "degraded" | "stopped"
  "active_agents": 2,                 // int, 0..1000
  "platforms": ["cuda", "cpu"],       // array of strings, ≤20 items, ≤32 chars each
  "last_error_excerpt": "...",        // last error line, ≤2000 chars, redact client-side
  "last_error_at": "2026-05-13T12:00:00.000Z", // ISO8601 or null
  "mem_rss_mb": 412,                  // int
  "log_tail_sha256": "abc123..."      // sha256 of the most recent 64 KB of agent.log
}
```

Response:
```json
{ "ok": true, "wants_logs_at": null | "2026-05-13T12:34:56Z" }
```

If `wants_logs_at` is non-null, Hermes should POST the log tail to
`/agent-logs` and then continue normal beaconing. Backend clears
`wants_logs_at` on successful upload.

## Hermes-side implementation contract

### Lifecycle hook

Attach to the gateway's existing async loop. In Hermes today
(`~/.dcp/agent/repo/hermes/gateway.py` per the install layout) the right
injection point is alongside the existing health monitor, NOT inside
the request handler path. Liveness must never block inference.

```python
# ~/.dcp/agent/repo/hermes/observability/dcp_beacon.py  (NEW)
"""DCP central-platform liveness beacon. Closes Tareq Node 2 gap."""
from __future__ import annotations

import asyncio
import hashlib
import os
import time
from pathlib import Path
from typing import Optional

import httpx

DCP_API_BASE = os.environ.get("DCP_API_BASE", "https://api.dcp.sa")
DCP_PROVIDER_ID = os.environ.get("DCP_PROVIDER_ID")  # set by installer
DCP_PROVIDER_KEY = os.environ.get("DCP_PROVIDER_KEY")  # set by installer

BEACON_INTERVAL_S = 60
LOG_TAIL_MAX_BYTES = 64 * 1024
AGENT_LOG_PATH = Path.home() / ".dcp" / "agent.log"

# Match backend redaction so we don't ship secrets even if the backend
# rule drifts.
import re
_REDACTIONS = [
    (re.compile(r"(bearer\s+)([A-Za-z0-9._\-]{8,})", re.I), r"\1[REDACTED]"),
    (re.compile(r"(api[_\-]?key[\"'\s:=]+)([^\s\"',]+)", re.I), r"\1[REDACTED]"),
    (re.compile(r"(password[\"'\s:=]+)([^\s\"',]+)", re.I), r"\1[REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}"), "[REDACTED_JWT]"),
    (re.compile(r"\bdcp-provider-[A-Za-z0-9_\-]{6,}"), "dcp-provider-[REDACTED]"),
    (re.compile(r"\bdcp-renter-[A-Za-z0-9_\-]{6,}"), "dcp-renter-[REDACTED]"),
]

def _redact(s: str) -> str:
    for pat, repl in _REDACTIONS:
        s = pat.sub(repl, s)
    return s

def _read_log_tail(max_bytes: int = LOG_TAIL_MAX_BYTES) -> Optional[bytes]:
    try:
        size = AGENT_LOG_PATH.stat().st_size
        with AGENT_LOG_PATH.open("rb") as f:
            f.seek(max(0, size - max_bytes))
            return f.read()
    except FileNotFoundError:
        return None

def _log_tail_sha256() -> Optional[str]:
    data = _read_log_tail()
    return hashlib.sha256(data).hexdigest() if data else None

async def _post(client: httpx.AsyncClient, path: str, body: dict) -> dict:
    r = await client.post(
        f"{DCP_API_BASE}{path}",
        json=body,
        headers={"Authorization": f"Bearer {DCP_PROVIDER_KEY}"},
        timeout=10.0,
    )
    r.raise_for_status()
    return r.json()

async def run_beacon(gateway_state_provider, started_at: float) -> None:
    """Run forever. Never raises; logs and backs off on failure."""
    if not (DCP_PROVIDER_ID and DCP_PROVIDER_KEY):
        return  # not registered, no-op
    backoff = 1.0
    async with httpx.AsyncClient() as client:
        while True:
            try:
                state = gateway_state_provider()  # dict the gateway can produce
                body = {
                    "agent": "hermes",
                    "pid": os.getpid(),
                    "uptime_s": int(time.time() - started_at),
                    "dashboard_port": state.get("dashboard_port"),
                    "gateway_state": state.get("gateway_state", "unknown"),
                    "active_agents": state.get("active_agents", 0),
                    "platforms": state.get("platforms", []),
                    "last_error_excerpt": _redact(state.get("last_error_excerpt", "") or "")[:2000],
                    "last_error_at": state.get("last_error_at"),
                    "mem_rss_mb": state.get("mem_rss_mb"),
                    "log_tail_sha256": _log_tail_sha256(),
                }
                ack = await _post(client, f"/api/providers/{DCP_PROVIDER_ID}/agent-liveness", body)
                backoff = 1.0  # reset on success
                if ack.get("wants_logs_at"):
                    tail = _read_log_tail() or b""
                    excerpt = _redact(tail.decode("utf-8", errors="replace"))
                    await _post(client, f"/api/providers/{DCP_PROVIDER_ID}/agent-logs",
                                {"log_excerpt": excerpt})
            except Exception as e:
                # Never let beacon failure take down the gateway.
                # Real logger goes here; print is placeholder.
                print(f"[dcp-beacon] beacon failure: {type(e).__name__}: {e}", flush=True)
                backoff = min(60.0, max(5.0, backoff * 5))
            await asyncio.sleep(backoff if backoff > 1.0 else BEACON_INTERVAL_S)
```

### Wire into the gateway main

```python
# ~/.dcp/agent/repo/hermes/gateway.py  (excerpt — insertion point ONLY)
# Inside the gateway's async main() / `gateway run`, AFTER the dashboard
# server has started but BEFORE the await loop that serves traffic:

from hermes.observability.dcp_beacon import run_beacon

started_at = time.time()
def _state():
    return {
        "dashboard_port": dashboard.port,
        "gateway_state": "running" if gateway.is_serving else "degraded",
        "active_agents": len(gateway.agent_pool),
        "platforms": list(gateway.platforms),
        "last_error_excerpt": gateway.last_error,
        "last_error_at": gateway.last_error_at,
        "mem_rss_mb": _rss_mb(),
    }
asyncio.create_task(run_beacon(_state, started_at))
```

### Configuration

The installer already writes `~/.hermes/.env` with `DCP_PROVIDER_KEY` —
read it the same way `gateway.py` does today. Add `DCP_API_BASE`
(default `https://api.dcp.sa`) and `DCP_PROVIDER_ID` (numeric, returned
by `/api/providers/register` at install time).

## Watchdog / self-restart — OUT OF SCOPE for this PR

The Hermes systemd unit / launchd plist lives in the `dcp-agent.tar.gz`
install hook, which is a separate repo. Follow-up issue: add
`Restart=on-failure` (systemd) and `KeepAlive=true` (launchd plist) so
Hermes resurrects after crash without operator intervention.

See `~/.claude/projects/-Users-pp-DC1-Platform/memory/infra_wireguard_macos_persistence.md`
for the launchd patterns Peter already approved.

## Aggregate health rollup — DEFERRED

The `/api/providers/:id/diag/summary` endpoint described in
`docs/diag-architecture.md` is not yet implemented. When it lands, fold
`_agentOfflineWarnings(liveness)` from `providers.js` into its rollup:
emit `agent_offline` warning if `updated_at` > 5 min ago, or
`agent_never_reported` if no row exists. Helper is already exported via
`providersRouter.__private` for that purpose.
