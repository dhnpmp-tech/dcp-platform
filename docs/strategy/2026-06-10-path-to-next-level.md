# DCP — The Path to the Next Level

*2026-06-10 · synthesized from a live four-track audit: real renter signup on prod, three-persona provider funnel, full code-gap sweep, and source-cited market research. Every claim below is verified or cited; nothing is aspirational dressed as fact.*

---

## 1. Where DCP actually stands (the audit's verdict)

**The engine works. The front door was stuck.**

- **Renter funnel: WORKS, verified live.** A stranger completed signup → magic link → API key → 100 SAR starter credit → first billed inference call in **~2–4 minutes** (email latency dominates). Billing debited exactly 2 halala for the call. Idempotent, double-credit-proof, honest 503s with ranked alternatives. One sabotage: the official quickstart hardcoded `allam-7b` (0 providers) — the user's first documented call was a guaranteed 503. **Fixed 2026-06-10.**
- **Provider funnel: was 100% broken for every OS** — not by architecture, by a *typo*: the wizard's install endpoint read `dc1-setup-*` template filenames where only `dcp-setup-*` exist (404), the canonical `install.sh` URL 403'd on an nginx permission, the OS cards advertised artifacts that never existed (.msi, .dmg), and `dcp.sa/setup` (hard-linked from the desktop app) bounced providers into the *renter* wizard. **This is why the fleet stagnated at 4 providers and lifetime earnings are 43.78 SAR — nobody could join since the v2 flip.** All four issues **fixed 2026-06-10**.
- **The honest-marketplace machinery — the brand moat — is real**: earned-online verification, live capacity gates, server-measured billing, restart-proof pod reaping. It survives adversarial inspection. Competitors' pages do not.
- **Money is rails-complete but switched off**: Moyasar env keys absent → card top-up, auto-topup, payouts all dormant; pods launch entirely unbilled; providers accrue dashboard numbers, not money.

**Strategic read:** this is a *good* audit result. The hard parts (verification mesh, billing integrity, WireGuard fabric, dual-product surface) exist and work. What stood between DCP and growth was a handful of one-line bugs and unset env vars. The loop can be closed in days, not quarters.

## 2. The persona map — seamless for whom, as of today

| Persona | State after 2026-06-10 fixes | Remaining gap |
|---|---|---|
| Saudi gamer, Windows RTX | `.exe` + PowerShell one-liner both work; wizard honest | Daemon doesn't survive reboot (autostart `enable()` never called) |
| MacBook (Apple Silicon) | `install.sh` works: MLX engine, WireGuard, launchd persistence | Wizard requirements row omits Apple Silicon (shows RTX-only) |
| Linux GPU box | `install.sh` works end-to-end incl. systemd persistence | No GUI path; fine for this persona |
| Any new provider | Registers, heartbeats, shows "connected" | **Silent zero-earnings trap**: `approval_status='pending'` blocks routing with no UI feedback → auto-approve on first verified heartbeat, or show "awaiting approval" |
| Renter — inference | Full loop works, billed, 100 SAR trial | Card top-up off (Moyasar keys); catalog lists 33 models, 5 servable — sort available-first |
| Renter — compute (pods) | Launch → Jupyter+SSH works, deadline-enforced | **Unbilled** (free GPUs); provider earns nothing for pods; ~100-line fix on existing rails |

## 3. The path — three phases, each gated by a measurable loop

### Phase 0 — Close the money loop (this week, mostly hours of work)
1. ✅ ~~Unblock provider funnel~~ (shipped today).
2. ✅ ~~Fix renter quickstart~~ (shipped today).
3. **Pods billing** (~100 lines, rails exist): pre-debit quote at launch from `cost_per_gpu_second_halala`, settle on stop/reap via the existing job-result path, concurrent-pod quota. Also fixes the twin bug: pods currently pay providers nothing.
4. **Switch on Moyasar** (Peter, ~30 min + 1-SAR smoke): `MOYASAR_SECRET_KEY` (sk_live), `MOYASAR_WEBHOOK_SECRET`, `MOYASAR_PAYOUT_SOURCE_ID`, `DCP_BANK_IBAN`. Until then, make the 402 message honest about which top-up paths are live.
5. **Auto-approve providers** on first verified heartbeat (or surface "awaiting approval") — kill the silent zero-earnings trap.
6. **v1 queued-fallback ownership bug**: insert with `cost_halala=0` so failures can't mint refunds of money never debited (free-balance leak, found in audit).
- **Gate to Phase 1:** one real card top-up, one billed pod session, one provider payout (manual is fine) — money in, money out, end to end.

