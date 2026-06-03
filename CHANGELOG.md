# Changelog

This is the canonical public changelog for the `dhnpmp-tech/dcp-platform`
repository.

Format:
- newest entries first
- timestamps are UTC merge times
- every entry links to the GitHub PR
- each entry lists what was included, not just a feature headline

Internal handoffs, private operations notes, generated reports, and launch
checklists do not belong in this public changelog.

## [Unreleased]

### 08:58 UTC — [PR #552](https://github.com/dhnpmp-tech/dcp-platform/pull/552) — `fix(v1): keep stale providers out of model counts`

Included:
- Tightened `/v1/models` provider counts so stale-heartbeat providers do not inflate `provider_count`, even when their cached model list matches a catalog model.
- Kept existing catalog alias matching intact, including BGE-M3 and HF-style model IDs, so a fresh verified provider can still make the renter playground discoverable.
- Made the provider-count scan conservative if provider rows cannot be read: the model catalog stays available, but provider counts fall back to zero instead of throwing.
- Added a focused `/v1/models` regression for alias-matched cached models and stale-heartbeat exclusion.

### 08:50 UTC — [PR #551](https://github.com/dhnpmp-tech/dcp-platform/pull/551) — `fix(v2): remove playground demo wording`

Included:
- Removed the remaining demo-labeled sample prompt from the v2 renter playground so the console no longer suggests a mock/demo flow.
- Added a static regression that fails if demo wording is reintroduced to the v2 renter playground.
- Kept the real catalog and inference behavior unchanged: model options still require `provider_count > 0`, and inference still requires a real renter key.

### 08:45 UTC — [PR #550](https://github.com/dhnpmp-tech/dcp-platform/pull/550) — `feat(v2): surface admin serving blocker reason`

Included:
- Added the same serving-capacity counters and machine-readable capacity reason to the protected `/api/admin/health` endpoint that public health already exposes.
- Added a Live capacity reason packet to `/v2/admin` Launch readiness so founders and agents can see whether the blocker is fresh heartbeat, endpoint reachability, earned inference, or model coverage.
- Kept public capacity changes gated behind all four serving gates and continued to keep provider repair, routing, daemon, WireGuard, and marketplace-copy mutations outside the v2 packet.
- Added static regressions for the admin health capacity contract, v2 capacity reason rendering, and capacity gate styling.

### 08:28 UTC — [PR #549](https://github.com/dhnpmp-tech/dcp-platform/pull/549) — `fix(v2): remove stale provider setup proof claims`

Included:
- Removed the hard-coded provider setup throughput claim and replaced it with proof-gated copy that only promises measured tokens per second after daemon and backend verification.
- Replaced tier-language that implied reliability changes the provider payout split with copy that keeps reliability separate from the published 85/15 split.
- Stopped the provider setup OS selector from claiming a browser-detected device and changed it to a plain selected installer target.
- Replaced the auto-playing installer success sequence with a pending installer plan so the page no longer claims hardware scan, engine install, model download, or tunnel success before the daemon reports back.
- Added static regressions for stale throughput, fake device detection, fake installer progress, and payout-split wording.

### 08:15 UTC — [PR #548](https://github.com/dhnpmp-tech/dcp-platform/pull/548) — `feat(v2): add admin finance handoff packet`

Included:
- Added a read-only Money review handoff inside `/v2/admin` so founders, operators, and agents can see the human owner, verified payments console, agent summary role, evidence note, and stop rule for the highest-priority finance blocker.
- Derived the handoff from existing finance evidence already loaded by v2 admin: refund requests, provider payouts, billing exceptions, auto-top-up issues, reconciliation drift, and pending withdrawals.
- Included a copy-ready finance evidence note that summarizes the queue type, subject, amount, status, reference, and current review detail before a human uses the verified payments console.
- Kept money mutation boundaries explicit: no refund approval/rejection, payout sync, balance edit, credit grant, payment confirmation, or auto-top-up retry happens from the v2 handoff packet.
- Added static regressions for the finance handoff model, verified-console label, copy-ready evidence note, mutation boundary language, and responsive styling.

### 08:02 UTC — [PR #547](https://github.com/dhnpmp-tech/dcp-platform/pull/547) — `feat(v2): add admin serving handoff packet`

Included:
- Added a read-only Provider recovery handoff inside `/v2/admin` so founders, operators, and agents can see the owner, verified console, agent role, evidence note, and stop rule for the selected serving proof target.
- Derived the handoff from canonical `/admin/fleet/probe-evidence` rows already loaded by the Serving proof packet; no new backend route or write path was added.
- Included a copy-ready mission evidence note that summarizes provider id, provider label, recovery focus, route/inference/model/publication gate states, and the next recommended action.
- Kept recovery mutation boundaries explicit: no daemon restart, WireGuard edit, endpoint edit, routing change, or public marketplace language change happens from the v2 handoff packet.
- Added static regressions for the handoff model, copy-ready evidence note, verified-console label, mutation boundary language, and responsive styling.

