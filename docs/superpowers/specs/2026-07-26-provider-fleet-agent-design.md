# Provider Fleet Agent — Design (Phase 1 BUILT 2026-07-28)

> **Status: Phase 1 implemented** (`backend/src/fleet/`). Sections 4–5 below
> are as-built. Motivating incident for the resume: Node 2's daemon was
> SIGTERM'd during the July 26 model swap and stayed down ~2 days unnoticed
> (no watchdog covered the daemon itself).

## Motivation

Current provider daemons are weak. Evidence from the July 25–26 Node 2 incident:
- Couldn't explain a systemd-caused model conflict (looked like the daemon was
  "forcing" qwen; it was `dcp-vllm.service` with `Restart=always`).
- No diagnosis for a ~20h outage (root cause was a host crypto miner + power).
- Missed a host-level miner entirely (guard was pod-scoped only).
- No real comms — every diagnosis required a human to SSH in.

Goal: an intelligent layer that diagnoses, orchestrates downloads, triages
emergencies, and communicates — without putting an autonomous LLM on
third-party hardware.

## Settled decisions (with Peter)

1. **Two-layer architecture.**
   - Lean deterministic **daemon** stays on each provider node for hard-real-time
     safety: heartbeat, kill-switches, anti-miner guardrails, download execution.
     Never has an LLM in the kill path.
   - Intelligent **agent brain** runs on OUR infra (VPS / backend), NOT on the
     node.
