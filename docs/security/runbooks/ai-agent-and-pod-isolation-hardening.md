# Runbook — AI-agent, multi-tenant pod & supply-chain hardening (staged)

Covers the KB-applied findings (2026-06-24) that are fleet-level / need a window or soak.
GATES are mandatory — do not skip. Deploy discipline: daemon changes propagate via auto-update,
so treat ANY run_interactive_pod / install.sh change like the C3 cutover (soak 24h+, watch fleet).

## POD-1..4 — renter pod isolation (daemon `run_interactive_pod`, installers/dcp_daemon.py)
Today every interactive pod is `docker run` as root, full caps, default bridge, writable shared
HF cache. Phase it so we never break live pods:
- **Phase 0 (inert):** add the flags behind a daemon env `DCP_POD_HARDENING=0`. Ship, soak the
  daemon fleet-wide (24h+). No behavior change yet.
- **Phase 1 (safe subset):** `--security-opt no-new-privileges` + `--cap-drop ALL` then
  `--cap-add` only what GPU/Jupyter needs (CHOWN,SETUID,SETGID,DAC_OVERRIDE). Test on a canary
  pod: torch CUDA, pip install, jupyter — confirm none break. Then flip `DCP_POD_HARDENING=1`.
- **Phase 2:** seccomp (default profile) + per-pod `--network` (drop shared docker0; POD-3) +
  mount the HF cache `:ro` or per-tenant (POD-4). Re-test CUDA/pip. Canary -> fleet.
- **POD-2:** in `pods.js validatePodImage`, replace the allow-anything `IMAGE_REF_RE` pass with a
  registry allowlist (dc1/*, vetted bases) + optional digest pin; keep bootstrap_ssh behind the
  allowlist. (107/120 historical pods already use dcp-compute:pytorch — low blast radius.)
GATE: no pod hardening flips while interactive pods are live; canary first; watch reaper + the
daemon `daemon_version` adoption in providers.db before fleet flip.

## POD-5 — global HMAC in every pod  ->  tracked by C3
Folds into `per-provider-taskspec-signing-and-heartbeat-hmac-enforcement.md`. A per-provider
task_spec key means a single pod compromise no longer yields a fleet-wide signing secret.

## POD-6 — test coverage
Extend `backend/tests/security/container-isolation.test.js` (DCP-41) to assert the hardened
`docker run` string for `run_interactive_pod` (not just the daemon job path).

## SC1 — daemon out-of-band code signing
The installer "integrity gate" verifies a sha256 the same backend regenerates over the bytes it
serves — self-certifying, so a backend/MITM swap is undetectable. Fix: sign the daemon artifact
with a detached signature (minisign/cosign) using a key held OFF the serving box; ship the public
key in the installer; verify signature (not just digest) before first install AND on self-update.
GATE: roll the public key into install.sh + daemon before any signed artifact is required.

## SC3 — WireGuard mesh isolation + backend bind
`wg0.conf` PostUp is `iptables -A FORWARD -i wg0 -j ACCEPT` (any-peer-any) and backend listens
0.0.0.0:8083 -> every one of the 26 provider peers can hit :8083 directly, bypassing nginx
TLS/WAF. Fix (careful — can cut provider tunnels): (1) bind backend to 127.0.0.1 + the wg
gateway IP only, keep public access via nginx; (2) add intra-mesh iptables so peers reach only
the gateway, not each other. Verify reverse tunnels (socat 41000-42001) + reconciler keepalive
still work BEFORE persisting (SaveConfig=true will snapshot rules).
GATE: test from a provider peer that api.dcp.sa still serves and tunnels stay up; have console
access ready (mesh change can lock out SSH-over-wg).

## DCP-API-02 / 04 — unauth enumeration
`/api/p2p/providers`, `/api/network/providers`, `/api/standup/latest`, `/api/containers/registry`
return raw fleet/topology + internal IDs to anonymous callers (the same identity stripped from
renter views by the INVISIBILITY guard). Fix: gate behind requireRenter/requireAdminAuth, OR if a
public marketplace listing needs them, serve the sanitized renter view (gpu_model + price only,
no internal id/host/timestamps). GATE: grep the Vercel frontend for fetches to these paths first —
do not break the public marketplace page.

## DCP-API-05 — legacy api_key column lookup
Consistency gap, not a direct break. Fold into the H1 key-at-rest hashing migration (make every
lookup site go through the scoped-key path).

## AI-2 — OpenRouter key rotation (HUMAN)
Rotate `sk-or-v1-…e7af` in the OpenRouter dashboard (leaked verbatim into logs/memory). Replace
the Nexus `config.yaml auxiliary.vision.api_key` with an env reference; audit config.yaml.bak-*.

## AI-5 — agent red-team in CI
Add a promptfoo (or LLM-Guard) suite that fires indirect-injection + jailbreak payloads at Nexus
/ the /v1 surface on each release; assert tirith blocks + no secret-bearing tool calls. The
`/dcp-security-audit` skill + the KB now map these to ATLAS; this makes it continuous.


## DCP-API-02 — network/providers + p2p/providers (branch-scoped sanitize) [added 2026-06-24]
Adversarial workflow result: NOT a blind gate — both are the **P2P discovery fallback** (p2p/README.md;
p2p/test-discovery-load.mjs). `requireAdminAuth` would 401 the daemon discovery client.
- **network.js** (L92-109 `rows.map` return): strip `id, peer_id, name, driver_version, compute_capability,
  cuda_version, last_heartbeat, last_heartbeat_sec_ago, created_at`; keep `gpu_model, vram_gb, vram_mib,
  gpu_count, status` + derived `is_available`.
- **p2p.js**: `toProviderShape` (L81-102) + `toDhtProviderShape` (L109-131) are SHARED with the
  peer-resolution paths (`/providers/:peerId`). Add a `sanitize` flag and apply the allowlist ONLY on the
  unauthenticated list branch (L199-265) — do NOT strip `peer_id` from the lookup paths.
- **GATE (mandatory):** first read `installers/dcp_daemon.py` discovery client + confirm it keys on
  gpu/availability, NOT on `peer_id`/`name`/`addrs` from these list branches. Apply only after that diff.

## H1 — pepper decision (recommendation, 2026-06-24)
Providers ALREADY run unpeppered `sha256hex` (db.js:8) with a live hash-first `resolveProviderByKey`
(providers.js:411) and 11/17 rows backfilled. Renters have no hash column yet.
**Recommendation: NO pepper — match the existing unpeppered provider scheme.** API keys are high-entropy
random strings, so a pepper adds marginal brute/rainbow resistance, while adopting one forces a risky
provider re-backfill (re-hash 11 live rows + keep hashProviderApiKey/sha256hex in lockstep). Consistency +
zero-retrofit wins. (Reversible later via a hash-version prefix for NEW keys if ever wanted.)
Phase 0 (additive `api_key_hash`/`key_hash` cols + dual-WRITE) is LOW risk but touches renter key-MINTING
(auth.js magic-link, renters.js rotate, sub-key mint, reconciliation, admin force-rotate) — **run attended**
so key issuance can be smoke-tested right after. Phases 1-2 (hash-first reads on v1.js/vllm.js hot paths)
are MEDIUM-HIGH — never unattended.
