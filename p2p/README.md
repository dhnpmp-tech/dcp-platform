# DCP P2P Provider Discovery — Phase C Prototype

> **Status**: Research prototype (Phase C). Not yet integrated into production.
> Production integration is planned for Phase D.

## Overview

DCP currently uses a centralised SQLite registry on the VPS at `api.dcp.sa`.
Providers register once and renters query `/api/providers/available` — a single
point of failure that also requires the VPS to be online for any GPU discovery
to work.

This module replaces that registry with a **Kademlia DHT** built on
[libp2p](https://libp2p.io). Providers write their GPU compute spec to the DHT;
renters walk the DHT to discover providers without touching the VPS.

```
Current (Phase A/B)                Phase C/D target
────────────────────────────       ──────────────────────────────────
Provider daemon                    Provider daemon
  └─ POST /api/providers/heartbeat   └─ node p2p/provider-announce.js
       │                                   │
       ▼                                   ▼
VPS SQLite DB ◄──── single point    Kademlia DHT (distributed)
       │            of failure            │
       ▼                                  ▼ (any node in DHT)
GET /api/providers/available        Renter queries DHT
       │                                   │
       ▼                                   ▼
Renter selects GPU                 Renter selects GPU
```

## Architecture

### Stack

| Layer | Package | Note |
|---|---|---|
| Transport | `@libp2p/tcp` + `@libp2p/websockets` (optional hook) | TCP for provider/VPS nodes; WebSocket hook for browser-friendly renters |
| Encryption | `@libp2p/noise` | Noise XX handshake — libp2p standard |
| Muxer | `@libp2p/yamux` | Stream multiplexer |
| Discovery | `@libp2p/kad-dht` | Kademlia DHT, scoped to `/dc1/kad/1.0.0` |
| Bootstrap | `@libp2p/bootstrap` | Initial seed peer (VPS) for network entry |
| Local Discovery | `@libp2p/mdns` (optional hook) | LAN peer discovery for provider clusters |
| NAT Traversal | `@libp2p/circuit-relay-v2` (optional hook) | Circuit Relay v2 support for NATed providers |
| Broadcast | `@chainsafe/libp2p-gossipsub` (optional hook) | Network-wide provider availability gossip |

### DHT key schema

```
/dc1/provider/{peerId}  →  JSON GPU spec
```

Example record:

```json
{
  "gpu": "RTX 4090",
  "vram_gb": 24,
  "price_sar_per_hour": 45,
  "cuda_version": "12.3",
  "driver_version": "545.23.08",
  "location": "Riyadh, SA",
  "peer_id": "12D3KooW...",
  "announced_at": "2026-03-18T21:00:00.000Z",
  "addrs": ["/ip4/203.0.113.42/tcp/4001"]
}
```

### Scoped DHT

The DHT uses protocol `/dc1/kad/1.0.0` — **it never touches the public IPFS DHT**.
DCP provider data stays within the DCP network.

## Files

| File | Role |
|---|---|
| `dc1-node.js` | Core libp2p node factory + DHT helper functions |
| `dcp-discovery-scaffold.js` | Modern discovery API with CID-based compute environments |
| `bootstrap.js` | Stable routing-only node to run on VPS (PM2) |
| `provider-announce.js` | CLI tool called by `dcp_daemon.py` to write spec to DHT |
| `heartbeat-protocol.js` | Node liveness tracking via periodic heartbeat announcements |
| `demo.js` | Self-contained two-node demo — no VPS needed |
| `test-heartbeat.js` | Heartbeat protocol unit tests |
| `NAT-TRAVERSAL.md` | Circuit Relay v2, NAT hole-punching, and heartbeat integration guide |
| `package.json` | Isolated package (`"type": "module"`) |

## Heartbeat Protocol

Providers emit periodic heartbeats (every 30 seconds) to track node liveness and health:

```javascript
import { createHeartbeatEmitter } from './heartbeat-protocol.js'

const emitter = createHeartbeatEmitter(node, peerId, {
  getMetrics: async () => ({
    cpu_utilization: 45,
    memory_utilization: 60,
    gpu_utilization: 80,
  }),
  getStatus: () => 'healthy', // or 'degraded', 'warning'
  intervalMs: 30000,
})
```

Renters monitor provider health:

```javascript
import { resolveHeartbeats, summarizeHeartbeatHealth } from './heartbeat-protocol.js'

const results = await resolveHeartbeats(node, providerPeerIds)
const health = summarizeHeartbeatHealth(results)
// { healthy: [...], degraded: [...], offline: [...], total: N }
```

For detailed NAT traversal and production deployment guidance, see [NAT-TRAVERSAL.md](./NAT-TRAVERSAL.md).

## Quick start

```bash
cd p2p

# Run heartbeat protocol tests (all pass locally)
npm test

# Run the discovery demo (no VPS needed):
npm run demo

# Run CID publish+discover flow:
npm run demo:cid

# Deterministic smoke validation (non-zero exit on failure):
npm run smoke:cid
```

`p2p` dependencies are provisioned by the board operator during controlled deploys.
Do not run package installation commands directly in the Paperclip container.

## Python Job Routing Prototype (Phase C)

The Python layer adds **job routing** on top of the discovery layer:
providers form a mesh, renters broadcast job requests, providers bid, and
the renter picks the cheapest bid.  The central VPS API is **not** involved
in job data transfer — only in billing (Phase D).

### Message flow

```
Renter                Bootstrap              Provider 1        Provider 2
  │                       │                      │                 │
  │── PEER_HELLO ─────────▶│                      │                 │
  │◀─ PEER_LIST ───────────│                      │                 │
  │                        │◀── ANNOUNCE_CAPACITY─┤                 │
  │◀── ANNOUNCE_CAPACITY ──│◀── ANNOUNCE_CAPACITY─┼─────────────────┤
  │── JOB_REQUEST ─────────▶── broadcast ─────────▶─────────────────▶
  │◀─ JOB_BID (20 SAR/hr)──│◀──────────────────────┤                 │
  │◀─ JOB_BID (35 SAR/hr)──│◀────────────────────────────────────────┤
  │── JOB_ACCEPT ──────────▶──────────────────────▶                  │
  │                         │                      │ (executes job)   │
  │◀─────────────── JOB_RESULT (direct P2P) ───────┤                 │
```

Provider 1 wins because it bids lower (20 SAR/hr < 35 SAR/hr).

### 3-node Docker Compose test

```bash
cd p2p
docker compose up --build
```

Expected result: renter log shows `>>> Winning bid: ... GPU=RTX 3090  2000 h/hr`
then `JOB COMPLETE  Success: True`.

### Running without Docker

```bash
cd p2p
pip install websockets

# Terminal 1 — bootstrap
python3 bootstrap_server.py

# Terminal 2 — provider 1 (cheaper)
DCP_P2P_BOOTSTRAP=ws://127.0.0.1:8765 \
  python3 provider_node.py --gpu "RTX 3090" --vram 24 --price 20.0

# Terminal 3 — provider 2 (more expensive)
DCP_P2P_BOOTSTRAP=ws://127.0.0.1:8765 \
  python3 provider_node.py --gpu "RTX 4090" --vram 24 --price 35.0

# Terminal 4 — renter
DCP_P2P_BOOTSTRAP=ws://127.0.0.1:8765 \
  python3 renter_client.py --image dcp/simulate --max-price 25.0
```

### Environment variables (Python layer)

| Variable | Default | Description |
|---|---|---|
| `DCP_P2P_BOOTSTRAP` (`DC1_P2P_BOOTSTRAP` fallback) | `ws://127.0.0.1:8765` | Bootstrap WS address (comma-separated for multiple) |
| `DCP_P2P_BOOTSTRAP_PORT` (`DC1_P2P_BOOTSTRAP_PORT` fallback) | `8765` | Bootstrap listen port |
| `DC1_P2P_HOST` | auto-detect | Provider's externally reachable hostname |
| `DCP_P2P_PORT` (`DC1_P2P_PORT` fallback) | `8766` | Provider's direct P2P WebSocket port |
| `DC1_RENTER_HOST` | `127.0.0.1` | Renter's externally reachable hostname |
| `DC1_RENTER_PORT` | `8767` | Renter's result WebSocket port |
| `DC1_BID_WINDOW_SECS` | `5` | Seconds renter waits to collect bids |
| `DC1_JOB_TIMEOUT_SECS` | `300` | Max job execution time (seconds) |

## VPS Setup (Phase D prerequisite)

Run the bootstrap node on the VPS alongside the Express API:

```bash
# On VPS
cd /opt/dc1/p2p
pm2 start bootstrap.js --name dc1-p2p-bootstrap
pm2 save
```

Copy the printed multiaddr (e.g. `/ip4/api.dcp.sa/tcp/4001/p2p/12D3KooW...`)
and set it as an environment variable on all provider machines:

```bash
export DCP_P2P_BOOTSTRAP=/ip4/api.dcp.sa/tcp/4001/p2p/12D3KooW...
```

Also update `DEFAULT_BOOTSTRAP_ADDR` in `dc1-node.js`.

## Integrating with dcp_daemon.py

After the provider daemon's 30-second heartbeat, call `provider-announce.js`
as a fire-and-forget subprocess:

**Option A — subprocess (simplest):**

```python
import subprocess, json

spec = {
    "gpu": gpu_name,
    "vram_gb": vram_gb,
    "price_sar_per_hour": price_sar
}

subprocess.Popen(
    ["node", "p2p/provider-announce.js", "--spec", json.dumps(spec)],
    cwd="/opt/dc1"
)
```

**Option B — HTTP IPC (Phase D):**

```python
import aiohttp, json

async def announce_p2p(spec):
    async with aiohttp.ClientSession() as s:
        await s.post(
            "http://localhost:8083/api/p2p/announce",
            json={"spec": spec}
        )
```

Backend route `/api/p2p/announce` (to be built in Phase D) calls the libp2p
node internally via IPC and keeps a single persistent libp2p node per VPS
process — more efficient than spawning per heartbeat.

## DCP-440 Migration Spike (Phase A/B focus)

This sprint adds a **repo-contained scaffold** for migration without breaking
today's centralized flows.

### New files

- `dcp-discovery-scaffold.js`
  - CID-based provider environment records in DHT
  - Namespace aligned to Ocean-style pattern:
    - `/dcp/nodes/1.0.0/kad/1.0.0/providers/{peerId}`
    - `/dcp/nodes/1.0.0/kad/1.0.0/environments/{cid}`
  - Reliability hardening:
    - TTL-backed envelopes (`expires_at`) to detect stale records
    - schema validation on provider/env records before returning data
    - resolver fallback hooks (`fallbackResolver`) when DHT data is missing/invalid/stale
  - Optional module hooks (auto-degrade when package missing):
    - mDNS discovery (`@libp2p/mdns`)
    - WebSocket transport (`@libp2p/websockets`)
    - Circuit Relay v2 (`@libp2p/circuit-relay-v2`)
    - GossipSub broadcasts (`@chainsafe/libp2p-gossipsub`)
- `demo-cid-discovery.js`
  - Provider announces compute environment as CID-backed DHT record
  - Renter resolves by peer ID and by CID

Run the new demo:

```bash
cd p2p
npm run demo:cid
```

## Shadow-mode reliability cycle (DCP-537)

To validate readiness before switching renter/provider discovery to `p2p-primary`,
backend now exposes:

```bash
GET /api/p2p/shadow-cycle
```

This endpoint compares online SQLite providers (`p2p_peer_id` set) against DHT
resolution results and returns a deterministic decision:

- `promote-to-p2p-primary`
- `hold-shadow`
- `fallback-to-sqlite`

Default rollout thresholds:

| Metric | Promote threshold | Fallback threshold |
|---|---:|---:|
| Coverage (`discovered / tracked`) | `>= 95%` | `< 80%` |
| Stale ratio (`stale / discovered`) | `<= 5%` | `> 20%` |
| Lookup latency | `<= 3000 ms` | `> 8000 ms` |
| Missing peers count | `<= 2` | (covered by coverage threshold) |

All values are configurable via environment variables:

- `P2P_SHADOW_MIN_COVERAGE_PCT`
- `P2P_SHADOW_MAX_STALE_PCT`
- `P2P_SHADOW_MAX_MISSING_PEERS`
- `P2P_SHADOW_MAX_LOOKUP_LATENCY_MS`
- `P2P_SHADOW_FALLBACK_MIN_COVERAGE_PCT`
- `P2P_SHADOW_FALLBACK_MAX_STALE_PCT`
- `P2P_SHADOW_FALLBACK_MAX_LOOKUP_LATENCY_MS`

In `shadow` read mode, renter discovery response (`GET /api/renters/available-providers`)
also includes `discovery_health.shadow_cycle` so the board can monitor drift without
changing production listing behavior.

### Backend integration path

1. Keep existing `/api/providers/available` from SQLite as **primary** output.
2. Add a read-only shadow route: `GET /api/p2p/providers` that resolves DHT
   provider records and returns the same shape as `/api/providers/available`.
3. Add a lightweight `POST /api/p2p/announce` route called from daemon heartbeat
   to forward provider env payloads into `announceProviderEnvironment`.
4. Add feature flag `P2P_DISCOVERY_READ_PATH` with rollout:
   - `sqlite` (default): current behavior
   - `shadow`: return SQLite response + include P2P diagnostics in logs
   - `p2p-primary`: use DHT records with SQLite fallback resolver
5. Add periodic health probe endpoint (`GET /api/p2p/health`) that checks:
   - bootstrap reachability
   - DHT put/get loopback probe
   - gossip subscription state (if enabled)
3. Add a dual-write path from heartbeat:
   - existing SQLite heartbeat updates (unchanged)
   - P2P announce using `announceProviderEnvironment(...)`
4. Compare both data sources in admin (`/api/admin/daemon-health`) until drift
   stays below agreed threshold.
5. Flip renter discovery to prefer P2P data when confidence is high.

### What can be demoed tonight

- Local two-node CID discovery (`npm run demo:cid`)
- DHT key layout aligned with decentralized roadmap
- Provider envelope + environment envelope separation
- Stale-provider filtering via `expires_at` + max-age fallback
- Graceful fallback path when DHT data is unavailable or malformed
- Backward-compatible migration path (no breaking API cutover)

### What remains after tonight

- Install optional P2P modules in production image
- Persistent peer identity key on bootstrap node
- Production bootstrap/relay topology (multi-region)
- Centralized fallback implementation for `fallbackResolver` (e.g. `/api/providers/available`)
- Provider daemon wiring to call scaffold from live heartbeat path
- API route for renter-side peer discovery and feature-flagged cutover
- Security hardening (record signatures, peer trust policy, spam controls)
- Availability indexing strategy for listing all providers efficiently

## Phase Roadmap

### Phase A/B (current) — Centralised
- Providers → VPS SQLite
- Renters → `/api/providers/available`
- VPS is required for all discovery

### Phase C (this prototype) — DHT research + P2P job routing

**Provider discovery (JavaScript / libp2p Kademlia DHT):**
- ✅ `dc1-node.js` — core libp2p node factory
- ✅ `bootstrap.js` — VPS routing node
- ✅ `provider-announce.js` — daemon integration hook
- ✅ `demo.js` — working end-to-end discovery demo
- ❌ Not yet integrated into daemon or backend

**Job routing (Python / WebSocket mesh):**
- ✅ `config.py` — network config, env overrides, `MsgType` constants
- ✅ `bootstrap_server.py` — relay/rendezvous server (Circuit Relay pattern)
- ✅ `provider_node.py` — announces GPU capacity, bids on jobs, executes & delivers results P2P
- ✅ `renter_client.py` — discovers providers, broadcasts job, selects lowest bid, receives result
- ✅ `proto/dc1.proto` — canonical Protobuf schema for all wire messages
- ✅ `docker-compose.yml` — 3-node local test (bootstrap + 2 providers + renter)
- ✅ `Dockerfile` + `requirements.txt` — Python 3.11-slim, `websockets>=12.0`

### Phase D — DHT in production
- [ ] Run `bootstrap.js` on VPS under PM2
- [ ] Integrate `provider-announce.js` call into `dcp_daemon.py`
- [ ] Add WebSocket transport for browser renters
- [ ] Add GossipSub for real-time provider availability broadcasts
- [ ] Add Circuit Relay for providers behind NAT
- [ ] Build prefix-scan (`/dc1/provider/*`) via DHT Provider Records or a
      dedicated rendezvous point so renters can list *all* providers
- [ ] Persist bootstrap peer ID across VPS restarts (stable multiaddr)
- [ ] Replicate provider records to multiple VPS bootstrap nodes (HA)
- [ ] Backend `/api/p2p/announce` route (Option B daemon integration)

### Phase E — Full decentralisation
- VPS becomes optional — discovery works peer-to-peer
- Job matching and payment escrow moved to smart contracts (TBD)

## Design Decisions

### Why Kademlia DHT?
Ocean Protocol uses the same pattern (`/ocean/nodes/1.0.0/kad/1.0.0`) for
decentralised data asset discovery. It is battle-tested at millions of nodes
and well supported by libp2p.

### Why not just use IPFS?
DCP provider data is ephemeral (expires when a provider goes offline) and
financially sensitive. A scoped private DHT keeps DCP data off the public IPFS
network and allows us to enforce access control in later phases.

### Why TCP for now?
Providers run server-grade Linux machines with static IPs — TCP is appropriate.
WebSocket transport is added in Phase D so browser-based renter dashboards can
perform DHT discovery directly without proxying through the VPS.

### kBucketSize = 2
The prototype uses `kBucketSize: 2` (normally 20) to reduce memory overhead
during local testing with < 5 nodes. **Set back to 20 for production.**

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DCP_P2P_BOOTSTRAP` (`DC1_P2P_BOOTSTRAP` fallback) | (placeholder) | Full multiaddr of bootstrap node |
| `DCP_P2P_BOOTSTRAP_PORT` (`DC1_P2P_BOOTSTRAP_PORT` fallback) | `4001` | Bootstrap node TCP port |
| `DCP_P2P_PORT` (`DC1_P2P_PORT` fallback) | `0` (random) | Provider node TCP port |
| `DCP_P2P_TIMEOUT_MS` (`DC1_P2P_TIMEOUT_MS` fallback) | `15000` | Max ms for DHT put in provider-announce.js |
