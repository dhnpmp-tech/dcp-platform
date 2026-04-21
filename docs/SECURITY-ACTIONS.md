# Security Actions — Peter-Only Items

> Scope: things only the founder can execute. Surfaced by Tito's external
> audit (2026-04) plus the in-repo security hardening branch
> `peter/security-hardening`.
>
> Everything in this file is a **manual** step. No agent / CI / bot will do
> these — they require access to external accounts (Supabase, GitHub org,
> certificate authorities, DNS) or real money.

---

## P0 — Do these this week

### 1. Rotate Supabase anon / publishable keys

**Why.** The public legacy repo `datacenter-friendly-hub` has a committed
`.env` file at its root containing:

```
VITE_SUPABASE_URL=https://vrhiappymfmkyjouxkgd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<JWT>
```

Even though this is the *anon* key (intended to be public), it is tied to a
different Supabase project than `rwxqcqgjszvbwcyjfpec` (the current DCP
project referenced in CLAUDE.md). Two risks:

1. If RLS on `vrhiappymfmkyjouxkgd` is misconfigured, the anon key becomes
   a data-read vector.
2. Any future developer grepping the repo assumes the leaked URL is "the"
   Supabase project and wires new code to it, diverging infra silently.

**Action.**
- Log in to `https://supabase.com/dashboard/project/vrhiappymfmkyjouxkgd`.
- If the project is still in use: rotate both the anon key and the service
  role key from Project Settings → API.
- If the project is abandoned: delete it entirely. Confirm no backend
  currently reads from it (grep shows no references in
  `dc1-platform/backend/` or `dc1-platform/frontend/`).
- Re-confirm that the active DCP project `rwxqcqgjszvbwcyjfpec` has RLS
  enabled on every table with user data.

### 2. Archive or private-ify `datacenter-friendly-hub`

**Why.** That repo is public and contains:
- The leaked Supabase key above.
- Early design sketches that pre-date the current DCP positioning (can
  confuse investors / press who search for "DC1" on GitHub).

**Action.**
- GitHub → repo settings → "Change visibility" → **Private**, or
- "Archive this repository" if it's no longer needed for any reference.
- Double-check that no CI, Vercel project, or deploy hook depends on it.

### 3. Confirm the production VPS is not leaked elsewhere

**Why.** The in-repo branch `peter/security-hardening` removes
`76.13.179.86` and the P2P peer-id multiaddr from the backend. But the IP
might still appear in:
- Vercel env vars for the frontend
- Older PR descriptions / issue comments on GitHub
- Docs written by agents before the hardening (`docs/**` may still have
  historical references)
- Telegram / Slack pinned messages

**Action.**
- `git log --all -S '76.13.179.86' --oneline` on both frontend and backend
  repos. The history itself cannot be cleaned without force-pushing (see
  next item) but all *living* references should be replaced with
  `api.dcp.sa`.
- Audit Vercel env vars in the frontend project; replace any
  `NEXT_PUBLIC_API_URL=http://76.13.179.86:8083` with `https://api.dcp.sa`.
- Rotate the VPS IP if exposure is material (requires a new VPS order +
  DNS cutover).

---

## P1 — Do these before v4.1 wizard launch

### 4. Buy a Windows EV code-signing certificate

**Why.** Tito's scan of the current `.exe` daemon installer shows
`security_directory_size = 0` — it is an **unsigned** PE binary. When a
Saudi provider downloads it, Windows SmartScreen marks it as a "dangerous"
file and many antivirus engines block execution outright. This is the
single largest reason our 43 registered providers show 0 active.

**Options & cost:**
- **Sectigo EV Code Signing**: ~$299/year (token-based, most common choice).
- **DigiCert EV Code Signing**: ~$524/year (faster SmartScreen reputation
  ramp because of name recognition).
- **SSL.com EV Code Signing**: ~$349/year (cheapest that actually ships a
  physical YubiKey FIPS token).

Required artifacts:
- D-U-N-S number for DCP's Saudi entity (or whichever legal entity is
  signing — this determines the *publisher* string buyers will see).
- Articles of incorporation.
- Proof of business address.
- Photo ID of the signatory (you).