### 07:51 UTC — [PR #546](https://github.com/dhnpmp-tech/dcp-platform/pull/546) — `feat(v2): add admin action ledger`

Included:
- Added a read-only Action ledger to `/v2/admin` that combines recent admin audit rows with the 24-hour mission pulse.
- Summarized admin writes, mission changes, and agent touches so founders can see who changed what before opening the raw audit feed.
- Kept the ledger evidence-only from `/admin/audit` and `/mission/pulse`; it does not replay writes, approve providers, send notifications, move money, or repair providers.
- Added static regressions for the ledger data model, evidence-source contract, mutation boundary language, rail entry, and responsive styling.

### 07:39 UTC — [PR #545](https://github.com/dhnpmp-tech/dcp-platform/pull/545) — `feat(v2): add provider approval decision envelopes`

Included:
- Upgraded the `/v2/admin` provider approval desk from a static decision-envelope note into explicit approve/reject decision envelopes.
- Each provider approval envelope now shows the guarded backend route, human-approval gate, evidence requirement, audit result, and readiness state before the operator acts.
- The reject envelope mirrors the existing button guard and stays in a watch state until a rejection reason has at least 8 characters.
- Kept provider approval behavior on the existing audited `PATCH /admin/providers/:id/approval-decision` route; no new provider repair, routing, payment, or control-plane actions were added.

### 07:30 UTC — [PR #544](https://github.com/dhnpmp-tech/dcp-platform/pull/544) — `feat(v2): add admin mission action envelopes`

Included:
- Added a mission action-envelope preview to `/v2/admin` before guarded task writes so founders, operators, and agents can see the route, permission gate, evidence requirement, audit output, and readiness state before acting.
- Derived separate envelopes for status moves, reassignment, and admin notes from the selected task, target status, target assignee, evidence note, and strict-vs-legacy write posture.
- Kept the existing guarded mission routes and write boundaries intact; no new create/delete, payment, provider repair, or control-plane actions were added.
- Added static regressions for the envelope model, strict/legacy permission labeling, evidence readiness language, and responsive envelope styling.

### 07:20 UTC — [PR #543](https://github.com/dhnpmp-tech/dcp-platform/pull/543) — `fix(v2): keep admin actions in the v2 workspace`

Included:
- Kept `/v2/admin` primary task, readiness, finance, support, incident, fleet, and lane actions anchored inside the v2 command center instead of sending operators to legacy `/admin/*` pages.
- Removed the muted rail shortcut to the legacy admin console and the provider-detail escape hatch that had no v2 route equivalent yet.
- Preserved the existing verified backend reads and guarded mission/provider writes; this change only adjusts visible navigation and operator workflow flow.
- Added static regressions that forbid visible legacy admin links, generated legacy action links, and legacy prefetch handling inside the v2 admin surface.

### 07:01 UTC — [PR #542](https://github.com/dhnpmp-tech/dcp-platform/pull/542) — `feat(v2): add admin session lock`

Included:
- Added a visible Lock action to `/v2/admin` so operators can clear the local admin key from a shared or agent-assisted browser session.
- The lock action removes `dc1_admin_token`, returns the command center to the missing-key state, and routes back to the existing v2 admin sign-in flow.
- In-flight admin loads are now generation-gated so a stale dashboard refresh cannot restore the ready view after Lock clears the token.
- Kept the control local-only: no backend session mutation, provider action, payment action, or operational write is triggered.
- Added static regressions for token clearing, missing-key state transition, sign-in redirect reuse, and scoped lock-button styling.

### 06:52 UTC — [PR #541](https://github.com/dhnpmp-tech/dcp-platform/pull/541) — `feat(v2): add admin operator brief`

Included:
- Added a read-only Operator brief near the top of `/v2/admin` that turns loaded admin evidence into a daily operating posture for founders and agents.
- Prioritized serving proof, money queue, support evidence, mission ownership, and incident watch into owner-labeled next actions.
- Elevated serving proof as the sprint blocker while public capacity is not ready, with direct links back to the evidence sections instead of unsafe actions.
- Kept the brief as prioritization only; repairs, money movement, provider actions, and public capacity changes remain in verified consoles.
- Added static regressions for operator-brief evidence derivation, highest-priority selection, read-only policy copy, and scoped styling.

### 06:42 UTC — [PR #540](https://github.com/dhnpmp-tech/dcp-platform/pull/540) — `feat(v2): add admin serving proof packet`

Included:
- Added a read-only Serving proof packet to `/v2/admin` so founders and agents can see the next provider target from canonical probe evidence.
- Split serving readiness into route proof, inference proof, model proof, and publication proof so endpoint reachability can no longer be confused with usable inference capacity.
- Added concrete exit criteria before public capacity language changes: `verified_online=1`, `provider_count > 0`, and one metered inference proof.
- Kept the workflow evidence-only and linked back to the verified fleet console; no provider repair, routing, endpoint, catalog, or daemon mutation actions were added.
- Added static regressions for proof-target selection, proof checklist copy, exit criteria, and scoped styling.