2. **Brain hosted on our infra**, not the node (cost, security — no LLM-with-shell
   on providers' machines, no GPU contention with the product being sold).
3. **Autonomy level B**: acts autonomously within a safe allowlist; PROPOSES
   anything risky as a Mission Control task for human/Claude approval.
4. **Trigger: tiered watcher + wake** (Option 2). A cheap deterministic watcher
   ingests every heartbeat and holds fleet state; it wakes the LLM brain only on
   an anomaly. Cheap at rest, smart when it matters — same shape as the mission
   dispatcher (dumb timer) + Claude (reasoning on demand).
5. **Reuses the existing HMAC control channel** — no new node plumbing. The brain
   reads telemetry + `applyTaskUpdates` results and enqueues commands via
   `fetchPendingTasksForProvider` / `pending_tasks` (the path PR #962 extends).
   The daemon remains the only thing that touches the box.
6. **Revive the dormant Hermes agent scaffold** already on nodes
   (`~/.dcp/agent/repo`, last active May 15) — but per decision 2 the reasoning
   runs on our infra; on-node Hermes is at most a thin executor if needed.

## Components (settled, section 3 — approved by Peter through "ok so far")

- **Watcher** (`fleet/watcher`) — plain code, no LLM. Consumes heartbeats into a
  persisted `provider_fleet_state` table (last_seen, gpu/vram, models loaded,
  active task, health). Runs anomaly rules (heartbeat gap > N min, miner event,
  download stuck/failed, VRAM contention, daemon-version drift). Emits an
  **incident** when a rule trips. Always-on pm2 process next to the mission
  dispatcher (or folded into it).
- **Brain** (`fleet/brain`) — the LLM. Woken by an incident with a tight context
  packet (that provider's recent telemetry + incident + allowlist). Produces a
  structured decision `{diagnosis, action: auto|propose|none, command?, message}`.
  Stateless per-wake; memory lives in fleet-state + Mission Control.
- **Actuator** (`fleet/actuator`) — takes `auto` decisions, validates against the
  allowlist (DETERMINISTIC code — the LLM cannot act outside it even if it
  hallucinates), enqueues the `pending_task`. `propose` decisions become Mission
  Control tasks. **Key safety property: the allowlist is code, not a prompt.**
- **Comms** — reuses the Mission Control API + Telegram bridge. Incidents →
  Alerts topic; diagnoses/proposals → Mission Control tasks to the right owner.

## Section 4 — Data flow + allowlist (AS BUILT)

**Recovery channel insight:** the daemon HMAC channel (`pending_provider_tasks`)
requires a LIVE daemon — useless for the most important action (restarting a
dead daemon). The **liveness beacon cron** survives daemon death, so its ack
now carries a one-shot `recover: {action}` field (route
`POST /:id/agent-liveness`). The beacon script validates against its OWN local
allowlist (`start_daemon` only, and only when no daemon process is running).
Two independent allowlists must agree before anything touches a node.

**AUTO (code allowlist in `fleet/actuator.js`):**
- `start_daemon` — via beacon ack. Fires deterministically on the
  `daemon_down_host_alive` rule (daemon heartbeat gap > 10 min AND beacon
  fresh < 5 min). No LLM required.
- `retry_download` — via `pending_provider_tasks` (`pull_model`).
- `expire_stuck_lease` — backend DB only.

**PROPOSE (mission task, never executed):** everything else — kill/swap model,
quarantine/un-flag a provider, reboot, disable systemd units, any SSH action.
`miner_quarantine` and `host_unreachable` incidents have NO auto action.

**Rules (`fleet/rules.js`, pure + fake-clock testable):**
`daemon_down_host_alive` (critical, auto), `host_unreachable` (critical),
`miner_quarantine` (critical, fires even when paused), `download_stuck`
(warning, in_progress > 60 min). Graveyard gate: rows silent > 7 days never
fire (kills the providerHealth log-noise problem).

**Brain (`fleet/brain.js`):** env-gated on `ANTHROPIC_API_KEY`; without it the
watcher is deterministic-only. `claude-opus-4-7`, adaptive thinking, structured
decision `{diagnosis, action, proposed_action?, message}`; out-of-enum degrades
to propose. Woken only on NEW incidents (dedup'd), stateless per wake.

## Section 5 — Testing + rollout (AS BUILT)

- `fleet-rules.test.js` — 12 fake-clock rule tests incl. graveyard suppression
  and the Node 2 incident shape.
- `fleet-actuator.test.js` — 6 tests: dry-run default executes nothing;
  live-list gating; non-allowlisted action NEVER executes (files a proposal);
  channel correctness.
- Rollout: `dcp-fleet-watcher` pm2 process (`ecosystem.fleet.config.js`),
  DRY-RUN default; staged live via `DCP_FLEET_LIVE_PROVIDERS=1774351995321`
  (Node 2); fleet-wide via `DCP_FLEET_DRYRUN=0` after a clean week.
- Schema: `provider_fleet_state` + `fleet_incidents` (partial unique index on
  open dedup_key) + `provider_agent_liveness.recover_action` — all in `db.js`.

## Brain backend (2026-07-28): local Bonsai stopgap

The brain is now backend-agnostic (`fleet/brain.js`): set `DCP_FLEET_BRAIN_BASE_URL`
for any OpenAI-compatible endpoint, or `ANTHROPIC_API_KEY` for Claude. LIVE now:
Node 2's in-Kingdom **Bonsai** (`ternary-bonsai-27b`, llama.cpp `/v1` over the WG
mesh at `http://10.8.0.6:8080/v1`) — dogfoods DCP inference, no external key,
stopgap until Node 3 is onboarded. Switch back to Claude by setting
`ANTHROPIC_API_KEY` and clearing `DCP_FLEET_BRAIN_BASE_URL`.

Notes:
- Bonsai is a REASONING model: answer is in `message.content`, chain-of-thought
  in `message.reasoning_content` (ignored). Needs generous `max_tokens` (2048)
  or the JSON is truncated. `parseDecision` handles fences/prose/out-of-enum.
- Observed latency ~28s/decision (Q2 27B). Timeout 45s.
- Circular-dependency is bounded: critical recovery is deterministic and fires
  BEFORE the brain call, so a Bonsai-on-Node-2 outage costs only the diagnosis
  narrative for that incident, never the fix or the alert.
- **Phase 2 / live-wide TODO:** the brain call is currently awaited inside the
  watcher tick, so a ~28s Bonsai call delays detection of OTHER providers'
  incidents in that tick. Fine for the current single-live-node rollout;
  decouple (queue diagnosis off the tick path) before flipping the whole fleet
  to live.

## Phase 2 (open)

- Grow the daemon task vocabulary so `antiminer_sweep` can ride the HMAC
  channel (CHECK constraint currently limits to pull/unload/noop).
- Version drift + VRAM contention rules (need daemon_version/VRAM telemetry
  folded into fleet state).
- Brain memory: feed resolved-incident history into the packet.
- Dogfood DCP inference for the brain once reliable (inference-demand thesis).

## Resume checklist

1. Re-read this doc.
2. Finish sections 4 (allowlist) + 5 (testing/rollout) with Peter.
3. Decide brain model + watcher placement.
4. Write the full spec → spec-review loop → writing-plans → subagent execution.
5. Relevant code already in flight: PR #962 (pull-on-demand daemon task channel)
   and #963 (host anti-miner) are the daemon-side foundations this builds on —
   ensure both are merged first.
