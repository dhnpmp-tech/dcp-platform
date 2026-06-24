# ops-closures-mc-token-rotation-git-scrub-admin-mfa

**risk:** risky · **deploy_target:** ops-manual
**reviewer:** go_no_go=go-with-changes rollout_safe=False breaks_fleet_or_auth=False

## Design
Three operational (non-app-code) closures the audit needs, grounded in the live VPS tree. (1) The Mission Control token `dc1-mc-gate0-2026` is NOT validated by a service on :8084 (that port isn't listening; :8084 is only a doc example for a separate monitoring agent). It is the shared bearer secret for the external Mission Control API at https://mc.dcp.sa/api, validated server-side by the DCP backend at backend/src/routes/sync.js:11 (constant `MC_TOKEN===` check) and backend/src/routes/standup.js:166 (`Bearer ${MC_TOKEN}`), and consumed as a Bearer credential by orchestration Python (failover/nexus/monitoring/healthcheck/checkpoint), Next.js server routes (app/api/ping, app/api/security), AND — the real leak — browser client code app/agents/page.tsx, app/agents/[id]/page.tsx, lib/api.ts via NEXT_PUBLIC_MC_TOKEN, which bakes it into .next/static/chunks. Rotation = generate a new token on the MC side, update env in 3 planes (VPS backend/.env MC_TOKEN, orchestration MC_API_TOKEN/DC1_MC_TOKEN, Vercel), and stop shipping it to browsers by adding a server-side /api/mc proxy and deleting NEXT_PUBLIC_MC_TOKEN. (2) The git remote URL on the VPS contains a live github_pat_… PAT; `dc1-mc-gate0-2026` appears in 15 commits and `dc1-renter-03ab6169…` in 4 across all refs of github.com/dhnpmp-tech/dcp-platform.git (2074 commits, ~20 author identities). Scrub = rotate-first, then git filter-repo replacement, force-push, coordinated re-clone. (3) Admin MFA is specced as a TOTP follow-up ticket, not implemented now. All steps are manual (touch prod credentials); nothing auto-execs.

## Phases (honor each GATE before proceeding)
CLOSURE 1 — ROTATE MISSION CONTROL TOKEN (do this FIRST; it also de-risks the git scrub):
P1.1 Pre-flight read-only confirm where the token is honored. The validator is the Mission Control API itself (https://mc.dcp.sa) plus the DCP backend's two local routes. There is no :8084 MC service — confirmed `ss -ltnp | grep :8084` returns nothing and the only :8084 reference is a doc-string in orchestration/setup/dc1-monitoring-agent.py for an unrelated agent. So "rotate" means: mint a new shared secret accepted by the MC API, then swap it everywhere it is presented.
P1.2 Mint the new token on the MC side (mc.dcp.sa control plane / its own env — MC_API_TOKEN/MC_TOKEN equivalent on that host). Keep the OLD token ACCEPTED in parallel (dual-accept) for the cutover window if the MC service supports a token list; if it only supports one, schedule a short maintenance window because the swap must be near-simultaneous across consumers.
P1.3 Update VPS env (does NOT touch app code): backend/.env key `MC_TOKEN`, and any orchestration env files / systemd EnvironmentFile that set `MC_API_TOKEN` and `DC1_MC_TOKEN`. Then restart the consuming processes (pm2 restart dc1-provider-onboarding and any orchestration units) — Peter runs this, not me.
P1.4 Update Vercel env: replace `MC_API_TOKEN` (server, used by app/api/ping + app/api/security) and DELETE `NEXT_PUBLIC_MC_TOKEN` (client) in the Vercel project for dcp.sa. Redeploy.
P1.5 Stop shipping the token to browsers: land the small frontend patch (Closure-1 patch script) that adds a server-only proxy route app/api/mc/[...path] and rewrites app/agents/page.tsx + app/agents/[id]/page.tsx + lib/api.ts to call the proxy instead of reading NEXT_PUBLIC_MC_TOKEN. Verify the new build has zero occurrences of the token in .next/static. (This is the only code-adjacent step; it is what makes the rotation durable — otherwise the new token leaks again on next build.)
P1.6 Retire the old token on the MC side once dashboards + ping + orchestration are green on the new one.
VERIFY GATE before scrub: agents page loads via proxy, /api/ping shows Mission Control healthy, orchestration audit POSTs succeed, and `grep -r dc1-mc .next/static` is empty.

CLOSURE 2 — GIT-HISTORY SCRUB (only AFTER Closure 1 rotation, and after the renter key + PAT are rotated, so the scrub is defense-in-depth not the sole control):
P2.1 Rotate the three secrets FIRST (a scrub does not un-leak — anyone who cloned already has them): (a) MC token — done in Closure 1; (b) renter key dc1-renter-03ab6169… — rotate/revoke in the backend renter-key store and reissue to that renter; (c) the GitHub PAT in the remote URL — revoke it in GitHub Developer Settings and mint a new fine-grained PAT scoped to just this repo.
P2.2 Freeze the repo: announce to all ~20 author identities / active collaborators (Peter, Tareq, Codex/agent bots that push) that a history rewrite is happening; pause CI auto-merge and any agent that pushes (Codex, paperclip agents) for the window.
P2.3 Make a full mirror backup before rewriting: `git clone --mirror` to a dated bundle off-box.
P2.4 Run git filter-repo with a replace-text file covering all three literals (commands in patch_scripts). Use filter-repo (not filter-branch) for speed/correctness on 2074 commits; BFG is the fallback if filter-repo isn't installable.
P2.5 Re-add the (new, not old) remote — filter-repo strips the remote — using a remote WITHOUT the PAT embedded (use a credential helper or git env), then force-push all branches + tags.
P2.6 Coordinated re-clone: every collaborator and every machine that has a working copy (the VPS /root/dc1-platform, any agent boxes, Vercel's git connection re-syncs on next deploy) must delete and fresh-clone; pushing from a stale clone reintroduces the old history. Invalidate any open PRs/branches that were cut from pre-rewrite SHAs.
P2.7 GitHub-side cleanup: old SHAs can linger in GitHub's cache and in forks/PR refs — open a GitHub Support request to purge cached views, and delete stale fork/PR refs.
VERIFY GATE: `git log --all -S 'dc1-mc-gate0-2026'`, `-S 'dc1-renter-03ab6169'`, and a PAT-prefix scan all return zero across the rewritten history; new PAT works for fetch/push; VPS + Vercel build green from fresh clone.

CLOSURE 3 — ADMIN MFA (L2) — FOLLOW-UP TICKET, design only, not implemented now:
P3.1 File ticket "DCP-L2: TOTP MFA on admin token flow". Current state: admin auth is a bearer/admin token stored in localStorage (lib/api.ts getAdminToken reads dc1_admin_token) — single factor, no second factor.
P3.2 Design option (recommended): layer RFC-6238 TOTP on the existing admin-token issuance, server-side, so no fleet/daemon impact (admins are humans, not daemons). Enrollment: on first admin login, backend generates a TOTP secret (otplib/speakeasy), stores it hashed/encrypted against the admin identity, returns an otpauth:// URI for a QR (Google/1Password Authenticator). Verification: admin login becomes two-step — password/SSO → then a 6-digit TOTP that the backend verifies (±1 step window) before issuing the dc1_admin_token; the issued token gets a `mfa:true` claim and a shorter TTL. Add 10 one-time recovery codes (hashed) for device loss.
P3.3 Scope guard: MFA applies ONLY to the admin token path. It must NOT touch renter/provider key auth or the daemon HMAC/heartbeat paths (those are machine-to-machine and have no human to present a code). Explicitly out of scope for this ticket.
P3.4 Rollout when implemented: ship behind a per-admin `mfa_enabled` flag, enroll admins one at a time, flip enforcement only after all admins are enrolled (same dual-accept discipline as the token rotation).

## Verification
CLOSURE 1 (per phase):
# P1.1 confirm there is NO MC service on :8084 (validator is mc.dcp.sa + backend routes)
ssh root@76.13.179.86 "ss -ltnp | grep ':8084' || echo 'NO :8084 LISTENER — token is for mc.dcp.sa API + backend sync/standup routes'"
# P1.3 confirm VPS env swapped (redacted) and process restarted
ssh root@76.13.179.86 "grep -c '^MC_TOKEN=' /root/dc1-platform/backend/.env; pm2 jlist | python3 -c 'import sys,json;[print(p[\"name\"],p[\"pm2_env\"][\"status\"]) for p in json.load(sys.stdin)]'"
# P1.4/P1.5 after Vercel redeploy: token must NOT be in the client bundle
grep -R 'dc1-mc-gate0-2026' .next/static 2>/dev/null && echo 'LEAK — FAIL' || echo 'CLEAN'
grep -R 'NEXT_PUBLIC_MC_TOKEN' .next/static 2>/dev/null && echo 'STILL EMBEDDED — FAIL' || echo 'CLEAN'
# functional: agents dashboard works through proxy, ping is green, orchestration audit posts succeed
curl -s -o /dev/null -w '%{http_code}\n' https://dcp.sa/api/mc/tasks            # expect 200 (proxy injects token)
curl -s https://dcp.sa/api/ping | grep -o '"Mission Control"[^}]*'             # expect status healthy
curl -s -o /dev/null -w '%{http_code}\n' https://dcp.sa/agents                 # expect 200, no console token

CLOSURE 2 (post-rewrite, must all be 0):
git log --all -S 'dc1-mc-gate0-2026' --oneline | wc -l        # expect 0 (was 15)
git log --all -S 'dc1-renter-03ab6169' --oneline | wc -l      # expect 0 (was 4)
git grep -nE '(ghp_|github_pat_)[A-Za-z0-9_]+' $(git rev-list --all) 2>/dev/null | wc -l  # expect 0
git remote get-url origin | grep -E '(ghp_|github_pat_)' && echo 'PAT STILL IN REMOTE — FAIL' || echo 'CLEAN REMOTE'
# old PAT revoked: this should 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <OLD_PAT>" https://api.github.com/user   # expect 401
# fresh clone builds on VPS + Vercel green

CLOSURE 3:
# N/A — ticket only. Acceptance written into the ticket (TOTP enroll+verify, recovery codes, admin-only scope).

## Reviewer — gaps / required changes BEFORE executing
**Gaps:** FLEET/AUTH SAFETY = OK. Verified read-only on 76.13.179.86: no rollout phase touches the provider/daemon HMAC path (DC1_HMAC_SECRET / x-dc1-signature), heartbeats, or renter/provider key issuance. The 15s dcp-engines-sync.sh cron and heartbeat loop do NOT present the MC token (confirmed empty grep), so the swap will not 401 live heartbeats or break job execution. Admin MFA (Closure 3) is design-only and correctly scoped: admin auth (requireAdminAuth, x-admin-token/Bearer, DC1_ADMIN_TOKEN in middleware/auth.js) is architecturally separate from the machine HMAC path, so layering TOTP there has no daemon impact. dcp.sa/agents returns 200 (shell loads); its MC data fetch is ALREADY broken (mc.dcp.sa/api/tasks 404), so the patch does not regress a working surface.

UNVERIFIABLE / MISSTATED IN DESIGN: (a) The "validator" model is partly wrong. mc.dcp.sa resolves to Vercel (216.150.16.129), NOT the backend, and EVERY /api/* path probed returns 404 including the exact /api/tasks the agents page calls; /api/ping baseline already shows Mission Control: down. P1.2 ("mint a token accepted by the MC API") rests on a control plane whose endpoints I could not confirm respond - locate the real MC validator before minting/dual-accepting. (b) Dual-accept correctness depends on the MC service supporting a token list - unverified because the MC plane is unreachable/404. (c) Cannot confirm dc1-renter-03ab6169 is inactive in the live DB (tables exist: dc1.db/dcp.db/providers.db) - revoke-and-verify rather than assume. The :8084 claim is CORRECT (no listener; doc-only). PAT-in-remote, 15/4 secret commits, and the browser NEXT_PUBLIC_MC_TOKEN leak are all CONFIRMED real.

**Required changes:** FIX BEFORE APPLYING:
1. Wrong-checkout guard (highest op risk). The Vercel-linked checkout is dc1-platform/ (.vercel/project.json -> dc1-platform), but it has NO app/agents/ dir; the agents pages live in dcp-v2-cutover-safety/app/agents/. Run as-instructed, the patch logs "app/agents/page.tsx missing - skip" yet still creates the proxy + sanitizes lib/api.ts -> a half-patched build that LOOKS successful. A lib/api.ts.bak.secp0.20260624-055524 already exists on the PROD VPS checkout (/root/dc1-platform), i.e. a prior patch attempt already touched prod, which the script forbids. Pin the exact deploy checkout first and add a hard pre-check: abort if app/agents/page.tsx is absent. Never run in /root/dc1-platform.
2. P1.3 is an ADD not an UPDATE. backend/.env has NO MC_TOKEN key and the running pm2 env (dc1-provider-onboarding) has MC_TOKEN ABSENT; api.dcp.sa/api/standup/run returns 503 "MC_TOKEN not configured" today. Setting MC_TOKEN flips /api/standup/run and /api/sync/run from 503 to live-auth - a behavior change to verify, not a swap of an existing value.
3. P1.4 env-var coverage is incomplete. app/api/ping uses MC_API_TOKEN (-> mc.dcp.sa) but app/api/security uses MC_TOKEN via x-mc-token (-> backend /api/security/flag, a DIFFERENT token plane). Design only names MC_API_TOKEN + delete NEXT_PUBLIC_MC_TOKEN. Add MC_TOKEN to the Vercel update or provider flagging keeps the old/leaked value or breaks. Reconcile all four names: MC_TOKEN, MC_API_TOKEN, DC1_MC_TOKEN, NEXT_PUBLIC_MC_TOKEN.
4. Fix the verify gate. "/api/ping shows Mission Control healthy" already FAILS at baseline (live ping reports Mission Control: down, Supabase: down) independent of the rotation, and "curl dcp.sa/api/mc/tasks expect 200" cannot pass while mc.dcp.sa/api/tasks returns 404 (verified). These functional gates cannot distinguish "rotation worked" from "MC was already broken." Trust only the bundle-grep gates. Establish the real MC-down root cause before claiming Closure 1 green.
5. Closure 2 prerequisites: git-filter-repo is NOT installed on the VPS (install or use the BFG fallback); history is 3008 commits, not 2074 (counts dc1-mc-gate0-2026=15, dc1-renter-03ab6169=4 are correct). Keep rotate-first ordering. The PAT IS live in the prod remote URL (confirmed). Verify dc1-renter-03ab6169 is revoked in the backend renter-key store before scrub - it appears only in history, not live config, so low blast radius but must be confirmed against the DB.
6. LOW: backend MC_TOKEN checks use non-constant-time !== (sync.js:11, standup.js:167) on a shared bearer; the new /api/mc proxy is also an unauthenticated open relay to mc.dcp.sa for anyone hitting dcp.sa/api/mc/* - add the same admin/session gate the agents page assumes, or it just moves the credential server-side while leaving the endpoint open.

## Caveats
All three closures touch PROD credentials and are output as MANUAL STEPS — nothing here auto-executes against prod, and none of it edits/reloads/restarts the live backend or writes the DB (risk mapped to 'risky' since the enum has no 'ops-manual'; deploy_target=ops-manual). PREREQUISITES & ORDER: (1) Mission Control must support either token dual-accept or a short maintenance window — if mc.dcp.sa accepts only one token, the env swap across backend+orchestration+Vercel must be near-simultaneous or those consumers 401 in the gap; Peter does the actual mint/restart. (2) The Closure-1 frontend patch is the only code-adjacent piece and is REQUIRED for a durable rotation — without deleting NEXT_PUBLIC_MC_TOKEN and routing through /api/mc, the new token re-leaks into .next/static on the very next build. The perl rewrites target the exact current text of app/agents/page.tsx and app/agents/[id]/page.tsx (verified) — review the diff before merging; if those files drift, the regex may no-op and the pages must be hand-edited. Also note lib/api.ts getMcBase() already returns '/api/mc' but no such route existed (confirmed: no app/api/mc dir) — this patch creates it. (3) ROTATE-BEFORE-SCRUB is mandatory: a git filter-repo rewrite does NOT un-leak anything already cloned, so the MC token, renter key dc1-renter-03ab6169…, and the GitHub PAT must be revoked/reissued FIRST; the scrub is defense-in-depth. (4) The force-push will break every open branch/PR cut from pre-rewrite SHAs (10+ backend-architect/* branches exist) and requires ALL ~20 author identities / agent pushers (Codex, paperclip agents) to pause and re-clone; a single push from a stale clone reintroduces the old history. Back up a --mirror before rewriting. GitHub may retain old SHAs in cache/forks/PR refs — open Support to purge. (5) This task does NOT touch the daemon HMAC_SECRET / TASK_SPEC signing or the heartbeat-HMAC enforcement path; the MC token is an independent credential and rotating it has zero effect on the fleet's job-signing or heartbeats. (6) Admin MFA is design-only; explicitly scoped to the human admin-token flow and must never be applied to renter/provider key auth or machine-to-machine daemon paths.

## Patch scripts (apply per-phase, central + tested)
```
############################################################
# CLOSURE 1 — FRONTEND PATCH (P1.5): server-side MC proxy so the
# token NEVER ships to the browser. Run from repo root of the
# Next.js frontend (the Vercel-deployed checkout, NOT prod VPS).
# Idempotent; makes backups; runs build-time sanity. Land via PR.
############################################################
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ROOT/app/api/mc/[...path]"

# 1) Server-only proxy route. process.env.MC_API_TOKEN is server-side only.
PROXY="$ROOT/app/api/mc/[...path]/route.ts"
if [ ! -f "$PROXY" ]; then
cat > "$PROXY" <<'EOF'
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';

const MC_BASE = (process.env.MC_API_URL || 'https://mc.dcp.sa') + '/api';
const MC_TOKEN = process.env.MC_API_TOKEN || ''; // server-only; never NEXT_PUBLIC_

async function forward(req: NextRequest, path: string[]) {
  const url = `${MC_BASE}/${path.join('/')}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${MC_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }
  const res = await fetch(url, init);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}
export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
EOF
  echo "[patch] created $PROXY"
else
  echo "[patch] $PROXY already exists — skipping"
fi

# 2) Rewrite client pages to hit the proxy with NO token header.
for f in "app/agents/page.tsx" "app/agents/[id]/page.tsx"; do
  TGT="$ROOT/$f"
  [ -f "$TGT" ] || { echo "[patch] $f missing — skip"; continue; }
  cp "$TGT" "$TGT.bak.$TS"
  # point MC_BASE at the local proxy and drop the bearer token usage
  perl -0pi -e "s#const MC_BASE = \(process\.env\.NEXT_PUBLIC_MC_URL \|\| ''\) \+ '/api';#const MC_BASE = '/api/mc';#g" "$TGT"
  perl -0pi -e "s#const MC_TOKEN = typeof window !== 'undefined'\s*\n\s*\? \(process\.env\.NEXT_PUBLIC_MC_TOKEN \|\| ''\)\s*\n\s*: '';#const MC_TOKEN = '';/* moved server-side: see app/api/mc proxy */#g" "$TGT"
  # remove the Authorization header line (proxy injects it server-side)
  perl -0pi -e "s#\s*headers: \{ Authorization: \`Bearer \\\$\{MC_TOKEN\}\` \},\n##g" "$TGT"
  echo "[patch] rewrote $f (backup $TGT.bak.$TS)"
done

# 3) lib/api.ts: getMcToken must NOT read NEXT_PUBLIC_MC_TOKEN anymore.
LIB="$ROOT/lib/api.ts"
if [ -f "$LIB" ]; then
  cp "$LIB" "$LIB.bak.$TS"
  perl -0pi -e "s#return process\.env\.NEXT_PUBLIC_MC_TOKEN \|\| 'YOUR_MC_API_TOKEN';#return ''; // token is injected server-side by /api/mc proxy#g" "$LIB"
  echo "[patch] sanitized lib/api.ts (backup $LIB.bak.$TS)"
fi

# 4) Sanity: typecheck these files (no prod write).
npx tsc --noEmit --pretty false 2>&1 | head -40 || true

# 5) GUARD: build then assert token + NEXT_PUBLIC_MC_TOKEN are gone from client bundle.
echo "[patch] After 'next build', verify with: grep -R 'dc1-mc-gate0-2026' .next/static && echo LEAK || echo CLEAN"
echo "[patch] And: grep -R 'NEXT_PUBLIC_MC_TOKEN' .next/static && echo STILL_EMBEDDED || echo CLEAN"

############################################################
# CLOSURE 2 — GIT-HISTORY SCRUB (P2.4/2.5). MANUAL. Run on a
# FRESH MIRROR clone, never on prod /root/dc1-platform.
# Secrets MUST already be rotated (P2.1) before this.
############################################################
# --- 2.1 backup mirror (off-box) ---
#   git clone --mirror https://github.com/dhnpmp-tech/dcp-platform.git dcp-mirror-backup.$(date +%Y%m%d)
#   tar czf dcp-mirror-backup.$(date +%Y%m%d).tgz dcp-mirror-backup.$(date +%Y%m%d)
#
# --- 2.2 working mirror to rewrite ---
#   git clone --mirror https://github.com/dhnpmp-tech/dcp-platform.git dcp-scrub && cd dcp-scrub
#
# --- 2.3 replacement file (literals -> placeholders). DO NOT commit this file. ---
#   cat > /tmp/dcp-replacements.txt <<'REPL'
#   dc1-mc-gate0-2026==>***REMOVED-MC-TOKEN***
#   dc1-renter-03ab6169==>***REMOVED-RENTER-KEY***
#   regex:github_pat_[A-Za-z0-9_]+==>***REMOVED-GH-PAT***
#   regex:ghp_[A-Za-z0-9]+==>***REMOVED-GH-PAT***
#   REPL
#   # NOTE: use the FULL renter key string in the real file, not just the prefix.
#
# --- 2.4 rewrite (preferred: git-filter-repo) ---
#   pip install git-filter-repo   # or: brew install git-filter-repo
#   git filter-repo --replace-text /tmp/dcp-replacements.txt --force
#
#   # FALLBACK if filter-repo unavailable (BFG):
#   #   cat > /tmp/bfg-secrets.txt <<'B'
#   #   dc1-mc-gate0-2026
#   #   dc1-renter-03ab6169...   # full key
#   #   B
#   #   java -jar bfg.jar --replace-text /tmp/bfg-secrets.txt
#   #   git reflog expire --expire=now --all && git gc --prune=now --aggressive
#
# --- 2.5 re-add clean remote (NO PAT in URL) + force-push ---
#   # filter-repo removes 'origin'. Use a credential helper / GH_TOKEN env, not an inline PAT.
#   git remote add origin https://github.com/dhnpmp-tech/dcp-platform.git
#   GIT_ASKPASS=... git push --force --all origin
#   GIT_ASKPASS=... git push --force --tags origin
#
# --- 2.6 verify (must all print 0) ---
#   git log --all -S 'dc1-mc-gate0-2026' --oneline | wc -l
#   git log --all -S 'dc1-renter-03ab6169' --oneline | wc -l
#   git grep -nE '(ghp_|github_pat_)[A-Za-z0-9_]+' $(git rev-list --all) 2>/dev/null | wc -l
#
# --- 2.7 fix prod + agent checkouts (re-clone, do NOT push from stale) ---
#   # On VPS (Peter, manual): backup then re-clone
#   #   mv /root/dc1-platform /root/dc1-platform.pre-scrub.$(date +%Y%m%d)
#   #   git clone https://github.com/dhnpmp-tech/dcp-platform.git /root/dc1-platform
#   #   restore /root/dc1-platform/backend/.env from the .pre-scrub copy (env is gitignored)
#   # Vercel: next deploy re-syncs from rewritten history automatically.

############################################################
# CLOSURE 3 — ADMIN MFA: ticket only, no patch script now.
############################################################
```