### Phase 1 — Prove demand with what we have (2–6 weeks)
The five quick wins, ordered by timing pressure:
1. **ALLaM-7B hosted API — the 48-hour-old wedge.** IBM watsonx *withdrew* `allam-13b-instruct` on **2026-06-08**; ALLaM-7B errors on HF's free inference API ("too large"). There is **no self-serve KSA-resident ALLaM endpoint anywhere**. We already ran ALLaM-7B on Node 2 under vLLM (awq_marlin, ~45 tok/s) — re-stand it, publish SAR pricing, post to the Arabic-NLP community. *Proof: ≥5 external keys consuming ≥1M billed tokens in 30 days.*
2. **Unsloth fine-tune pods** priced against vast.ai's 3090 rate (~SAR 0.53–0.68/hr; 3090 prices up ~84% since mid-2025 — demand is rising at exactly our tier). Bake one image: CUDA+torch+Unsloth+Jupyter with base weights cached. *Proof: 10 paid sessions ≥2 GPU-hrs from ≥5 renters, ≥30% repeat.*
3. **Tuwaiq / Year-of-AI student compute.** 2026 is officially Saudi's Year of AI; Tuwaiq's March hackathon had 1,500+ participants and no GPU sponsor. Student credit + verified-student rate. *Proof: one cohort agreement or 25 signups with ≥3 paid conversions.*
4. **PDPL-resident inference pilot.** 48 SDAIA enforcement decisions in 2025-26; SAMA/NCA require in-Kingdom data; hyperscaler Saudi regions still not live. One-page Arabic/English brief + DPA + direct pitch to 10 regulated-sector SMBs. *Proof: 1 signed paid pilot + 3 qualified compliance conversations in 45 days.*
5. **Arabic SMB support-agent in a box** (fixed SAR monthly, runs on our own inference). *Proof: 2 SMBs live and paying in 30 days.*
Plus fleet growth through the now-working funnel: target **10–25 providers** (the funnel produced ~zero for weeks; gamers + the Tuwaiq community are the pool). Flip the two shadow gates (accepting_jobs with hysteresis, heartbeat HMAC with real secret) once the fleet updates daemons.
- **Gate to Phase 2:** ≥20 paying renters across both products, ≥10 active providers, first month where provider payouts > 1,000 SAR.

### Phase 2 — The defensible position (the quarter)
- **gVisor isolation → compute GA** (the stated gate); datacenter-tier conversations from a position of working consumer mesh.
- **The ELM thesis**: fine-tune network on the pods + serve the long tail of Saudi expert models — every fine-tune pod session feeds catalog supply ("train it here, serve it here, earn from it here").
- **Raise on metrics, not narrative**: the Phase-1 proof numbers + live unit economics (cost-plus margin per token and per GPU-second are already in the billing code).

## 4. Why DCP wins (the investor story, honestly told)
We do not out-price vast.ai (Salad's $0.10/hr 3090 is the global floor) and we don't need to:
1. **Regulated money can't leave the Kingdom.** PDPL+SAMA buyers legally cannot use vast.ai/RunPod. We are the only self-serve KSA-resident GPU marketplace. That's a moat enforced by the regulator.
2. **The Arabic stack nobody serves.** ALLaM self-serve + Arabic-first catalog + SAR billing, two days after the only alternative (watsonx) exited.
3. **Honesty as engineering.** Earned-online listing, live-verified capacity, refuse-to-fake demo — auditable differentiation in a market notorious for stale listings.
4. **Per-token demand is exploding in our exact segment**: OpenRouter grew ~4× YoY to >20T tokens/week; qwen-family went 2.2%→12.7% of volume — the very models on our consumer cards.
5. **Asymmetric economics**: hosts' idle consumer GPUs (vast.ai hosts gross $0.30-0.60/GPU-hr) vs. Saudi enterprise paying for residency — the spread is the business.

## 5. Defect backlog (audit, prioritized — beyond Phase 0)
| P | Finding | Where |
|---|---|---|
| P0 | Pods unbilled + providers unpaid for pods | `pods.js` launch/stop, `providers.js` job-result |
| P0 | v1 queued-fallback can mint refunds (free balance) | `v1.js:3329` vs `providers.js:3892` |
| P1 | Desktop daemon: autostart never enabled → dies on reboot | `dcp-desktop lib.rs:5613`, `AutoSetup.tsx:113` |
| P1 | Silent zero-earnings approval trap | `providers.js` register vs routing gates |
| P1 | `?key=` sunset date rolls forward daily — never arrives | `server.js:320` |
| P1 | `TRUST_PROXY_HOPS` unset → IP rate limits may bucket everyone together | `server.js:50` + PM2 env |
| P2 | Job-result settlement not transactional (partial money state on crash) | `providers.js:3859-3940` |
| P2 | Welcome email contains plaintext API key | `auth.js:71` |
| P2 | Setup wizard collects use-case/workspace then drops them | `app/v2/setup/page.tsx` |
| P2 | Catalog: 33 listed / 5 servable, three alias conventions | `v1.js` catalog |
| P3 | Pod ID enumeration oracle (404 vs 403) | `pods.js:393` |
| P3 | Cross-device magic-link dead end (no short code in email) | `/v2/auth` |

## 6. Operating discipline that made today possible (keep doing)
- Every funnel claim gets a **live curl test in CI** (the provider funnel was dead for weeks because nothing exercised it).
- **Backend deploys are manual** until the auto-deploy is fixed — verify `git log -1` on the VPS after every backend merge.
- New surface = new smoke probe (the e2e smoke now self-selects a served model; extend it to the signup path and the provider setup-script download).