**Action.**
- Pick a CA (recommend SSL.com for cost/feature balance).
- Fill in the enrolment form under DCP's legal entity.
- Validation usually takes 3–10 business days; they ship a physical token
  (YubiKey FIPS) because EV certs can't be exported.
- Once received, follow `docs/BINARY-SIGNING.md` (see related branch) to
  integrate signing into the GitHub Actions release workflow.

### 5. Obtain Apple Developer ID for macOS notarization

**Why.** `setup-unix.sh` writes a `launchd` plist and downloads a Python
daemon. macOS Sonoma / Sequoia Gatekeeper increasingly blocks unsigned
downloaded binaries.

**Action.**
- Apple Developer Program membership: **$99/year** at
  https://developer.apple.com/programs/enroll/ (individual or Organization
  tier; Organization requires a D-U-N-S so may align with item #4).
- Generate a "Developer ID Application" certificate in Xcode →
  Preferences → Accounts.
- Generate an app-specific password for `notarytool`.
- CI integration details: `docs/BINARY-SIGNING.md`.

### 6. Rotate the `DC1_ADMIN_TOKEN` and `DC1_HMAC_SECRET` on the VPS

**Why.** `ecosystem.config.js` now ships with empty string defaults for
these — good — but the *live* VPS currently has real values set. If any
agent ever leaked them in logs, issue bodies, or Telegram, they need
rotating.

**Action.**
- SSH to `76.13.179.86`.
- Generate new values: `openssl rand -hex 32` (twice, one per token).
- Update `/root/.pm2/module_conf.json` or wherever PM2 reads env vars.
- `pm2 restart dc1-provider-onboarding --update-env`.
- Invalidate any issued provider API keys derived from the old HMAC
  secret (requires a DB migration or a forced re-registration of all
  providers — coordinate with a quieter window if we have any actives).

---

## P2 — Hygiene / do-by-end-of-Q2

### 7. DNS cutover: kill all direct-IP references

Post hardening, a Saudi renter who buys a GPU job should only ever see
`https://api.dcp.sa`, never a bare IP. This is mostly done — one
remaining known site is historical docs in `docs/**` which still reference
`76.13.179.86` for historical accuracy. Leave historical docs alone but
add a banner to any "runbook"-type doc noting the IP is legacy.

### 8. Sign up for a secrets scanner

Truffle Hog or GitLeaks as a GitHub Action on push to `main`. Would have
caught items 1, 2, and the backend IP leak automatically.

Cost: free (open source). Integration effort: half a day.

### 9. Purchase a paid Supabase tier (optional)

Current `rwxqcqgjszvbwcyjfpec` is presumably on the free tier. At launch
scale we want:
- Point-in-time recovery (free tier doesn't offer this).
- A second database for staging.
- Log retention > 7 days.

~$25/project/month. Defer until we have > 100 real providers.

---

## What agents CAN do (and already did)

Branch `peter/security-hardening` already landed:

- ✅ Removed hardcoded `76.13.179.86` from all `.js` / `.ts` / `.json`
  files in `backend/src/` and `backend/tests/`.
- ✅ Removed the libp2p peer-id multiaddr from `ecosystem.config.js`.
- ✅ Clamped the global `express.json` body limit from 50 MB to 2 MB,
  with a per-route 10 MB lane only for `/api/providers/job-result`.
- ✅ Added two regression-test files under `backend/tests/security/` that
  will fail CI if any of the above regresses.

Next agent tasks (separate branches):
- `peter/catalog-hygiene` — dedupe model aliases, normalize 133× pricing
  spread, enable `tool_calling` where verified.
- `peter/v1-api-endpoints` — 8 wizard endpoints under `/v1/*` using a
  magic-link bridge (no password auth added).
- `peter/binary-signing-plan` — writes `docs/BINARY-SIGNING.md` covering
  osslsigncode / SignTool / codesign / notarytool flows + a GH Actions
  release workflow. Can't actually sign anything until you complete
  items 4 and 5 above.

---

## Contact

If any of these steps reveal a live incident (credentials already abused,
unauthorized provider activity), follow the incident playbook in
`docs/incident-response.md` and notify the co-founders (Tareq, Fadi) via
the CTO Telegram channel before touching the VPS.