### 06:28 UTC — [PR #539](https://github.com/dhnpmp-tech/dcp-platform/pull/539) — `feat(v2): add admin probe evidence`

Included:
- Added a protected read-only `/api/admin/fleet/probe-evidence` endpoint that exposes canonical provider probe gates for serving recovery.
- Merged endpoint reachability, endpoint probe failures, earned-online verifier state, cached-model evidence, WireGuard freshness, and heartbeat age into one bounded admin evidence feed.
- Wired the v2 admin Serving recovery workflow to the new probe-evidence feed, with fallback to the existing fleet-health feed when canonical evidence is unavailable.
- Added summary counters for endpoint-route blockers, earned-inference blockers, inference timeouts, model coverage gaps, ready providers, and recovery focus groups.
- Kept the endpoint evidence-only: no live probes, provider repairs, endpoint edits, routing flips, or catalog state mutations run from this v2 surface.
- Added static regressions for the backend evidence contract, v2 admin wiring, bounded preview rendering, evidence timestamp copy, and unsafe mutation boundaries.

### 06:14 UTC — [PR #538](https://github.com/dhnpmp-tech/dcp-platform/pull/538) — `feat(v2): add admin serving recovery`

Included:
- Added a read-only v2 admin serving recovery workflow for the zero verified-serving provider state.
- Derived recovery focus from fleet evidence: endpoint reachability, earned-online inference probes, timeout errors, model coverage, WireGuard freshness, heartbeat freshness, and job/runtime stability.
- Added a recovery playbook for proving `/v1/models`, one-token inference, and model alias coverage before changing catalog or public capacity language.
- Kept daemon restarts, tunnel changes, endpoint edits, routing changes, and public capacity flips outside v2 until audited recovery actions exist.
- Added static regressions for recovery queue wiring, mutation boundaries, and scoped serving-recovery styling.

### 06:02 UTC — [PR #537](https://github.com/dhnpmp-tech/dcp-platform/pull/537) — `feat(v2): add admin support operations`

Included:
- Added a protected read-only `/api/admin/support/contacts` endpoint for saved public support submissions, with bounded pagination, category summary, and recent-24h counts.
- Added a v2 admin support desk that correlates contact submissions with bounded renter, job, and payment evidence for customer triage.
- Kept support actions read-only in v2 admin; suspensions, credits, balance edits, job cancel/requeue, refunds, and key rotation stay in verified consoles until an audited action envelope exists.
- Removed the remaining prototype-style "Demo" label from the v2 home mobile menu and replaced it with a concrete quickstart label.
- Added static regressions for support-contact read contracts, v2 support UI wiring, mutation boundaries, and public demo-language cleanup.

### 05:45 UTC — [PR #536](https://github.com/dhnpmp-tech/dcp-platform/pull/536) — `fix(public): clarify serving capacity and remove stale savings claims`

Included:
- Added explicit heartbeating, endpoint-reachable, and verified-serving provider counts to `/api/health` and `/api/health/detailed` so operators can distinguish daemon heartbeat from usable inference capacity.
- Added a machine-readable health capacity reason and serving gates for zero-capacity states instead of implying WireGuard alone explains every empty marketplace state.
- Removed the remaining unsourced competitor-savings claims and fixed comparison table from the legacy model catalog page.
- Replaced the shared footer's stale "50+ models" claim with non-numeric catalog readiness copy.
- Reworded the v2 enterprise classification bullet so the public homepage does not imply a specific NDMO compliance artifact before that pack exists.
- Added static regressions for public honesty copy and health capacity wording.

### 05:29 UTC — [PR #535](https://github.com/dhnpmp-tech/dcp-platform/pull/535) — `feat(v2): add admin runbook queue`

Included:
- Added a read-only founder runbook queue to `/v2/admin` that translates launch, fleet, finance, incident, access, and mission signals into owner-specific next actions.
- Derived runbook evidence from the already-loaded admin feeds instead of adding a new backend endpoint or static operating checklist.
- Labeled each runbook with owner, evidence, severity, and agent permission class so humans and agents can coordinate without guessing who should act next.
- Kept repairs, money movement, deploys, provider actions, notification sends, and control-plane writes out of the runbook surface; verified consoles remain the action boundary.
- Added static regressions for runbook presence, public-capacity gating, finance/incident/access runbooks, no unsafe mutation endpoints, and scoped runbook styling.

### 05:21 UTC — [PR #534](https://github.com/dhnpmp-tech/dcp-platform/pull/534) — `feat(v2): add admin launch readiness`

Included:
- Added a first-class founder go/no-go launch readiness section to `/v2/admin` for public-capacity, system-health, finance, security, queue, demand, and incident blockers.
- Wired the section to existing read-only admin evidence feeds, including `/api/admin/metrics` and `/api/admin/demand`, without adding new mutation routes.
- Made public capacity readiness depend on earned serving capacity, endpoint/model readiness, and fleet evidence before the team can safely claim marketplace availability.
- Kept provider repair, payment actions, deploys, and control-plane runs out of this v2 surface; the section is decision support only.
- Added static regressions for launch readiness wiring, public-capacity honesty copy, read-only policy copy, no unsafe mutation endpoints, and scoped launch styling.

