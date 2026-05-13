# DCP Provider Self-Diagnostics — `/v1/diag/*` Architecture

**Status:** design draft (no code beyond `/v1/diag/wg` v0.1 + v0.2 DNS extension).
**Author:** generalized from the `feat/wg-diag-readonly` PR pattern.
**Date:** 2026-05-13.

This document defines a long-term, additive diagnostic surface that lives
on every provider daemon. It generalizes the contract the WG diag endpoint
already ships: a mesh-IP-bound HTTP server on the daemon, Bearer-auth via
the daemon's `API_KEY`, paired with a backend proxy that adds caching,
SSRF guards, and a derived `warnings[]` array. A future PR can pick any
single endpoint below and ship it without re-deriving the contract.

The goal is operational: when something breaks on a provider's box,
we want to know *what* without paging the provider. Today every
"WireGuard is up but nothing works" thread on Telegram costs about 90
minutes round-trip with the provider; the WG diag PR already cut that
to ~30 seconds for the AllowedIPs trap. This surface generalizes that.

---

## Existing surface (shipped)

### `/v1/diag/wg` — WireGuard runtime state

- **Probe semantics (daemon):** `wg show <iface> dump`, `wg show <iface>
  allowed-ips`, `ip route show default`, parse `/etc/wireguard/<iface>.conf`
  (read directly or via `sudo -n cat`), `ip link show` for MTU.
  v0.2 adds a UDP/53 DNS probe to the resolver advertised in
  `wg0.conf`'s `DNS=` line.
- **Response shape:**
  `interface`, `mtu`, `listen_port`, `allowed_ips_runtime`,
  `allowed_ips_config`, `default_route_via_wg`, `last_handshake_age_s`,
  `transfer_rx_bytes`, `transfer_tx_bytes`, `public_key`,
  `peer_public_key`, `mesh_ip`, `persistent_keepalive_s`,
  `dns_override: { configured, resolver_reachable_from_provider,
  system_resolver_overridden }`, `errors[]`, `daemon_version`,
  `generated_at`.
- **Warnings:** `routes_all_traffic_through_mesh` (critical, the Tareq
  Node-2 trap), `handshake_stale` (high, >300s),
  `dns_override_unreachable_from_provider` (critical),
  `dns_override_active` (info).
- **Cache TTL:** 30s.

---

## Proposed endpoints

Each entry below is concrete enough that a separate engineer can ship
one without consulting the others.

### `/v1/diag/gpu`

- **Probe semantics:** `nvidia-smi --query-gpu=...
  --format=csv,noheader`, `nvidia-smi --query-compute-apps=...`,
  `journalctl -k --since -24h | grep -iE 'oom|out of memory|xid'`
  (Linux only; capped at last 100 lines). Driver and CUDA version
  pulled from `nvidia-smi -q | head -20`.
- **Response shape:**
  `driver_version`, `cuda_version`, `gpus: [{index, name, vram_total_mb,
  vram_used_mb, util_pct, temp_c, power_w, ecc_errors}]`,
  `compute_processes: [{pid, name, vram_mb, gpu_index}]`,
  `oom_in_last_hour` (bool), `xid_errors_in_last_24h` (list of XID codes).
