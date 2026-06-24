# DCP Security — STATUS (single source of truth)

> Update this file at the END of every audit/fix. Run `/dcp-security-audit` to re-audit.
> **Last audit:** 2026-06-24 (KB-applied AI/ATLAS + multi-tenant + supply) · baseline 2026-06-23 (Tito/Croc) · **Last updated:** 2026-06-24 · **Overall posture:** all exploitable-today findings (web+backend AND AI/agent layer) CLOSED + verified live; fleet-level items STAGED with runbooks.

## Legend
✅ FIXED-LIVE (verified) · 🟢 ALREADY-FIXED (was stale in audit) · 🟡 STAGED (runbook, phased) · 🔴 OPEN · ⚪ ACCEPTED-RISK

## Dashboard
| ID | Sev | Title | Status | Where / verified |
|----|-----|-------|--------|------------------|
| C1 | crit | Renter `/login-email` returns master key | ✅ | renters.js → 410; `POST /api/renters/login-email`=410 (2026-06-24) |
| C2 | crit | Forgeable session cookie | ✅ | core already HMAC-signed; +SameSite=strict; live dcp.sa `__dc1_session` signed+strict (2026-06-24) |
| C3 | crit | Global HMAC secret in every daemon | 🟡 | runbooks/per-provider-taskspec…md — 6-phase, fleet-critical, multi-day. NOT started. |
| C4 | crit | Live renter key hardcoded in scripts | ✅ | key rotated dead (0 rows); scripts env-read (2026-06-24) |
| H1 | high | Plaintext API keys at rest | 🟡 | runbooks/…key-at-rest-hashing.md — phases 0-3 ok, Phase-4 drop hard-blocked |
| H2 | high | API keys in `?key=` | ✅ | gated reject behind `DC1_REJECT_QUERY_KEYS` (OFF; control wired) (2026-06-24) |
| H3 | high | API keys in localStorage | 🟡 | runbooks/frontend-localstorage…md — sealed-cookie proxy; frontend branch+preview |
| H4 | high | v1 billing TOCTOU / silent debit | 🟢 | already fixed by migration 021 (`billingService.settleInferenceOnce` atomic) |
| H5 | high | Unauth reconciliation API | ✅ | `router.use(requireAdminAuth)`; `/api/reconciliation/summary`=401 (2026-06-24) |
| H6 | high | Hardcoded MC token fallback | 🟢 | source already env-reads; token only in gitignored .next (rotate = ops) |
| H7 | high | Heartbeat HMAC enforcement off | 🟡 | tied to C3; enabling now = fleet 401 (proven+reverted). Enforce LAST. |
| H8 | high | HTTP/bare-IP backend defaults | ✅ | https defaults + prod build-guard; live on dcp.sa (2026-06-24) |
| H9 | high | Dependency CVEs | 🟡 | overrides staged in package.json; install = maintenance window (blue-green runbook) |
| M2 | med | Swagger UI from unpkg CDN | ✅ | pinned @5.17.14 + sha384 SRI (2026-06-24) |
| M3 | med | `curl\|bash` installer overridable base | ✅ | API_BASE pinned https://api.dcp.sa (2026-06-24) |
| M5 | med | Admin dashboard unauth sub-fetches | ✅ | forwards x-admin-token; live on dcp.sa (2026-06-24) |
| M7 | med | `/v1/models` unauthenticated | ✅ | + modelCatalogLimiter 100/min/IP (2026-06-24) |
| M1 | med | CORS no-Origin | 🟢 | env-gated (DCP_ALLOW_LOOPBACK_CORS) |
| M6 | med | Supabase anon key in .env.example | 🟢 | placeholder only; anon keys public-by-design w/ RLS |
| M8 | med | Payment verify on poll | ⚪ | Moyasar-ownership-gated, by design |
| L1-L7 | low | (cookie-secure, MFA, PDPL, body-limit, test-ratelimit, ls-doc, p2p-ip) | 🟢/⚪ | L4 body-limit already 2mb; L7 already redacted; L2 admin-MFA = staged (ops runbook) |