### 05:10 UTC — [PR #533](https://github.com/dhnpmp-tech/dcp-platform/pull/533) — `feat(v2): add admin incident command`

Included:
- Added a first-class read-only incident command section to `/v2/admin` for merged incident timeline rows, recent daemon/job errors, and control-plane capacity signals.
- Wired the section to the existing `/api/admin/incidents/feed`, `/api/admin/errors`, and `/api/admin/control-plane/signals` feeds without adding new operational mutation paths.
- Added severity summaries, row-level incident evidence, control-plane recommendation context, and links back to the verified incidents/fleet consoles for safe follow-up.
- Kept control-plane snapshots, prewarm runs, run-cycle triggers, and daemon repair out of v2 admin until each action has explicit owner, approval, audit, and rollback rules.
- Added static regressions for incident feed wiring, row normalization, read-only policy copy, no control-plane mutation endpoints, and scoped incident styling.

### 04:59 UTC — [PR #532](https://github.com/dhnpmp-tech/dcp-platform/pull/532) — `feat(v2): add admin fleet readiness blockers`

Included:
- Added a first-class fleet readiness section to `/v2/admin` for inference-serving blockers from the existing `/api/admin/fleet/health` and `/api/admin/fleet/alerts` feeds.
- Surfaced row-level provider evidence for earned-online verification, endpoint reachability, WireGuard freshness, heartbeat freshness, cached model coverage, running jobs, and restart risk.
- Added fleet readiness navigation, summary gates, blocked-provider cards, alert evidence, and a link back to the verified fleet console for safe action.
- Kept provider pause/resume, endpoint edits, WireGuard repair, and routing changes out of v2 admin until v2 fleet actions have explicit audit and rollback rules.

### 04:49 UTC — [PR #531](https://github.com/dhnpmp-tech/dcp-platform/pull/531) — `feat(v2): add admin finance review`

Included:
- Added a first-class finance review section to `/v2/admin` for refund requests, provider payouts, billing exceptions, and auto-top-up issues from the existing `/api/admin/payments/audit` feed.
- Added finance review navigation, queue counters, row-level evidence, and links to the verified payments and withdrawals consoles for safe human action.
- Kept refund approval/rejection, payout sync, and balance-changing actions out of v2 admin until the v2 money-action envelope is separately audited.
- Added static regressions for finance row wiring, review-only policy copy, no direct payment mutation endpoints, and scoped finance styling.

### 04:35 UTC — [PR #530](https://github.com/dhnpmp-tech/dcp-platform/pull/530) — `feat(v2): add admin mission action desk`

Included:
- Added a guarded mission action desk to `/v2/admin` so founding-team operators can move task status, reassign work, and record evidence notes without leaving the v2 surface.
- Reused the existing mission backend write routes (`PATCH /api/mission/tasks/:id`, `POST /api/mission/tasks/:id/reassign`, and `POST /api/mission/tasks/:id/comments`) instead of introducing a new experimental admin mutation API.
- Kept mission task creation and deletion out of v2 admin; the action desk only supports bounded operational updates through the current admin token and mission write gate.
- Added static regressions for mission action wiring, strict-vs-legacy write posture copy, no delete/create controls, and action-desk styling.

### 04:26 UTC — [PR #529](https://github.com/dhnpmp-tech/dcp-platform/pull/529) — `feat(v2): add admin audit trail`

Included:
- Added a read-only recent audit trail to `/v2/admin` so founding-team operators can see the latest guarded admin actions without leaving the v2 surface.
- Wired the panel to `/api/admin/audit?limit=8`, supporting both the current `entries` response and the older `audit_log` shape.
- Kept full audit pagination in the current admin security console while v2 shows the latest evidence cards for quick accountability checks.
- Added static regressions for audit endpoint wiring, payload normalization, empty-state copy, and audit-trail styling.

### 04:19 UTC — [PR #528](https://github.com/dhnpmp-tech/dcp-platform/pull/528) — `feat(v2): add admin notification posture`

Included:
- Added an admin-only `/api/admin/notifications/posture` endpoint for safe alert-channel readiness without returning raw webhook URLs, Telegram bot tokens, or Telegram chat IDs.
- Added a v2 admin notification-routing panel so founders can see whether human and agent alerts have active channels, redacted destinations, and an explicit agent notify policy.
- Kept notification test sends and channel edits out of v2 admin; the panel is read-only until event allowlists, approval notes, and audit envelopes are explicit.
- Added static regressions for safe notification posture redaction, v2 posture wiring, notification panel styling, and avoiding the raw legacy notification config payload.

### 04:12 UTC — [PR #527](https://github.com/dhnpmp-tech/dcp-platform/pull/527) — `fix(mission): add strict write auth gate`

