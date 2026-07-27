# Provider Fleet Agent — Design Notes (PAUSED 2026-07-26)

> **Status: PAUSED mid-brainstorm.** Decisions below are settled with Peter.
> Resume by finishing sections 4–5 (data flow + allowlist, testing), then run
> the normal spec → plan → subagent-driven-execution flow. This is design
> capture, not a finished spec.

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

## OPEN — to finish on resume

- **Section 4 — data flow + the allowlist contents.** Enumerate exactly which
  actions are `auto` (candidates: restart a wedged daemon, retry a failed
  download, expire a stuck lease, run the anti-miner sweep) vs `propose` (kill a
  model, quarantine a provider, reboot, disable a systemd unit). This is the
  crux — get it precise.
- **Section 5 — testing + rollout.** Fake-clock watcher rules, actuator allowlist
  enforcement (LLM proposes out-of-allowlist → rejected), dry-run mode default
  (like the dispatcher), staged rollout on one node (Node 2) first.
- **Brain model choice** (recommendation-with-flag, not yet decided): Claude API
  for the emergency brain — reliability matters (if we dogfood DCP inference and
  the fleet is down, the brain's own model may be down too). Dogfooding DCP
  inference is the eventual goal per the inference-demand thesis, once reliable.
- Where the watcher lives: new pm2 process vs. extend `dc1-mission-dispatcher`.
- Schema: `provider_fleet_state` table shape + incident ledger (dedup like the
  dispatcher's).

## Resume checklist

1. Re-read this doc.
2. Finish sections 4 (allowlist) + 5 (testing/rollout) with Peter.
3. Decide brain model + watcher placement.
4. Write the full spec → spec-review loop → writing-plans → subagent execution.
5. Relevant code already in flight: PR #962 (pull-on-demand daemon task channel)
   and #963 (host anti-miner) are the daemon-side foundations this builds on —
   ensure both are merged first.