## AI / agent + multi-tenant + supply (KB-applied audit 2026-06-24 — `audits/2026-06-24-kb-apply.md`)
| ID | Sev | Title | Status | Where / verified |
|----|-----|-------|--------|------------------|
| AI-1 | crit | Nexus injection -> host shell -> secret exfil (tirith was OFF) | ✅ | tirith re-enabled fail_closed @ `/opt/data/bin/tirith`; Nexus restarted (2026-06-24) |
| AI-2 | high | Hardcoded OpenRouter key in Nexus config (agent-readable) | 🔵 | ROTATE — key leaked verbatim; OpenRouter dashboard (Peter). Then env-ref + audit .bak-* |
| AI-3 | high | Nexus auto-writes durable memory -> poisoning | ✅ | `memory.write_approval:true`; Nexus restarted (2026-06-24) |
| AI-4 | high | Spark guardrail fails-OPEN, tools armed | ✅ | `tirith_fail_open:false` + full path; Spark restarted (2026-06-24) |
| AI-5 | med | No agent/LLM red-team in CI | 🟡 | `/dcp-security-audit`+KB map ATLAS now; promptfoo suite = runbook |
| DCP-API-01 | high | Unauth agent-gateway (denial-of-wallet, LATENT) | ✅ | key-presence gate `DC1_GATEWAY_REQUIRE_KEY=1` + 60/min/IP; keyless=401 (2026-06-24). NB: upstream “plan exhausted” was MiniMax NON-PAYMENT, not an attack — never exploited; gated anyway (can route to metered upstream) |
| DCP-API-02 | high | Unauth provider/fleet enumeration | 🟡 | runbook: gate p2p/network/standup or sanitized marketplace view (verify FE dep) |
| DCP-API-03 | high | Unauth state-changing ops writes | ✅ | `requireAdminAuth` on recovery/resolve + fallback/simulate; both=401 (2026-06-24) |
| DCP-API-04 | low | Unauth container-registry disclosure | 🟡 | low; folds into API-02 read-gating |
| DCP-API-05 | med | Legacy api_key column lookup inconsistency | 🟡 | folds into H1 key-at-rest migration |
| DCP-API-06 | info | BOLA/IDOR | 🟢 | verified CLOSED (requireRenterRole ownership) — not a gap |
| POD-1 | crit | Renter pods root, no cap-drop/seccomp/no-new-priv/ro | 🟡 | runbook ai-agent-and-pod-isolation — daemon fleet change + soak |
| POD-2 | high | Arbitrary renter image (no allowlist/digest) | 🟡 | runbook — registry allowlist + digest pin |
| POD-3 | high | Shared docker0 bridge (no per-tenant netns) | 🟡 | runbook — per-pod network |
| POD-4 | high | Shared writable HF cache (cross-tenant poison) | 🟡 | runbook — :ro / per-tenant cache |
| POD-5 | high | Pod compromise leaks global HMAC | 🟡 | tied to C3 per-provider signing |
| POD-6 | med | DCP-41 test omits interactive-pod path | 🟡 | extend container-isolation.test.js |
| SC1 | crit | Daemon dist no out-of-band signature (fleet RCE) | 🟡 | runbook — detached sig (minisign/cosign), key off-box |
| SC2 | high | GitHub PAT in git remote URL | 🔵 | ops runbook (rotate + scrub) — already tracked |
| SC3 | high | WG mesh open + backend 0.0.0.0 mesh-reachable | 🟡 | runbook — bind lo+wg-gw; intra-mesh iptables |
| SC4 | med | install.sh unverified 3rd-party bootstrap | 🟡 | runbook — pin+checksum ollama/torch |
| SC5 | high | Backend dep CVEs | 🟡 | DUP of H9 (blue-green runbook) |

## Open / next actions (priority order)
1. 🟡 **C3+H7** per-provider task_spec re-key — `runbooks/per-provider-taskspec-signing-and-heartbeat-hmac-enforcement.md`. Reviewer fix required: also re-sign in `providers.js buildNextPendingJob()`. Multi-day (daemon adoption). Needs a GO.
2. 🟡 **H9** deps — run the blue-green install in a maintenance window (`runbooks/backend-dep-cve-bluegreen-runbook.md`). Overrides already staged.
3. 🟡 **H1** key-at-rest hashing — phases 0-3 (`runbooks/renter-provider-key-at-rest-hashing.md`); Phase-4 plaintext-drop stays blocked until all sites migrated + soaked.
4. 🟡 **H3** localStorage→sealed-cookie — frontend branch + Vercel preview (`runbooks/frontend-localstorage-key-exfil-to-sealed-cookie-proxy.md`).
5. 🔵 **Ops** — rotate MC token + git-history scrub of exposed secrets (incl. the PAT in the git remote) + admin MFA (`runbooks/ops-closures-…md`). Needs team coordination.
6. 🔵 **AI-2** — ROTATE the OpenRouter key NOW (leaked verbatim; OpenRouter dashboard, Peter), then env-ref it.
7. 🟡 **POD-1..6 / SC1 / SC3 / DCP-API-02** — `runbooks/ai-agent-and-pod-isolation-hardening.md` (daemon-fleet + mesh; soak/window).

## Requirements / prerequisites
- A maintenance/low-traffic window for H9 (dep install) and the C3 signing cutover.
- Tareq/team coordination for: git-history scrub (force-push + re-clone), MC-token rotation, PAT rotation.
- `DC1_KEY_PEPPER` decided ONCE before H1 backfill (pepper-version strategy in the runbook).
- ~24h+ daemon self-update soak before the C3 per-provider signing flip.