Included:
- Added a dormant `DCP_MISSION_STRICT_WRITE_AUTH` guard for mission mutations so task, comment, milestone, and goal writes can be hardened to admin token or `x-mission-agent-key` without changing default production behavior.
- Kept read endpoints and the read-only `/mission/pr-state` proxy on the existing authenticated-read path.
- Switched mission-agent-key comparison to a timing-safe helper and added a stable `mission_write_forbidden` response for strict-mode write denials.
- Added static regressions to keep every mission mutation on `requireWriteAuth` while preserving the read-only PR-state proxy behavior.

### 04:04 UTC — [PR #526](https://github.com/dhnpmp-tech/dcp-platform/pull/526) — `feat(v2): expose admin access governance`

Included:
- Added an admin-only `/api/admin/access/policy` posture endpoint that reports admin token/IP allowlist configuration, mission write mode, mission-agent-key presence, and agent permission readiness without returning secret values.
- Added a v2 admin access-governance panel so founders can see whether mission writes are still on the legacy authenticated-write path or hardened behind the strict admin/agent gate.
- Kept v2 admin task mutation controls out of the interface; guarded agent writes remain blocked until `DCP_MISSION_STRICT_WRITE_AUTH` is enabled and audited.
- Added static regressions for the backend policy route, secret non-disclosure, v2 access cards, access ladder, and strict-vs-legacy mission write labels.

### 03:50 UTC — [PR #525](https://github.com/dhnpmp-tech/dcp-platform/pull/525) — `feat(v2): add admin mission control mirror`

Included:
- Added a read-only mission-control layer to `/v2/admin` so founders can see open work, blocked tasks, active goals, shipped-in-24h pulse, and the human/agent roster without leaving the v2 admin surface.
- Wired the section to real `/api/mission/*` endpoints using the existing admin token: overview, open tasks, assignees, goals, and 24h pulse.
- Kept task writes out of v2 admin for now; the section links to `/mission` for the full board while role delegation, agent write keys, and audit approval rules remain separate hardening work.
- Added static regressions for the mission API dependencies, read-only mission policy, roster/task ownership copy, and mission-control styling.

### 03:38 UTC — [PR #524](https://github.com/dhnpmp-tech/dcp-platform/pull/524) — `fix(v2): remove stale homepage capacity table`

Included:
- Removed the remaining illustrative GPU-class marketplace table from `/v2/home` so the public site no longer looks like it has static provider inventory.
- Replaced the table with an explicit capacity truth panel that names the real publication gates: endpoint reachability, earned-online verification, and model coverage.
- Kept the zero-capacity meter and `/status` link as the correct public state while providers or WireGuard tunnels are not serving verified inference.
- Added static regressions to prevent hard-coded GPU classes, token-metered inventory rows, and old marketplace-table markup from returning.

### 03:30 UTC — [PR #523](https://github.com/dhnpmp-tech/dcp-platform/pull/523) — `fix(v2): close public website gaps`

Included:
- Made the v2 homepage capacity meter render as zero until live endpoint, model-coverage, and earned-online checks pass, and routed visitors to `/status` for live availability.
- Reworded v2 provider setup requirements so static minimums are not presented as browser-detected hardware telemetry before the daemon runs.
- Removed the decorative docs search input and its unused styles from `/v2/docs`.
- Added `robots.txt` and a Next.js sitemap route so `/robots.txt` and `/sitemap.xml` no longer 404.
- Added static regressions for homepage capacity honesty, provider setup wording, docs anchors/search chrome, and site index files.

### 03:11 UTC — [PR #522](https://github.com/dhnpmp-tech/dcp-platform/pull/522) — `feat(v2): add guarded provider approval desk`

Included:
- Added a v2-native provider approval desk to `/v2/admin` so founding-team operators can review pending providers without dropping into the legacy provider table first.
- Wired approve/reject actions to the audited `/api/admin/providers/:id/approval-decision` route instead of the older legacy shortcut endpoints.
- Kept the workflow one-provider-at-a-time, labeled as a guarded write, and required a clear rejection reason before sending a reject decision.
- Surfaced SLA age, queued time, audit-envelope language, and a legacy detail link beside each pending provider decision.
- Added static regressions for the approval desk, audited PATCH route, rejection reason guard, and approval desk styling.

### 02:53 UTC — [PR #521](https://github.com/dhnpmp-tech/dcp-platform/pull/521) — `feat(v2): expand admin operational dashboard`

Included:
- Expanded `/v2/admin` from a first command-center shell into a broader read-only operations surface for founding-team workflows.
- Added v2 admin reads for provider approvals, earned fleet health, fleet alerts, finance reconciliation, recent errors, and control-plane signals.
- Added a launch-readiness board that treats verified serving capacity, fleet alerts, money queues, reconciliation, incidents, and control-plane signals as first-class operating checks.
- Added fleet, finance, and incident/control-plane lanes so humans and future agents can see the current risk areas without jumping through multiple legacy pages.
- Kept provider/payment/fleet mutations out of v2 admin for now; guarded writes still route to the existing admin console until explicit v2 approval flows are built.
- Added static regressions for the new admin API dependencies, read-only policy, readiness board, and operational lane styling.

