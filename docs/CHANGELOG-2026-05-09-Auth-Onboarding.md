# DCP Auth & Onboarding Changelog — 2026-05-09

**Trigger:** Tareq Abdul (RTX 3090, Ubuntu 22.04) tried to onboard as a
provider on Thursday 2026-05-07 and hit four blockers in 90 minutes. Fadi
hit overlapping issues a week earlier. This changelog tracks every fix
shipped between Thursday evening and Saturday morning.

**Audience:** Tareq, Fadi, the Nexus / DCP Agent assistants, anyone reading
the Telegram Dev/Team threads.

---

## Tareq's reported issues (Thu 2026-05-07, DC1 Nexus Group)

| # | Topic | What he saw | Root cause |
|---|---|---|---|
| 1 | topic 6 (Team Chat) | *"This email is already registered as a renter…"* | Hard cross-role guard (migration 006). |
| 2 | topic 6 | *"Invalid or expired code"* when entering OTP | OTP TTL too short + token-format normalization bug. |
| 3 | topic 6 | *"Rate limit exceeded"* on resend | Auth limiter capped at 5 / 15 min per IP. |
| 4 | topic 7 (Dev) | `ollama pull qwen3:35b` → *"pull model manifest: file does not exist"* | Tag does not exist in the Ollama library — only :32b does. |
| 5 | topic 7 (Dev) | `curl https://api.dcp.sa/api/providers/heartbeat` → 404 | Endpoint is POST-only; manual GET is correctly returning 404. |
| 6 | topic 7 (Dev) | *"its not downloading anything"* on `ollama list` | He was checking the LOCAL model list, which was empty until a real pull finished. |

---

## What we fixed

### 🔐 Auth — magic-link only, GitHub/Anthropic style

**Files touched:**
- `backend/src/services/auth-otp.js`
- `backend/src/routes/auth.js` (rewritten)
- `backend/src/routes/v1-wizard.js`
- `app/login/page.tsx` (rewritten)
- `app/auth/verify/page.tsx` (new)

**What changed:**
- Email no longer contains a 6-digit code at all. Single big "Sign In to
  DCP" button + plaintext fallback link. EN + AR copy.
- Login page is one screen: enter email → click "Send Sign-In Link" →
  success state ("Check your email"). No second step, no code field.
- New `/auth/verify?token=…` page consumes the link, exchanges the token
  via `POST /api/auth/magic-link`, stores the API key, redirects to the
  right dashboard (`/provider` or `/renter/marketplace`).
- Token TTL: 15 minutes. One-time use. Stored in `otp_codes.magic_token`
  with index `idx_otp_magic`.
- The login page persists the user's chosen role in `sessionStorage`
  (`dcp_login_prefer_role`) so `/auth/verify` redirects correctly even
  when the same email holds both a provider and a renter row.
- Old Supabase-based `/api/auth/magic-link-exchange` kept as a deprecated
  alias that maps to the new handler — in-flight clients keep working
  through the rollout.

**Status:** ✅ Modules load clean. Ready to deploy.

---

### 👥 Dual-role guard — softened from hard 409 to log-only

**Files touched:**
- `backend/src/routes/v1-wizard.js`
- `backend/src/routes/providers.js`
- `backend/src/routes/renters.js`
- (helper module `services/cross-role-uniqueness.js` left intact for tests)

**What changed:**
- The same email can now hold both a provider and a renter row. The
  cross-role check is logged but does not return 409.
- The new `/api/auth/magic-link` endpoint accepts a `prefer` field
  (`provider` / `renter`) so the login page can pick the right dashboard
  when both roles exist. The response also includes a `dual_role: true`
  flag for the UI to offer a role-switch link later.

**Status:** ✅ Tareq can now register as provider even though
`mcmazyad@live.com` has an existing renter row.

---

### ⏱️ Rate limit — already raised on Thursday evening

**File:** `backend/src/routes/auth.js` (limiter config)

