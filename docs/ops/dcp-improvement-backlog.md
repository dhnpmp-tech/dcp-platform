# DCP Improvement Backlog

A prioritized backlog distilled from a deep-dive of the onboarding surfaces and
the `dcp-agent` / `dcp-desktop` / `dcp-contracts` repositories. Items are grouped
by priority: **P0** (launch credibility — the things that make us look broken or
untrustworthy to a first-time user), **P1** (architecture/trust — structural
debt that keeps biting us), and **P2** (hardening/DX — important, not blocking).

Each item carries a short rationale and the file hints we found while tracing it.
This is a living document; update status as items land.

---

## P0 — Launch credibility

### 1. Notify providers when their node goes offline

This is the root cause of the Node-2 silent failure: a provider's node can drop
offline and **nobody is told**. The backend liveness and health workers
(`backend/src/services/providerLivenessMonitor.js`, `providerHealthWorker.js`)
detect the transition but only `console.log` it — there is no email, no push, no
in-product signal. Meanwhile the desktop tray only checks the **local** daemon
PID, so it reports "online" even when the backend hasn't heard a heartbeat in
hours. The fix has three parts: (a) send an email on the `online → offline`
transition from the liveness worker, (b) have the desktop tray notify on the
same transition, and (c) base the tray's "online" indicator on the **backend
heartbeat** rather than a local process check. Until this lands, providers
silently earn nothing and assume everything is fine.

### 2. A renter's first `/v1` call must never dead-end

The single most damaging first impression is a renter making their first API
call and hitting a wall. We must guarantee an **always-on demo model** so there
is always something to call, and the playground (`app/renter/playground/page.tsx`)
must honor the backend's `503` alternatives / `Retry-After` envelope — surfacing
the suggested alternative model and retry timing — instead of rendering a dead
red error box. The contract already returns the right shape on `503`; the UI
just ignores it. A renter's first call returning "try this model in 12s" is a
world apart from "Error 503".

### 3. Resend-link on renter register success

Renter registration is a magic-link flow, which makes the sign-in email a single
point of failure: if it lands in spam or never arrives, the only affordance on
the "check your email" screen is a link back to the blank form. We should reuse
the **resend-with-cooldown** pattern already implemented on `app/login/page.tsx`
(a 60s countdown plus a re-POST to the OTP/register endpoint) and add a real
"Resend link" button to `app/renter/register/page.tsx`. The backend handles
`/renters/register` resends idempotently, so this is a UI-only change with no
backend risk. **(Shipped in this PR.)**

### 4. Fix broken renter links + env-leak top-up message

Two small but credibility-eroding bugs. First, the empty state in
`app/renter/models/page.tsx` links to `/provider-onboarding` (which 404s — the
real route is `/setup`) and to `/renter/waitlist` (which had no page). Second,
`app/renter/billing/page.tsx` renders the literal string
`NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY is not set` to end users when payments are
unconfigured — leaking an internal env-var name and reading like a crash. The
fix points the links at real routes and replaces the leak with a reassuring,
user-facing message about the welcome credit and card launch. **(Shipped in this
PR.)**

### 5. Remove the dev-only state-selector from the provider download page

`app/provider/download/page.tsx` (~line 243) ships a developer "state selector"
`<select>` that lets *any* visitor flip the onboarding state between
`waiting` / `heartbeat` / `ready` / `paused` / `stale`. That is a debugging tool
that leaked into production — it confuses real providers and implies the state
is something they set manually rather than something the backend heartbeat
drives. Remove it, or gate it strictly behind a dev-only check. **(Shipped in
this PR — gated behind `NODE_ENV === 'development'`.)**

---

## P1 — Architecture / trust

### 6. Consolidate the provider runtime to one owner

Today the provider runtime is split across three actors — the daemon, the Hermes
agent, and the desktop app — each with its own slice of heartbeat, WireGuard, and
model-pull responsibility. This split-brain is the structural reason behind a
whole class of "it says online but isn't" bugs. The daemon should be the single
owner of heartbeat, WireGuard, and model-pull; the Hermes agent's runtime scripts
should be removed. One owner, one source of truth.