### 02:41 UTC — [PR #520](https://github.com/dhnpmp-tech/dcp-platform/pull/520) — `fix: align provider online truth and retire stale brand docs`

Included:
- Fixed `/api/providers/online` so the public provider list no longer treats heartbeat-only daemon claims as live marketplace capacity.
- Required a fresh backend endpoint reachability verdict before a provider can appear as public `is_live`, then applied the existing earned-routing policy so stale positive probes and freshly failed verification probes are excluded.
- Removed the retired public brand-guideline HTML artifact and iframe wrapper page from the deployed app.
- Redirected stale `/docs/DCP-BRAND-GUIDELINES-v3.html` and `/docs/brand` traffic to the current v2 docs surface.
- Added regressions for heartbeat-only provider false positives, freshly failed earned probes, and retired public brand-doc artifacts.

### 01:47 UTC — [PR #519](https://github.com/dhnpmp-tech/dcp-platform/pull/519) — `fix(v2): retire public prototypes and align catalog honesty`

Included:
- Removed the retired v2 design handoff/prototype files from `public/dcp-v2` so mockup HTML, demo pages, and design-reference README content are no longer deployed as public production URLs.
- Redirected stale `/dcp-v2/*` requests to the real `/v2/home` surface.
- Redirected retired `/models` traffic to the v2 renter playground instead of the legacy marketplace.
- Tightened `/v2/home` copy so it no longer promises an immediate working inference call or hard-coded token-throughput range when no verified serving model is present.
- Aligned `/api/models` and `/api/models/catalog` availability with the inference path by requiring a reachable endpoint, fresh heartbeat, inference support, earned-routing policy, and a cached model/alias match before a provider counts as available.
- Made `/api/models/:model_id/deploy` return `409 model_unavailable` instead of a ready deploy handoff when no verified provider can currently serve the model.
- Removed stale `DC1`, fixed-percent revenue, and fixed model-count claims from provider/renter welcome email copy.
- Added regressions for retired public prototypes, v2 redirect hygiene, and model-catalog honesty.

### 21:37 UTC — [PR #518](https://github.com/dhnpmp-tech/dcp-platform/pull/518) — `fix(v2): keep public CTAs on honest v2 surfaces`

Included:
- Kept `/v2/home` public CTAs inside v2 routes for renter setup, provider setup, and the model playground instead of sending visitors through legacy marketplace/setup pages.
- Replaced the fabricated homepage provider marketplace table and randomized live metrics with honest verified-capacity policy copy.
- Removed the animated fake provider counter from `/v2/provider-setup`.
- Aligned visible provider-share copy and the provider setup estimator to the 85/15 provider/platform split.
- Added static regressions for v2 public link hygiene, fake provider names, simulated live telemetry, fake counters, and stale rev-share copy.

### 21:30 UTC — [PR #517](https://github.com/dhnpmp-tech/dcp-platform/pull/517) — `fix(v2): stop prefetching legacy admin links`

Included:
- Disabled Next.js prefetching on legacy `/admin` fallback links from `/v2/admin` so the live command center does not emit harmless RSC fallback console errors.
- Kept the legacy admin console reachable for guarded operations while leaving v2-native links on normal navigation behavior.
- Added a static regression to keep legacy admin links classified and non-prefetching.

### 21:08 UTC — [PR #516](https://github.com/dhnpmp-tech/dcp-platform/pull/516) — `feat(v2): add admin command center`

Included:
- Added `/v2/admin` as the first v2-style admin command center for founding-team operations and future agent participation.
- Synthesized a human-readable Ops Inbox from verified admin APIs: dashboard stats, payments audit, system health, security summary, and provider supply context.
- Added an agent permission ladder and task envelope model so agents can read, notify, and propose by default while guarded writes remain human-approved.
- Updated v2 admin auth to land operators on `/v2/admin` while keeping the existing `/admin` console linked as the proven operations fallback.
- Added static regressions for the v2 admin route, API dependencies, auth guard, and agent-aware workflow model.

### 20:28 UTC — [PR #515](https://github.com/dhnpmp-tech/dcp-platform/pull/515) — `fix(v2): keep admin sign-in on v2 auth`

Included:
- Kept the `/v2/auth` "Need admin access?" path inside the v2 auth design instead of sending operators through the old `/login` page.
- Added a v2-styled admin API-key form that validates against `/api/admin/dashboard`, stores `dc1_admin_token`, creates the shared admin session, and opens the existing `/admin` console.
- Added a static regression so v2 auth cannot reintroduce the old admin-login detour.

### 20:14 UTC — [PR #514](https://github.com/dhnpmp-tech/dcp-platform/pull/514) — `fix(v2): gate setup console shortcut on auth`

Included:
- Changed the `/setup` top-right action so clean browsers are sent to renter auth instead of seeing a misleading console shortcut.
- Kept the console shortcut available only after the stored renter key is verified against `/api/renters/me`.
- Added a static regression test for the authenticated setup action.