- Auth limiter raised from **5 → 10 requests / 15 min** per IP.
- Magic-link emails count one request per send; resend cooldown is
  enforced client-side (60s countdown) before the server limiter would
  fire, so users see "you can request again in N seconds" instead of an
  abrupt 429.

**Status:** ✅ Live since 2026-05-08.

---

### 📡 Heartbeat docblock — now explicit about POST-only

**File:** `backend/src/routes/providers.js` (route at `/heartbeat`,
docblock at the top of the section)

- Added a prominent "IMPORTANT — POST ONLY" callout in the route docblock
  with a working probe command:

  ```bash
  curl -X POST https://api.dcp.sa/api/providers/heartbeat \
    -H 'Content-Type: application/json' \
    -d '{"api_key":"<your-key>","gpu_status":{},"provider_ip":"x.x.x.x","provider_hostname":"host"}'
  ```

- The docblock now also describes *why* the endpoint exists (so future
  readers, including agents, don't think the 404 is an outage).

**Status:** ✅ Comments-only change, no behavior change.

---

### 📚 Provider model catalog — single source of truth for Ollama tags

**File:** `docs/PROVIDER-MODEL-CATALOG.md` (new)

- Lists every valid Ollama tag we currently endorse, by family (Qwen 3,
  Qwen 2.5, Gemma 3, Llama 3, Mistral, embeddings).
- Calls out the gotchas Tareq actually hit: `qwen3:35b` doesn't exist
  (use `:32b`), `ollama search` isn't a real command, the upstream
  `registry.ollama.ai/v2/library/<model>/tags` endpoint returns 404 from
  the public web (an Ollama API change, not a DCP issue).
- Cross-links to `backend/src/lib/model-aliases.js` (the runtime alias
  map) so docs and code stay in sync.

**Surfaces to:** Nexus and DCP Agent assistants — they should treat this
file as authoritative when guiding any provider through model setup.

---

### 🤖 DCP Agent spec — bumped to v0.2.0 + Linux readiness

**File:** `docs/DCP-Agent-Technical-Spec.md`

- Version bumped 0.1.0 → 0.2.0, dated 2026-05-09.
- New top-of-doc "What changed since v0.1.0" table summarising every
  shift in this changelog.
- New "Linux readiness (Tareq's question)" section: yes for headless /
  systemd today, not yet for a Tauri GUI build. Concrete recommended path
  for Tareq through Phase 1.

---

## What still needs your decision

1. **Cleanup of Tareq's stale renter row.** Now that dual-role is allowed,
   it doesn't block him — but if you want a single canonical row per
   email, we should soft-delete the renter row he created on 2026-04-27
   before the guard was softened. Say the word and I'll do it.
2. **Disable old `/auth/callback` page entirely?** It's the Supabase
   callback page; with the magic-link-exchange shim it still works, but
   the only canonical entry point is now `/auth/verify`. We can either
   leave it as-is (defensive) or 301-redirect to `/login?reason=stale_link`.
3. **Linux .deb pipeline for the agent.** I scoped it as an afternoon of
   Tauri CI work in the v0.2 spec. Worth scheduling for next week if you
   want Tareq running the agent natively rather than the Python daemon.

---

## Verification steps before declaring this done in production

- [ ] Deploy backend (`pm2 restart`) and run a magic-link round-trip with
      a fresh test email — confirm email arrives within 10s, link works,
      lands at the right dashboard.
- [ ] Run a magic-link with an email that has both a provider and a
      renter row; confirm `prefer=provider` lands on `/provider` and
      `prefer=renter` lands on `/renter/marketplace`.
- [ ] Probe heartbeat with the documented POST curl; confirm 200 OK with
      `{success:true}` (use a known-good `api_key`).
- [ ] Smoke-test that `ollama pull qwen3:8b` succeeds on Tareq's box and
      shows up in the next heartbeat under `cached_models`.

---

*Last updated: 2026-05-09 ~16:00 GMT+4 by Claude (Opus 4.7) for Peter.*