### 7. Eliminate the bundled-daemon version skew

The desktop app currently ships with a bundled copy of the daemon, which drifts
out of sync with the platform daemon the backend expects. The desktop app should
**download the platform daemon** at install/update time instead of bundling a
frozen copy, so a provider always runs a daemon version the backend understands.

### 8. Unify the three onboarding paths + install commands

There are three divergent onboarding paths and multiple install-command builders,
each with its own hardware assumptions and run-mode handling. Consolidate to
**one install builder, one hardware matrix, and one run-mode enum** shared across
web onboarding, the desktop app, and the docs. Divergence here is why the install
instructions a provider sees don't always match what the daemon actually accepts.

### 9. Enforce `run_mode` / GPU-cap / temp-limit in the daemon

These provider preferences are collected during onboarding and stored, but the
daemon **ignores them at runtime**. A provider who caps their GPU or sets a temp
limit reasonably expects it to be honored; today it isn't. Wire the collected
`run_mode`, GPU cap, and temperature limit into the daemon's actual scheduling /
throttling behavior, or stop collecting them.

### 10. Surface provider reputation + earnings forecast

We already **compute** provider reputation and an earnings forecast — and then
show them to nobody. Surfacing these in the provider dashboard turns invisible
backend work into a trust and retention lever: providers can see how they rank
and what they can expect to earn, which is exactly the motivation a marketplace
supply side needs.

### 11. Make `dcp-contracts` actually enforced

`dcp-contracts` defines the API surface, but the backend doesn't validate its
own **responses** against it, so the contract can silently drift from reality.
Wire `express-openapi-validator` response-validation into the backend's test
environment so a response that violates the contract fails CI. A contract that
isn't enforced is just documentation that lies.

### 12. Close `dcp-contracts` coverage gaps

Several live surfaces have no contract coverage at all: the onboarding **wizard**,
**downloads**, **payments**, **payouts**, **channels/health**, and
**verification**. These are exactly the high-stakes money-and-onboarding paths
where a silent shape change does the most damage. Add contract definitions for
each so item #11's enforcement has something to enforce.

---

## P2 — Hardening / DX

### 13. Daemon update integrity + offline heartbeat telemetry

Harden the daemon self-update path with **SHA-256 verification** of the
downloaded binary before it's swapped in, and add **offline heartbeat
telemetry** so we can see *why* a node went quiet (network drop vs. crash vs.
clean shutdown) rather than guessing. This complements P0 #1: the notification
tells us a node is down; the telemetry tells us why.

### 14. Rebuild the stale VPS `dcp-agent.tar.gz`

The `dcp-agent.tar.gz` artifact served from the VPS is stale relative to the
current agent code. Rebuild and republish it so anyone pulling the agent from the
VPS gets the current version. (Lower priority once #6/#7 consolidate the runtime,
but still a live footgun until then.)

### 15. Contract release-train

Adopt an **expand → migrate → contract** release discipline for `dcp-contracts`,
backed by a published compatibility matrix, so contract changes roll out without
breaking existing clients. Additive (expand) first, migrate consumers, then
remove the old shape (contract) — never a breaking change in one step.

### 16. Provider earnings honesty + renter polish

Drop the **fake earnings ticker** on the provider side — showing fabricated
numbers is a trust landmine the moment a provider notices. On the renter side,
polish the experience: make the **catalog source** explicit, ship a
**key-injected quickstart** (so the copy-paste example already has the user's
key), publish **SDKs**, and add **budget caps** so a renter can bound spend.

### 17. Rotate the leaked Telegram bot tokens

Two Telegram bot tokens are **still live in public git history** and must be
rotated immediately: `@dcp_dev_bot` (`8291599718`) and `@NexusDatacenter_bot`
(`8397318012`). Rotating the tokens via BotFather invalidates the leaked ones;
update the secret store afterward. Treat this as a standing security item until
both are confirmed rotated.