## 2026-06-02

### 12:37 UTC — [PR #493](https://github.com/dhnpmp-tech/dcp-platform/pull/493) — `fix: dedupe explicit admin audit mutations`

Included:
- Skipped generic admin audit rows for payout and payment-refund mutation routes that already write explicit audit rows.
- Added production mount-order regression tests for refund approve/reject so the `/api/admin` middleware cannot duplicate those audit records again.
- Verified with focused backend syntax checks, refund-request tests, payout audit-dedupe tests, and `git diff --check`.

### 12:34 UTC — [PR #492](https://github.com/dhnpmp-tech/dcp-platform/pull/492) — `fix: polish admin refund audit table`

Included:
- Showed Moyasar payment IDs and original payment amount beside refund-request amounts on `/admin/payments`.
- Fixed refund action success copy so reject actions render `rejected`, not `rejectd`.
- Made refund requests the default payments audit tab and updated the page intro.
- Verified with `npm run build`, standalone TypeScript check after Next type generation, and `git diff --check`.

### 12:31 UTC — [PR #491](https://github.com/dhnpmp-tech/dcp-platform/pull/491) — `docs: sync public openapi spec`

Included:
- Synced `public/docs/openapi.yaml` from the maintained `docs/openapi.yaml`.
- Ensured the deployed `/docs/openapi.yaml` link includes refund-request API documentation.
- Left `backend/openapi/dcp.yaml` unchanged because it is the narrower vendored `dcp-contracts` response-validation spec.
- Verified YAML parsing for all OpenAPI specs, byte identity between maintained and public specs, refund-route presence, and `git diff --check`.

### 12:28 UTC — [PR #490](https://github.com/dhnpmp-tech/dcp-platform/pull/490) — `fix: share model alias routing matcher`

Included:
- Moved alias-aware model matching into `backend/src/lib/model-aliases.js` as a shared helper.
- Used the shared matcher for multi-engine `provider_engines.served_models`, legacy `cached_models` routing, and `/api/providers/model-catalog` provider counts.
- Added regressions for Qwen2.5-VL, BGE, ALLaM, and Llama aliases.
- Verified syntax checks, 69 focused backend tests, and `git diff --check`.

### 12:20 UTC — [PR #489](https://github.com/dhnpmp-tech/dcp-platform/pull/489) — `chore: remove stale horizontal logo asset`

