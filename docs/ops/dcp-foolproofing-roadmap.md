# DCP Foolproofing Roadmap — signup → running inference

_Read-only architecture probe, evidence verified live against api.dcp.sa on 2026-05-30._

## The one root cause (all 5 segments converge here)

**The platform reports "green" from self-asserted signals (heartbeats, status flags, foreground pollers) instead of proven facts (a real probe, a real charge, a real disbursement). Every failure mode is silent.**

The fix is one principle applied everywhere: **replace claimed state with earned state, and make every money/capacity invariant fail loud.**

Foolproof scores (0–10): provider-onboard **2** · renter+money **2** · inference-path **2.5** · meter-settle-payout **2** · observability **2**.

## The worst findings (live-verified)

- **Free money in prod.** `NODE_ENV` is not `production` on the VPS → `/api/renters/topup-sandbox` is **live**, and any valid renter key can mint up to **10,000 SAR free per call**. (Worst single exposure.)
- **Card top-up charges but never credits.** Billing UI uses the hosted `Moyasar.init()` form, which **never creates a `payments` row**; `verify` 404s and the webhook says `ignored_unknown`. And `MOYASAR_WEBHOOK_SECRET` is unset → every `paid`/`refunded` webhook is **rejected 503**. Renter pays real SAR, balance stays 0, nothing to reconcile.
- **"Registered but never serving" trap.** `register-node` sets `status='active'` but never `approval_status='approved'`; the wizard's `node-status` checks only `status==='active'` → shows **"🟢 You're Live"** immediately, while every subsequent heartbeat is **403'd "not approved yet"** forever. **This is exactly why the 5 dead sign-ups exist.**
- **Silent revenue leak.** `debitRenterSafe` does `UPDATE … WHERE balance >= cost` → matches 0 rows when balance<cost → **no throw, no charge, free inference**; and a non-stream completion from Ollama (no `usage` block) bills **zero tokens**. Both logged as "billed."
- **Three payout systems, three split rates** (70% `usage_events` / 75% `claimable` / 85% `job_settlements`), non-reconciled → double-pay / mis-pay; `markPayoutPaid` can mark a never-disbursed payout "paid."
- **30/32 catalog models have 0 providers** → a renter selecting any gets a 503 into a dead menu; `bge-m3`/reranker advertised but there is **no `/v1/embeddings` route** (404 raw nginx HTML).
- **Reliability % is computed from `heartbeat_log` — the table the fake keepalive stuffs** — so the headline shows 75–86% uptime while real inference is ≈0 (`latency_ms.sample_count:0` 24h, `total_tokens_24h:0`, `last_token_record_at:2026-04-03`).
- **Nothing pages when usable capacity hits zero** (the offline sweep silently requeues into the void) — exactly how Node 2 stayed dark 3+ days.

## The roadmap — 7 highest-leverage changes (priority order)

1. **Make `status='online'` an EARNED state** gated on a backend 1-token inference probe; drive `/v1/models`, routing, `/api/health`, `/admin/health`, and reliability from one `countUsableProviders()` source. Filter `provider_count:0` models out of the catalog; treat `endpoint_reachable IS NULL` as NOT serviceable. *(M, claude)* — **the keystone.**
2. **Replace `debitRenterSafe` with the existing atomic `billingService.settleInferenceOnce`** (one transaction, idempotent on `request_id`, throws on shortfall); estimate tokens when the provider omits `usage`; never zero-debit silently. *(M, claude)*
3. **Fix card top-up:** UI calls `POST /topup` → redirect to the server-created `payment_url` (so a `payments` row exists); set `MOYASAR_SECRET_KEY` + `MOYASAR_WEBHOOK_SECRET` + register the webhook; `verify` upserts from the live Moyasar object; reconciliation cron credits any Moyasar-`paid` with no DCP row. *(M, user env + claude code)*
4. **`NODE_ENV=production` + hard-fail boot** when prod money-config is missing; gate `topup-sandbox` behind explicit `ALLOW_SANDBOX_TOPUP=1` (else don't mount); surface `payments_webhook_ready` / `payout_source_ready` on `/api/health`. *(S, user env + claude guard)*
5. **Installer hardening (daemon self-heal + boot persistence):** write `/etc/sudoers.d/dcp-wg` NOPASSWD for `wg-quick`; `loginctl enable-linger` (or default to system units); `systemctl enable wg-quick@wg0`; make the engine supervisor cover the engine actually started (Ollama/vLLM/MLX, not just `~/models/*.gguf`); post-install assert all three are `is-enabled`. *(M–L, claude scripts + user test on a rig)*
6. **Off-box dead-man's-switch + capacity/drift alerts:** external monitor (UptimeRobot/Healthchecks) on `/api/health`; synthetic `usable_online_providers<1` and `inference_volume_1h==0` alerts; `recordCronTick` on every cron + a static manifest (alert on MISSING tick); daily reconciliation (`usage_events billed` vs balance-debit deltas vs claimable credits). *(M, claude + user monitor account)* — _the fleet-watchdog already deployed is the first piece of this._
7. **Wizard "You're Live" gates on a real approved heartbeat** (`approval_status='approved'` AND `last_heartbeat<90s` AND `accepting_jobs`); auto-approve wizard daemons or show plain-language "pending approval"; do heavy installs BEFORE consuming the single-use token; make the 409-retry return the existing key for the same fingerprint. *(M, claude)*

## System invariants — "green" = the conjunction of ALL of these; if a check can't be evaluated, that is RED, not green

1. **Capacity honesty** — advertised model ⇔ ≥1 provider passed a backend probe in the last N s; no `provider_count:0` model is orderable.
2. **Probe-before-trust** — `online` ⇒ fresh heartbeat AND recent successful backend probe; heartbeats are advisory only.
3. **Billing conservation** — per inference, `renter_debit == usage_events.cost == provider_payout + dcp_take`, one transaction keyed by `request_id`, or it rolls back and errors. No silent 0-row debit.
4. **Single split constant** — exactly one `PROVIDER_SHARE` feeds usage_events AND claimable.
5. **Payout reality** — `markPayoutPaid` ⇒ a real Moyasar terminal-success OR an explicit recorded manual transfer; CAS-guarded, idempotent, one disbursement generator.
6. **Money you can't credit, you don't take** — methods with no automated credit path are disabled; webhook secret present or boot fails in prod.
7. **Off-box liveness** — an external monitor confirms `/api/health` 200 + DB writable; the alarm survives the box dying; DB integrity + off-box backup on a cron.
8. **Cron completeness** — every cron ran within 2×interval; a never-ticked cron alerts on a MISSING manifest row.
9. **Reliability = proven serving** — uptime derives from successful inference probes / real `usage_events`, never `heartbeat_log`.
10. **Boot persistence** — post-install, daemon + engine + `wg-quick@<iface>` all `is-enabled`, else install fails loud.

## If only one fix ships
**#1 — make `online` an earned, probe-gated state and drive the catalog/routing/health/reliability from it.** It's the truth oracle the whole stack hangs from; you can't fix billing or payouts on capacity you can't trust exists. (#2 billing atomicity is a very close second — ship in the same cycle.)