- **Warnings:** `gpu_oom_recently` (critical), `gpu_xid_critical`
  (critical — XID 79/74/13 indicate hardware faults),
  `gpu_thermal_throttling` (high, temp>85C),
  `gpu_unexpected_process_holding_vram` (high — process not from our
  daemon's allow-list),
  `nvidia_smi_unavailable` (high — driver issue or non-NVIDIA host).
- **Cache TTL:** 15s (GPU state changes fast).

### `/v1/diag/inference`

- **Probe semantics:** detect engine via daemon's own provenance
  (`engine_type` field already in heartbeat), curl
  `http://127.0.0.1:<port>/v1/models` locally, time the call, parse
  the model list, hit `netstat -ltn | grep <port>` to confirm bind
  address. Pull p50/p95 latency from daemon's in-memory rolling
  window of the last N inference calls.
- **Response shape:**
  `engine_type` (vllm|ollama|llamacpp|none), `engine_version`,
  `bind_address`, `bind_port`, `local_models[]`,
  `last_models_endpoint_ms`, `last_models_endpoint_at`,
  `latency_p50_ms`, `latency_p95_ms`, `latency_sample_count`,
  `engine_pid`.
- **Warnings:** `inference_bound_to_loopback_only` (critical — engine
  won't accept requests from the daemon's HTTP proxy on the mesh IP),
  `inference_engine_unreachable` (critical),
  `inference_p95_degraded` (high, p95 >5x baseline),
  `inference_no_models_loaded` (high).
- **Cache TTL:** 30s.

### `/v1/diag/system`

- **Probe semantics:** `uname -a`, `/etc/os-release`, `df -h /` and
  `df -h <models_dir>`, `free -m`, `uptime`, `cat /proc/loadavg`,
  `timedatectl status` for NTP sync, `sudo -n -v` for sudo cache
  state (so we know if the daemon's sudo session has expired — common
  cause of background failures).
- **Response shape:**
  `os`, `kernel`, `arch`, `boot_age_s`, `loadavg_1_5_15`,
  `mem_total_mb`, `mem_available_mb`, `disk: {root: {used, avail,
  pct}, models: {...}}`, `ntp_synced` (bool), `time_skew_s` (signed),
  `sudo_cache_valid` (bool).
- **Warnings:** `disk_low_root` (critical, <5GB),
  `disk_low_models` (high, <20GB),
  `clock_skew_high` (high, |skew|>30s — breaks JWT validation),
  `ntp_not_synced` (medium),
  `sudo_cache_expired` (medium — operations needing root will fail),
  `load_extreme` (medium, load1 > 4*cpu_count).
- **Cache TTL:** 60s.

### `/v1/diag/network`

- **Probe semantics:** outbound NAT detection via STUN-style query to
  a known DCP endpoint. PMTU per route by sending DF-bit ICMP and
  watching for "Fragmentation Needed". DNS probes to 8.8.8.8, 1.1.1.1,
  and the ISP-provided resolver from `/etc/resolv.conf` (excluding
  any wg-quick-installed entry — that one is covered by `/v1/diag/wg`).
  UDP NAT timeout estimated by daemon's own keepalive accounting
  against the rendezvous server.
- **Response shape:**
  `public_ip`, `nat_type`, `nat_udp_timeout_s_estimate`,
  `mtu_to_internet`, `mtu_to_wg_server`,
  `dns_reachability: {"8.8.8.8": true, "1.1.1.1": false,
  "isp": true}`, `outbound_443_reachable` (bool),
  `outbound_51820_udp_reachable` (bool — WG handshake possible from
  scratch).
- **Warnings:** `pmtu_below_wg_required` (high, <1280 makes WG
  fragile), `udp_outbound_blocked` (critical, no WG possible),
  `dns_partial_outage` (medium — at least one common resolver
  unreachable), `nat_symmetric_detected` (medium — restricts P2P
  reachability).
- **Cache TTL:** 60s.

### `/v1/diag/daemon`

- **Probe semantics:** introspect the daemon process itself —
  version, uptime, last successful heartbeat timestamp, last error
  from the rolling log buffer, queue depth of pending inference
  requests, count of restarts in the last 24h (from PM2 or systemd
  if available, else from a self-recorded counter in
  `~/.dcp/restart_log`), presence of `~/.dcp/env` file (does NOT
  return the key value — only presence and file mode).
- **Response shape:**
  `daemon_version`, `uptime_s`, `last_heartbeat_at`,
  `last_heartbeat_ok` (bool), `last_error_message`, `last_error_at`,
  `queue_depth`, `restart_count_24h`,
  `env_file: {present: bool, mode: "0600"}`,
  `python_version`, `pid`.
- **Warnings:** `daemon_outdated` (high — compared against backend's
  `latest_daemon_version`), `heartbeat_failures_recurring`
  (critical), `restart_loop_detected` (critical, >5 in 24h),
  `env_file_world_readable` (critical — leaks `API_KEY`).
- **Cache TTL:** 15s.

### `/v1/diag/model_cache`

- **Probe semantics:** walk the configured models directory
  (`~/.ollama/models`, `~/.cache/huggingface`, vLLM's download dir),
  `stat` each entry, detect broken symlinks via `os.lstat()` + `os.stat()`,
  detect partial downloads via `*.tmp`/`*.part`/`*.downloading` markers
  and unexpected size mismatches against the engine's manifest where
  available.
- **Response shape:**
  `total_bytes_used`, `models: [{name, engine, bytes, last_modified,
  status: "ok"|"partial"|"broken_symlink"|"orphan"}]`,
  `orphan_count`, `partial_count`, `broken_symlink_count`.
- **Warnings:** `partial_downloads_present` (medium — these will fail
  on first request), `broken_symlinks_present` (high),
  `model_cache_size_unbounded` (medium — if >80% of disk).
- **Cache TTL:** 5 minutes (model cache changes slowly).

### `/v1/diag/logs?since=<ISO>&grep=<term>&limit=<N>`

- **Probe semantics:** tail the daemon log file
  (`~/.dcp/daemon.log` from `RotatingFileHandler`), filter to
  `since` window, optional `grep` (literal substring, not regex —
  cheaper to bound), `limit` cap (max 500, default 100). Apply the
  shared redaction list (see Cross-cutting) BEFORE returning.
- **Response shape:**
  `entries: [{ts, level, message}]`, `truncated` (bool — if matches
  exceeded `limit`), `next_cursor` (opaque, for pagination).
- **Warnings:** `error_rate_elevated` (high — >10 ERROR lines in last
  10 min), `repeated_traceback_signature` (medium — same top frame
  appears >3 times). The warning surface here is derived, not just
  "logs were available".
- **Cache TTL:** 0 (tail is intrinsically uncacheable; rate-limited
  instead — see Cross-cutting).

### `/v1/diag/firewall`

- **Probe semantics:** Linux: `sudo -n iptables -L -n -v` and
  `sudo -n nft list ruleset`, `sudo -n ufw status verbose`,
  `sudo -n firewall-cmd --list-all`. Filter to rules referencing
  WG iface, 11434 (Ollama), 8000 (vLLM), 19877 (diag). Best-effort
  on macOS/Windows.
- **Response shape:**
  `firewall_engine` (iptables|nftables|pf|windows_firewall|none),
  `ufw_active` (bool|null), `wg_rules_present` (bool),
  `inference_port_open_on_mesh` (bool),
  `inference_port_open_on_public` (bool — should be false),
  `rule_count`.
- **Warnings:** `inference_port_exposed_publicly` (critical — should
  only be on the mesh), `wg_rules_missing` (high — `wg-quick up`
  may have failed to add the MASQUERADE rule),
  `firewall_unknown` (low — operator visibility only).
- **Cache TTL:** 5 minutes (firewall changes are rare).

### `/v1/diag/summary` (aggregate)

- **Probe semantics:** the daemon fans out to every other
  `/v1/diag/*` endpoint locally (no HTTP — direct function calls),
  collects all `warnings[]`, computes a single `health` score, and
  returns the highest-severity warning per category.
- **Response shape:**
  `health_score: 0-100`, `worst_warning_level:
  critical|high|medium|low|info|none`,
  `categories: {wg: {...}, gpu: {...}, ...}` — each with the worst
  warning from that endpoint, `generated_at`.
- **Warnings:** none of its own — aggregates.
- **Cache TTL:** 60s. Used by Mission Control's provider-health pill.

---

## Cross-cutting design

### Auth uniformity

Every endpoint sits behind the same `_authorize_diag(request)` helper
on the daemon (Bearer `API_KEY`, constant-time compare). The backend
proxy applies the same dual rule on every `/api/providers/:id/diag/*`
route: admin token OR matching `x-provider-key`. The route handler
is a thin wrapper around a shared `proxyDiagEndpoint(providerId,
diagPath, cacheTtlMs)` function.

### Bind address (NOT 0.0.0.0)

The diag server binds to the WG mesh IP only, via `HTTPServer((mesh_ip,
port), ...)`. If the daemon detects no mesh IP, the server does not
start — `log.info("[wg-diag] No WG mesh IP detected; diag endpoint
not started")`. This is structural, not a runtime check that can fail
open. macOS providers without WG up will not have diag — by design.

### Secret redaction (defence in depth)

Both layers redact, because the daemon can be tricked by a malformed
config file. Names stripped before serialization:

- `private_key`, `preshared_key`, `psk`
- `api_key`, `api_token`, `bearer`, `authorization`
- `password`, `passwd`, `secret`, `*_secret`, `*_token`
- `cookie`, `session_id`
- Bare strings matching `eyJ[A-Za-z0-9_-]{20,}` (JWT shape),
  `sk-[A-Za-z0-9]{30,}` (API-key shape), 64-char hex
  (likely Wireguard key base64-decoded length).

The backend re-applies the same regex pass on every value of the
parsed JSON before caching. Cached payloads are the redacted version
— if a redaction bug ships in the daemon, the backend's redact
pass catches it on the next request.

### Output budget

- Per response: 64 KB hard cap, enforced both daemon-side
  (refuse to send) and backend-side (`req.destroy('diag_payload_too_large')`
  in the proxy's `data` listener — same pattern as v0.1).
- `/v1/diag/logs` paginates via `next_cursor`; default page 100 lines,
  hard max 500.
- `model_cache` truncates the `models[]` array at 200 and adds
  `truncated_at: N` to the top level.

### Warning levels

`critical | high | medium | low | info`. The backend's wrapper
response normalizes to:

```json
{
  "provider_id": 42,
  "worst_warning_level": "critical",
  "worst_warning": "routes_all_traffic_through_mesh",
  "warnings": ["routes_all_traffic_through_mesh", "handshake_stale"],
  "...all the diag fields..."
}
```

The dashboard's "provider health pill" reads `worst_warning_level`
only. Admins debugging hit `?expanded=1` and get the full array.

### Versioning

Every diag payload includes `diag_api_version: "1.0"` at the top
level. Daemon's `_build_*_payload` increments minor on
additive changes (new fields). Breaking shape changes live under
`/v2/diag/*`. The backend's proxy inspects `diag_api_version`
and applies translation shims when the daemon is older than expected.

### Rate limiting

Per-`providerId` token bucket on the backend: 60 req/min, burst 10.
The daemon has no rate limiting of its own (the mesh is already a
narrow attack surface; only the backend and admins-with-WG-access
can reach it). Logs endpoint gets a tighter bucket: 10 req/min,
burst 3, because each call is uncached and reads disk.

### Cache key

`(providerId, diagPath)` → `{at, payload}`. TTL per-endpoint as
listed above. Cache evicted on `last_heartbeat_at` change beyond
TTL — i.e. if the daemon visibly restarted, the cached diag may be
stale and gets dropped. Capacity-bounded (LRU, 10k entries) to
prevent unbounded growth.

---

## Operational walkthroughs

### Scenario A — renter sees `503 no_capacity_available`

Today: support thread, ask the provider to share their nvidia-smi
output. ~45 minutes round-trip.

With this surface:

1. Admin opens Mission Control's renter detail, sees the 503.
2. Mission Control's provider-detail page already shows
   `worst_warning: gpu_oom_recently` because `/v1/diag/summary` is
   polled every 60s.
3. Admin clicks "Full diag," gets the GPU array: process holding
   23GB of 24GB VRAM is `vllm-server` (pid 12345) but the daemon
   only expects it to be holding ~16GB for the loaded model.
4. Resolution: provider's vLLM is leaking — flag for restart via a
   separate write-authenticated path (`/api/providers/:id/restart_engine`,
   audit-logged). No provider page needed.

### Scenario B — provider says "WireGuard is up but my inference URL doesn't work"

This is the Tareq Node-2 scenario.

1. Provider opens a Telegram support thread.
2. Admin runs `gh api /providers/123/diag/summary` from a terminal.
3. Response: `worst_warning: dns_override_unreachable_from_provider`,
   `dns_override.configured: 1.1.1.1`,
   `dns_override.resolver_reachable_from_provider: false`.
4. Admin tells provider: remove the `DNS = 1.1.1.1` line from
   `/etc/wireguard/wg0.conf` and `wg-quick down wg0 && wg-quick up wg0`.
5. Provider's next `/v1/diag/summary` poll shows `worst_warning:
   none`. ~5 minutes total, no guessing.

---

## Consumers of this surface

1. **Mission Control's provider-detail page** — already has a
   placeholder "diagnostics" tab. It polls `/v1/diag/summary` every
   60s for every visible provider; on click, fetches the per-endpoint
   detail. The "health pill" reads `worst_warning_level`.

2. **`openclaw doctor`** (local CLI on the provider's box) — the
   provider can run `openclaw doctor` and get the same JSON, run
   through a human-readable formatter, without needing the backend
   in the loop. The daemon's diag server is reachable on the mesh
   IP from the same box (loopback through WG). This is the
   provider-self-service path.

3. **CI smoke test on PR deploys** — after a backend deploy, CI
   pings `/api/providers/:id/diag/summary` for a known test
   provider; any new `worst_warning_level: critical` that wasn't
   present pre-deploy fails the deploy.

---

## Failure modes we are deliberately NOT introducing

- **No exec / no write endpoints in `/v1/diag/*`.** This surface is
  read-only. Operations that change state (restart engine, rotate
  WG key, flush cache) live under `/v1/admin/*` with separate auth
  and an audit log. Mixing the two is how `/v1/diag/exec?cmd=...`
  ships and someone notices in week 3.
- **No trusting the daemon to redact.** The backend re-redacts every
  field on the way out. A redaction-bypass bug in the daemon (e.g.
  someone adds a new field that contains a key) is caught by the
  backend's regex pass on the cached value.
- **No binding to 0.0.0.0.** Structural, not a runtime flag.
  `HTTPServer((mesh_ip, port), ...)` with `mesh_ip` derived from
  `_detect_wg_mesh_ip()`, never from user input.
- **No unbounded pagination.** Logs endpoint hard-caps at 500 lines,
  every other endpoint hard-caps at 64 KB. Cursor is opaque and
  per-request, not a stable handle the client can manipulate.

---

## Risks and unknowns

- **`sudo -n` reliance.** Several endpoints (`/diag/firewall`,
  `/diag/wg` for non-readable configs) need cached sudo for the
  daemon user. If the sudo session has expired, those probes return
  `null`/`unknown`, which the warning layer must NOT confuse with
  "everything's fine." Status: handled in v0.1 by returning empty
  lists, but the warning layer hasn't been audited for false negatives.
- **macOS / Windows coverage.** WG on macOS uses `utunN`; Windows
  uses the Wintun virtual adapter. Several probes (`ip route`,
  `iptables`, `journalctl`) are Linux-only. Endpoints must return
  `os_unsupported` rather than silently empty arrays. Current code
  partially does this; needs uniform treatment.
- **Sudoers config.** This surface only works if the installer set
  up `dcp ALL=(root) NOPASSWD: /usr/bin/wg, /usr/sbin/iptables,
  /sbin/iptables` (and equivalents). The Tauri installer does this
  on Linux; we don't have parity on macOS. Unknown: how often
  providers install via tarball and skip the sudoers step.
- **Daemon HTTP port count.** A pending memory observation (id 3842,
  2026-05-13) suggested the daemon has "only one HTTP port" and the
  diag endpoint should share the health server. The shipped code
  contradicts this — `/v1/diag/wg` runs on its own port 19877 bound
  to the mesh IP, while `/health` runs on 127.0.0.1:<health_port>.
  This is intentional (different bind addresses, different auth
  posture) but worth confirming before adding more endpoints on
  19877. If we want a single port, we'd need to make the health
  server mesh-IP-aware, which weakens the "127.0.0.1 only" guarantee
  the health endpoint relies on.
- **Cache invalidation across daemon restarts.** Backend cache holds
  payloads for 30-300s. If a daemon restarts and fixes the issue
  mid-window, the dashboard still shows the warning. Mitigation
  proposed (heartbeat-tied invalidation) is not implemented and
  needs measuring under load.
- **Log redaction false negatives.** The regex set above catches
  obvious shapes but not, e.g., AWS Session Tokens (which are 40+
  chars of opaque base64). Adding more patterns increases CPU on
  every log fetch; we'd need a benchmark before broadening.
- **No formal spec for `diag_api_version` translation.** The shim
  layer is described above but not coded; the first time we ship a
  breaking change we'll discover whether the translation surface is
  workable or needs a proper schema-registry approach.