Included:
- Removed unused `public/dcp-logo-horizontal.webp`.
- Confirmed the removed file was actually a 128x128 PNG with a `.webp` extension.
- Kept `README.md` on the crisp SVG logo.
- Closed [issue #480](https://github.com/dhnpmp-tech/dcp-platform/issues/480).
- Verified no remaining source references and `git diff --check`.

### 12:17 UTC — [PR #488](https://github.com/dhnpmp-tech/dcp-platform/pull/488) — `docs: document refund request payment APIs`

Included:
- Added OpenAPI coverage for renter-created payment refund requests.
- Documented `/api/admin/payments/audit` refund queue output and admin refund approve/reject actions.
- Added the `PaymentRefundRequest` schema.
- Folded duplicate `/api/renters/me` and `/api/providers/me` path entries so `docs/openapi.yaml` strict-parses cleanly.
- Verified strict YAML parsing, duplicate path scan, refund-request backend tests, and `git diff --check`.

### 11:52 UTC — [PR #487](https://github.com/dhnpmp-tech/dcp-platform/pull/487) — `fix: make WireGuard registration rollback on persistence failure`

Included:
- Hardened `/api/providers/wg/register` and `/api/providers/wg/install-config`.
- Removed live `wg` peer additions when provider DB persistence fails.
- Kept old peers in place until new WireGuard key/IP state is persisted, then removed stale peers best-effort.
- Replaced WireGuard shell command strings with `execFileSync` argument arrays.
- Added regression coverage for [issue #358](https://github.com/dhnpmp-tech/dcp-platform/issues/358).
- Verified provider WG tests, WG diagnostics tests, hardcoded infra/security tests, syntax checks, and `git diff --check`.

### 11:13 UTC — [PR #486](https://github.com/dhnpmp-tech/dcp-platform/pull/486) — `docs: refresh changelog follow-up note`

Included:
- Updated the changelog follow-up note so it no longer listed refund requests or pricing refresh as future work after those PRs merged.
- Verified with `git diff --check`.

### 10:58 UTC — [PR #485](https://github.com/dhnpmp-tech/dcp-platform/pull/485) — `feat: refresh public pricing page`

Included:
- Replaced the stacked pricing page with a denser editorial pricing surface using existing DCP dark tokens and Instrument Serif display heading.
- Exposed auto-top-up behavior, the `402 insufficient_balance` pre-flight gate, starter credit order, and refund/admin review path.
- Added per-model-class token-rate table, subscription discount math, and GPU-hour floor table.
- Verified with `npm run build`, Playwright desktop/mobile visual checks, and `git diff --check`.

### 10:51 UTC — [PR #484](https://github.com/dhnpmp-tech/dcp-platform/pull/484) — `feat: add payment refund request workflow`

Included:
- Added `POST /api/payments/:id/refund-request` for renter-created refund requests on paid top-ups.
- Added migration 023 and inline schema for `payment_refund_requests`.
- Added the one-open-request-per-payment guard.
- Added refund requests to the admin payments audit screen with approve/reject actions.
- Added a Moyasar payment refund helper for live Moyasar refunds, with internal/manual semantics for sandbox, no-key, and bank-transfer records.
- Verified refund-request tests, payout audit-dedupe tests, backend syntax checks, `npm run build`, and `git diff --check`.

### 10:44 UTC — [PR #483](https://github.com/dhnpmp-tech/dcp-platform/pull/483) — `fix: require backend liveness verdict for routing`

Included:
- Required catalog, legacy routing, and multi-engine routing to have a positive backend endpoint probe verdict before treating a provider as serviceable.
- Persisted consecutive provider probe failures in `providers.endpoint_probe_failures`.
- Added tests for probe persistence and heartbeat-only routing exclusion.
- Verified provider-probe tests, multi-engine routing tests, backend syntax checks, and `git diff --check`.

### 10:37 UTC — [PR #482](https://github.com/dhnpmp-tech/dcp-platform/pull/482) — `ci: reclaim disk before sd worker build`

Included:
- Added an extra Docker/Buildx prune between instant LLM and SD worker image builds.
- Reduced the chance that the SD worker build starts with insufficient GitHub runner disk after the large vLLM image build.

### 10:35 UTC — [PR #481](https://github.com/dhnpmp-tech/dcp-platform/pull/481) — `ci: warn on skipped sentinel inference`

Included:
- Changed sentinel inference monitoring so skipped inference is a warning/alert condition, not a silent pass.
- Added auto-selection of an online model for the sentinel smoke request.
- Added a guard for long-running missing sentinel renter key configuration.

### 09:51 UTC — [PR #479](https://github.com/dhnpmp-tech/dcp-platform/pull/479) — `ci: add worker image disk cleanup`

Included:
- Added disk cleanup before scheduled worker-image Docker builds.
- Gave heavyweight vLLM/SDXL layers more GitHub runner headroom.

### 09:47 UTC — [PR #478](https://github.com/dhnpmp-tech/dcp-platform/pull/478) — `docs: sanitize dotenv changelog wording`

Included:
- Sanitized public changelog wording around dotenv and missing secrets.
- Kept the operational lesson without exposing sensitive implementation detail.

### 00:17 UTC — [PR #477](https://github.com/dhnpmp-tech/dcp-platform/pull/477) — `fix: settle queued v1 inference once`

Included:
- Removed the legacy queued-job pre-debit in `/v1/chat/completions`.
- Routed queued inference completion through the same `settleInferenceOnce` settlement path as direct provider proxying.
- Reduced double-charge and unreconciled-debit risk for queued inference.

### 00:12 UTC — [PR #476](https://github.com/dhnpmp-tech/dcp-platform/pull/476) — `fix(catalog): add bge and qwen alias discovery`

Included:
- Added BGE and Qwen alias discovery coverage.
- Improved catalog provider-count matching for cached `bge-m3` and Qwen2.5-VL variants.

### 00:07 UTC — [PR #473](https://github.com/dhnpmp-tech/dcp-platform/pull/473) — `security: scrub hardcoded secrets/infra from source + tighten secret scan`

Included:
- Removed hardcoded production Telegram fallback token/chat values from heartbeat channel code.
- Moved WireGuard server endpoint use to required environment configuration.
- Sanitized sensitive public changelog wording.
- Added a Telegram bot token gitleaks rule.
- Expanded hardcoded production infra/security regression tests.

## 2026-06-01

### 22:37 UTC — [PR #472](https://github.com/dhnpmp-tech/dcp-platform/pull/472) — `docs: remove obsolete OpenAPI duplicates`

Included:
- Removed obsolete duplicate OpenAPI YAML files.
- Retargeted API guide links to the maintained `docs/openapi.yaml` spec.

### 22:32 UTC — [PR #471](https://github.com/dhnpmp-tech/dcp-platform/pull/471) — `chore: clean public repo surface`

Included:
- Cleaned the public repository surface for the renamed `dcp-platform` repo.
- Removed internal coordination notes, agent handoffs, private planning docs, generated reports, stale workflow files, disabled source copies, and build artifacts from the tracked tree.
- Added public repository orientation through `README.md`, `REPO_MAP.md`, folder `OVERVIEW.md` files, and a pull request template.
- Updated GitHub repository metadata with public description, homepage, and topics.
- Added ignore rules for local/private docs, generated installer outputs, local agent state, build artifacts, and runtime data.

## Backfill Notes

- PRs before #471 are not yet fully backfilled into this root changelog.
- Older deep engineering notes remain in [`docs/CHANGELOG.md`](docs/CHANGELOG.md) until they are converted into this PR-based format.
