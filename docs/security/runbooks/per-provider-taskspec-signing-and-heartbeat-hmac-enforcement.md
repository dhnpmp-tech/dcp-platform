# per-provider-taskspec-signing-and-heartbeat-hmac-enforcement

**risk:** fleet-critical · **deploy_target:** sequenced
**reviewer:** go_no_go=no-go rollout_safe=False breaks_fleet_or_auth=True

## Design
Today one global DC1_HMAC_SECRET signs every task_spec AND is injected into every daemon, so a single leaked daemon exposes the platform-wide signing/heartbeat key. The fix mints a per-provider secret (providers.task_spec_hmac_secret), uses that SAME secret for both inbound task_spec signing and outbound heartbeat signing for that provider, and migrates without breaking the fleet via DUAL-VERIFY on the daemon (accepts per-provider OR global) and DUAL-SIGN-capable backend (signs per-provider when destination is known + enabled, else global). The hard constraint — daemon's injected key must equal the backend signing key for that daemon or it rejects every job — is satisfied because (a) during migration the global secret is STILL injected alongside the per-provider one and the daemon accepts either, and (b) the backend re-signs at claim time in fetchAndAssignNextJob() once the concrete destination provider is known, so null-provider/queued jobs are never signed with a secret the destination can't verify. Heartbeat signing is correct cross-language because the daemon serializes the body once and POSTs those exact bytes (http_post_raw), and the backend HMACs req.rawBody (the same received bytes) — proven byte-identical in a Python-sign/Node-verify test. DC1_REQUIRE_HEARTBEAT_HMAC=1 is the LAST phase, flipped only after signing daemons are fleet-wide and the verify-phase gate shows zero heartbeat 401s. Verified against prod: 3 active heartbeaters on daemon 4.5.1 + 1 burst node; DC1_REQUIRE_HEARTBEAT_HMAC currently =0 (warn-only); no task_spec_hmac_secret column exists yet (scaffolding from the prompt is NOT present), but api_key_hash already exists.

## Phases (honor each GATE before proceeding)
PHASE 0 — Pre-flight (no behavior change). Confirm DC1_REQUIRE_HEARTBEAT_HMAC=0 (warn-only) and DC1_TASKSPEC_PER_PROVIDER unset. Snapshot fleet: sqlite3 providers.db version histogram + online count. GATE: enforcement OFF, baseline captured.

PHASE 1 — Add column + backfill secrets (additive, dormant). Apply patch-providers.sh (adds ensureTaskSpecHmacSecretColumn() which runs at module load — additive ALTER ADD COLUMN, O(1) metadata, online-safe) and run backfill-secrets.sh once to mint a 64-hex secret for every existing provider. Backend dual-verify code is now LIVE but inert: DC1_TASKSPEC_PER_PROVIDER unset means signTaskSpecForProvider() still returns the GLOBAL signature, and daemon injection now also fills PROVIDER_HMAC_SECRET but no daemon reads it yet. Heartbeat dual-verify just adds the per-provider secret as an extra candidate (global still matches every current daemon). GATE: verify-phase.sh shows secret coverage = total, heartbeat OK unchanged, ZERO heartbeat 401s, ZERO HMAC job failures, recent job success unchanged. If any regression, revert providers.js from .bak — column is harmless to leave.

PHASE 2 — Ship signing daemon (dual-verify), let fleet self-update. Apply patch-jobs.sh (adds per-provider signer + claim-time re-sign, still global by default) and patch-daemon.sh (adds PROVIDER_HMAC_SECRET, dual-verify task_spec, heartbeat signing, http_post_raw; bumps DAEMON_VERSION 4.5.1->4.6.0). Set DAEMON_VERSION=4.6.0 in env so the version-check nudges self-update; keep MIN_DAEMON_VERSION at 4.5.1 so old daemons are NOT force-rejected. The new daemon dual-verifies (per-provider OR global) so it runs whether the backend signs global or per-provider. Backend STILL signs global (flag off), so every daemon (old global-only + new dual) verifies fine. GATE: watch daemon_version histogram climb to 4.6.0 across all heartbeating providers; ZERO HMAC job failures throughout; heartbeats from 4.6.0 daemons now carry X-DC1-Signature and validate (against global OR per-provider — both present). Do NOT proceed until ~100% of online providers report >=4.6.0 for a sustained window (e.g. 24h to catch scheduled/intermittent nodes).

PHASE 3 — Flip backend to per-provider signing. Set DC1_TASKSPEC_PER_PROVIDER=1 in env and restart backend. Now: submit-time signing uses the destination provider's secret when provider_id is known; claim-time re-sign in fetchAndAssignNextJob() covers null-provider/queued jobs. Every job's task_spec_hmac is now per-provider. Signing daemons (4.6.0, fleet-wide from Phase 2) verify via the per-provider candidate; the global candidate is also still injected so any straggler old daemon STILL verifies global-signed jobs IF any slipped through — but per-provider-signed jobs only verify on 4.6.0+. This is why Phase 2 must reach ~100% adoption first. GATE: ZERO HMAC job failures in the hour after the flip; spot-check that new jobs' task_spec_hmac differs per destination provider; job success rate flat. Rollback = unset DC1_TASKSPEC_PER_PROVIDER + restart (instant revert to global signing, daemons still dual-verify).

PHASE 4 — Heartbeat signatures fleet-wide (still warn-only). No code change — this phase is the observation window confirming every online provider is now POSTing a valid X-DC1-Signature (because all are 4.6.0 with a per-provider secret injected). GATE: verify-phase.sh shows heartbeat HMAC warnings -> 0 across the fleet for a sustained window; heartbeat OK count steady; zero unsigned heartbeats from online providers.

PHASE 5 — Enforce heartbeat HMAC (LAST). Only after Phase 4 shows zero warn-only HMAC failures for online providers: set DC1_REQUIRE_HEARTBEAT_HMAC=1 and restart backend. Unsigned/invalid heartbeats now 401. GATE: immediately re-run verify-phase.sh; heartbeat 401 count MUST stay 0 for online providers; if ANY legit provider 401s, instantly set the flag back to 0 + restart (warn-only) and investigate that provider's secret/version.

PHASE 6 — Retire global secret for SIGNING (optional hardening, after long soak). Once telemetry confirms no daemon depends on global-signed jobs (all jobs per-provider, all daemons 4.6.0+ for weeks), stop injecting the global secret into NEW daemon downloads (set the injected global to empty in a follow-up daemon build) and keep verifyHeartbeatHmac's global candidate only as long as any provider lacks a per-provider secret. The global secret stays in env until then because rotating/removing it while any daemon still has it injected would break that daemon. Do NOT do this until Phase 5 has soaked.

## Verification
### Cross-language HMAC parity (run once, proves heartbeat signing is byte-correct) — PASSED locally
python3 -c 'import json,hmac,hashlib;b=json.dumps({"api_key":"p","x":{"b":2,"a":1},"d":False},separators=(",",":"),default=str).encode();open("/tmp/b.bin","wb").write(b);open("/tmp/s.txt","w").write(hmac.new(("a"*64).encode(),b,hashlib.sha256).hexdigest())'
node -e 'const c=require("crypto"),fs=require("fs");const e=c.createHmac("sha256","a".repeat(64)).update(fs.readFileSync("/tmp/b.bin")).digest("hex");console.log("MATCH:",c.timingSafeEqual(Buffer.from(e,"hex"),Buffer.from(fs.readFileSync("/tmp/s.txt","utf8").trim(),"hex")))'
# expect MATCH: true

### Per-phase gate (run on VPS) — verify-phase.sh:
# [3] jobs failed with HMAC error (last 24h) MUST be 0 at EVERY phase
sqlite3 /root/dc1-platform/backend/data/providers.db "SELECT COUNT(*) FROM jobs WHERE status='failed' AND COALESCE(error,'') LIKE '%HMAC%' AND COALESCE(completed_at,created_at) > datetime('now','-1 day');"
# [4] heartbeat 401 rejections MUST be 0 until Phase 5; warnings should trend to 0 by Phase 4
pm2 logs dc1-provider-onboarding --lines 2000 --nostream 2>/dev/null | grep -c 'HMAC rejected'
pm2 logs dc1-provider-onboarding --lines 2000 --nostream 2>/dev/null | grep -c 'HMAC warning'
# [1] fleet adoption — wait for ~100% online providers >= 4.6.0 before Phase 3 flip
sqlite3 /root/dc1-platform/backend/data/providers.db "SELECT COALESCE(daemon_version,'(none)'),COUNT(*),SUM(CASE WHEN last_heartbeat>datetime('now','-10 minutes') THEN 1 ELSE 0 END) FROM providers WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;"
# [2] secret coverage == total after Phase 1
sqlite3 /root/dc1-platform/backend/data/providers.db "SELECT SUM(CASE WHEN task_spec_hmac_secret IS NOT NULL AND task_spec_hmac_secret<>'' THEN 1 ELSE 0 END),COUNT(*) FROM providers WHERE deleted_at IS NULL;"

### Phase 3 spot-check — new jobs sign per-provider (distinct hmac per destination)
sqlite3 /root/dc1-platform/backend/data/providers.db "SELECT provider_id, substr(task_spec_hmac,1,12) FROM jobs WHERE created_at > datetime('now','-1 hour') AND task_spec_hmac IS NOT NULL ORDER BY id DESC LIMIT 10;"

### Daemon manifest integrity (post Phase 2 build) — manifest sha256 must equal downloaded-bytes sha256
curl -s "https://api.dcp.sa/api/providers/download/daemon/manifest?key=PROVIDER_KEY" | python3 -c 'import sys,json;print(json.load(sys.stdin))'
# and the injected file must show version 4.6.0 + a non-empty PROVIDER_HMAC_SECRET line (NOT the {{...}} placeholder)

### Rollback verification (each phase reversible)
# Phase 3 rollback: unset DC1_TASKSPEC_PER_PROVIDER in .env, restart -> backend signs global again, daemons still dual-verify -> 0 HMAC failures
# Phase 5 rollback: set DC1_REQUIRE_HEARTBEAT_HMAC=0, restart -> heartbeats warn-only -> 0 401s

## Reviewer — gaps / required changes BEFORE executing
**Gaps:** VERIFIED AGAINST PROD (76.13.179.86). Baseline matches the design: DC1_REQUIRE_HEARTBEAT_HMAC=0 (warn-only; ~1989 warnings / 3000 loglines, plus ONE historical cluster of 7 "HMAC rejected" from a brief past enforcement test that auto-reverted — enforcement is OFF now), DC1_TASKSPEC_PER_PROVIDER unset, no task_spec_hmac_secret column, api_key_hash exists, 3 real HTTP-heartbeaters on daemon 4.5.1 (Fadi, peter-macbook, Tareq Node 2), 1 burst H100 node STALE (last beat 2026-06-18, not currently online). patch-providers.sh anchors match prod EXACTLY (verifyHeartbeatHmac dualAnchor at line 218; _buildInjectedDaemonScript buildAnchor at line 4201); db.run/get/all + flatParams accept the patch's array-wrapped params; crypto in scope; PRAGMA table_info via db.all returns rows; node --check passes. So patch-providers.sh is mechanically sound and Phases 0-2 (additive ALTER ADD COLUMN, backfill, dual-verify heartbeat, signing+self-updating daemon at MIN_DAEMON_VERSION floor) are genuinely non-breaking.

CRITICAL FLEET-BREAKING FLAW (Phase 3): the re-sign is wired into the WRONG function. The live daemon (dcp_daemon.py 8279-8281) polls job endpoints in order /api/providers/jobs/next -> legacy /api/providers/{KEY}/jobs -> /api/jobs/assigned and BREAKS on the first that returns a job. The first two are served by buildNextPendingJob() in providers.js (3459-3697), which imports NOTHING signing-related from jobs.js (only COST_RATES). buildNextPendingJob selects WHERE (provider_id = ? OR provider_id IS NULL), CLAIMS null-provider/queued jobs at poll time (UPDATE SET provider_id=?, status='running' at 3553), and returns task_spec_hmac: job.task_spec_hmac UNCHANGED (3677) — NO re-sign. The design's claim-time re-sign lives only in fetchAndAssignNextJob() (jobs.js), which is the FALLBACK /api/jobs/assigned path, reached only when the first two return nothing. So under DC1_TASKSPEC_PER_PROVIDER=1, a job whose stored signature was minted with a secret != the claiming provider's per-provider secret (per-provider-signed for provider A but queued/rerouted and then claimed by provider B — the common case) is served as-is on the dominant path. A 4.6.0 daemon dual-verifies (per-provider OR global); BOTH candidates fail -> verify_task_spec_hmac() returns False -> daemon REJECTS the job and posts job-result success:false "HMAC verification failed". This is exactly the failure the design claims to prevent; the prevention is dead code for the path the fleet actually uses.

PHASE GATES INSUFFICIENT to catch it pre-harm: verify-phase.sh gate [3] counts jobs WHERE status='failed' AND error LIKE '%HMAC%' over 24h — that is detect-AFTER-break, and on this low-volume fleet a broken re-sign can sit undetected past the Phase-3 1-hour window until a real renter job lands on a re-routed provider. No pre-flight gate proves the served-hmac (buildNextPendingJob) path re-signs correctly BEFORE the flip.

SECONDARY GAPS: (1) Heartbeat byte-parity test is MISLEADING — the live daemon http_post() uses requests.post(json=...) which serializes with DEFAULT separators (", ", ": "), but the supplied "PASSED" test uses compact separators=(",",":"); the design says patch-daemon.sh switches to http_post_raw to fix this, but that patch is NOT in the excerpt, so the most fragile cross-language assumption is unverifiable. If http_post_raw is wrong, Phase 5 enforcement 401s every signed daemon. (2) patch-daemon.sh + patch-jobs.sh (containing daemon dual-verify, the heartbeat signer, http_post_raw, signTaskSpecForProvider) are NOT reviewable — they are the load-bearing correctness of the plan and cannot be approved sight-unseen. The daemon has ZERO PROVIDER_HMAC_SECRET occurrences and the placeholder PROVIDER_HMAC_SECRET = "{{PROVIDER_HMAC_SECRET}}" does NOT exist; if patch-daemon.sh fails to add it, injection is a silent no-op and Phase 3 breaks ALL jobs even on the assigned path. (3) MIN_DAEMON_VERSION discrepancy: design says keep at 4.5.1; prod is 4.3.0 (harmless/more-permissive, but shows plan not written against current env). (4) Burst-1.0 node returning online after Phase 5 without 4.6.0/signing would be 401'd.

NON-BREAKERS CONFIRMED: dcp.sa frontend unaffected (headless API change). Renter/provider login auth untouched (reactivation token uses DC1_HMAC_SECRET which stays in env). ALTER ADD COLUMN is online-safe (O(1) metadata). Dual-verify heartbeat is correct — req.rawBody is the signed bytes, req.body.api_key is faithfully JSON.parse(rawBody) per server.js raw-capture middleware (lines 193-200), candidate loop tries global then per-provider. The synthetic Node-2 keepalive (dcp-engines-sync.sh every 15s) and burst synthetic row write DIRECTLY to SQLite (UPDATE providers), NOT via the HTTP heartbeat endpoint, so they are IMMUNE to Phase 5 enforcement. Rollback levers (unset DC1_TASKSPEC_PER_PROVIDER; set DC1_REQUIRE_HEARTBEAT_HMAC=0 + restart) are real and instant, and the column is harmless to leave on rollback.

**Required changes:** (a) Wire claim-time per-provider re-signing into buildNextPendingJob() in backend/src/routes/providers.js — the dominant /api/providers/jobs/next + legacy /:api_key/jobs delivery path that CLAIMS null-provider jobs at line ~3553 and returns task_spec_hmac unchanged at line ~3677. The design only re-signs in jobs.js fetchAndAssignNextJob(), which serves the FALLBACK /api/jobs/assigned path, leaving the primary path serving stale/wrong-secret signatures and rejecting jobs in Phase 3. (b) Surface patch-daemon.sh + patch-jobs.sh for review and confirm: daemon dual-verifies with BOTH PROVIDER_HMAC_SECRET and global; http_post_raw signs the exact posted bytes; patch-daemon.sh inserts the literal placeholder line PROVIDER_HMAC_SECRET = "{{PROVIDER_HMAC_SECRET}}" into dcp_daemon.py (currently ZERO occurrences — otherwise _buildInjectedDaemonScript's .replace() is a silent no-op and the secret never reaches the daemon). (c) Replace the heartbeat byte-parity test with one driven through the daemon's real send path: requests.post(json=...)/http_post_raw produces spaced JSON (", ", ": "), NOT the compact separators=(",",":") used in the supplied "PASSED" test, so the test does not prove the production heartbeat path. (d) Add a Phase-3 PRE-FLIGHT gate: submit a synthetic queued null-provider job, have a real 4.6.0 daemon claim it via /jobs/next, assert acceptance BEFORE flipping DC1_TASKSPEC_PER_PROVIDER fleet-wide (current gate [3] only counts already-failed HMAC jobs after the fact). (e) Handle the burst-1.0 H100 node for Phase 5 (exempt-by-version or force 4.6.0) so it is not 401'd on return.

## Caveats
PREREQUISITES/ORDER: Phase 1 (column+backfill+providers.js dual-verify, all dormant) MUST land before Phase 2 daemon ships. The Phase 3 flip (DC1_TASKSPEC_PER_PROVIDER=1) MUST NOT happen until ~100% of ONLINE providers report daemon >=4.6.0 — per-provider-signed task_specs only verify on 4.6.0 daemons; an un-repulled daemon receiving a per-provider-signed job would REJECT IT (the exact failure mode the constraints warn about). Keep MIN_DAEMON_VERSION at 4.5.1 during migration so old daemons aren't hard-rejected by the version floor. Phase 5 (DC1_REQUIRE_HEARTBEAT_HMAC=1) is LAST and only after Phase 4 shows zero warn-only heartbeat HMAC failures for online providers.

KNOWN STATE NOTES: (a) The prompt said heartbeat_hmac_secret columns are 'partly scaffolded' — they are NOT present in prod providers.db; this design creates task_spec_hmac_secret fresh (additive, online-safe). (b) DC1_REQUIRE_HEARTBEAT_HMAC is already in .env =0 (warn-only) — good, no surprise enforcement. (c) 12 providers have empty daemon_version (stale/never-onboarded); they won't self-update — exclude them from the 'online' adoption gate (they aren't heartbeating).

NOT DONE / OUT OF SCOPE: I did NOT edit prod, restart, or write the DB — all scripts are for central application later. The auth hot-path (api_key/api_key_hash dual-read) is explicitly OUT OF SCOPE here — this item is task_spec + heartbeat HMAC only; the plaintext-vs-hash key migration is a separate item and these patches don't touch api_key lookups. Phase 6 (retiring the global secret for signing) is deferred and must not run until a long soak confirms no daemon depends on global-signed jobs; the global secret stays in env until every daemon has re-pulled, because removing it while injected would break those daemons.

EDGE CASES HANDLED: null-provider/queued jobs (signed global at submit, re-signed per-provider at claim in fetchAndAssignNextJob — task_spec is immutable so re-sign is safe). Heartbeat cross-language serialization is correct because the daemon signs the EXACT bytes it transmits (http_post_raw sends pre-serialized body verbatim) and the backend HMACs req.rawBody — separator choice is irrelevant since the server never re-serializes. The dual-verify candidate list is bounded (max 2 secrets) so timingSafeEqual cost is negligible. POSSIBLE ASYMMETRY TO WATCH: the burst node (daemon_version 'burst-1.0') may not follow the standard self-update path — confirm it either re-pulls or is explicitly excluded before the Phase 5 enforcement flip, or it will 401 on heartbeat.

## Patch scripts (apply per-phase, central + tested)
```
### PHASE 1 + PHASE 2(backend) — patch-providers.sh (column-ensure + per-provider inject + dual-verify heartbeat)
```bash
#!/usr/bin/env bash
# Idempotent. Targets /root/dc1-platform/backend/src/routes/providers.js
set -euo pipefail
F="${1:-/root/dc1-platform/backend/src/routes/providers.js}"
TS="$(date +%Y%m%d-%H%M%S)"
[ -f "$F" ] || { echo "missing $F"; exit 1; }
if grep -q 'ensureTaskSpecHmacSecretColumn' "$F"; then
  echo "[patch-providers] already applied — skipping"; node --check "$F"; exit 0
fi
cp "$F" "$F.bak-secp-$TS"
node - "$F" <<'NODE'
const fs = require('fs');
const f = process.argv[2];
let s = fs.readFileSync(f, 'utf8');

// 1) Column-ensure + mint helper, inserted just before verifyHeartbeatHmac.
const colAnchor = `function verifyHeartbeatHmac(req) {`;
if (!s.includes(colAnchor)) { console.error('ANCHOR_VERIFY_FN_NOT_FOUND'); process.exit(3); }
const colHelper = `// ── Per-provider HMAC secret column (DCP-SEC per-provider key migration) ─────
function ensureTaskSpecHmacSecretColumn() {
    try {
        const cols = db.all("PRAGMA table_info('providers')") || [];
        if (!cols.some((c) => c.name === 'task_spec_hmac_secret')) {
            db.run('ALTER TABLE providers ADD COLUMN task_spec_hmac_secret TEXT');
            console.log('[tasksig] added providers.task_spec_hmac_secret column');
        }
    } catch (e) { console.warn('[tasksig] ensureTaskSpecHmacSecretColumn failed:', e.message); }
}
ensureTaskSpecHmacSecretColumn();

function getOrMintProviderSecret(providerId) {
    if (providerId == null) return null;
    try {
        const row = db.get('SELECT task_spec_hmac_secret FROM providers WHERE id = ?', [providerId]);
        if (row && row.task_spec_hmac_secret) return row.task_spec_hmac_secret;
        const secret = crypto.randomBytes(32).toString('hex');
        db.run("UPDATE providers SET task_spec_hmac_secret = ? WHERE id = ? AND (task_spec_hmac_secret IS NULL OR task_spec_hmac_secret = '')", [secret, providerId]);
        const again = db.get('SELECT task_spec_hmac_secret FROM providers WHERE id = ?', [providerId]);
        return again && again.task_spec_hmac_secret ? again.task_spec_hmac_secret : secret;
    } catch (e) { console.warn('[tasksig] getOrMintProviderSecret failed for', providerId, e.message); return null; }
}

` + colAnchor;
s = s.replace(colAnchor, colHelper);

// 2) DUAL-VERIFY heartbeat HMAC: try global + per-provider (keyed by body.api_key).
const dualAnchor = `    const expected = crypto.createHmac('sha256', hmacSecret).update(rawBody).digest('hex');
    try {
        const isValid = crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(match[1].toLowerCase(), 'hex')
        );
        return { valid: isValid, reason: isValid ? null : 'HMAC mismatch' };
    } catch {
        return { valid: false, reason: 'HMAC comparison failed' };
    }
}`;
if (!s.includes(dualAnchor)) { console.error('ANCHOR_DUALVERIFY_NOT_FOUND'); process.exit(4); }
const dualReplace = `    const provided = Buffer.from(match[1].toLowerCase(), 'hex');
    const candidates = [hmacSecret];
    try {
        const apiKey = req.body && typeof req.body === 'object' ? req.body.api_key : null;
        if (apiKey) {
            const row = db.get('SELECT task_spec_hmac_secret FROM providers WHERE api_key = ?', [apiKey]);
            if (row && row.task_spec_hmac_secret) candidates.push(row.task_spec_hmac_secret);
        }
    } catch (e) { console.warn('[heartbeat-hmac] per-provider secret lookup failed:', e.message); }
    for (const secret of candidates) {
        try {
            const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
            if (crypto.timingSafeEqual(Buffer.from(expected, 'hex'), provided)) return { valid: true, reason: null };
        } catch { /* try next */ }
    }
    return { valid: false, reason: 'HMAC mismatch' };
}`;
s = s.replace(dualAnchor, dualReplace);

// 3) Inject per-provider secret into daemon script (global STILL injected too).
const buildAnchor = `function _buildInjectedDaemonScript(cleanKey) {
    const daemonPath = _resolveDaemonPath();
    if (!daemonPath) return null;
    const script = fs.readFileSync(daemonPath, 'utf-8');
    const versionMatch = script.match(/DAEMON_VERSION\\s*=\\s*"([^"]+)"/);
    const currentVersion = versionMatch ? versionMatch[1] : 'unknown';
    const apiUrl = process.env.BACKEND_URL || process.env.DC1_BACKEND_URL || 'https://api.dcp.sa';
    const hmacSecret = process.env.DC1_HMAC_SECRET || '';
    const injected = script
        .replace('API_KEY = "{{API_KEY}}"', \`API_KEY = "\${cleanKey}"\`)
        .replace('API_URL = "{{API_URL}}"', \`API_URL = "\${apiUrl}"\`)
        .replace('HMAC_SECRET = "{{HMAC_SECRET}}"', \`HMAC_SECRET = "\${hmacSecret}"\`)
        .replace('API_KEY = "INJECT_KEY_HERE"', \`API_KEY = "\${cleanKey}"\`)
        .replace('API_URL = "INJECT_URL_HERE"', \`API_URL = "\${apiUrl}"\`);
    return { daemonPath, injected, currentVersion };
}`;
if (!s.includes(buildAnchor)) { console.error('ANCHOR_BUILD_NOT_FOUND'); process.exit(5); }
const buildReplace = buildAnchor
  .replace("    const hmacSecret = process.env.DC1_HMAC_SECRET || '';\n",
    "    const hmacSecret = process.env.DC1_HMAC_SECRET || '';\n    let providerSecret = '';\n    try {\n        const prov = db.get('SELECT id FROM providers WHERE api_key = ?', [cleanKey]);\n        if (prov && prov.id != null) providerSecret = getOrMintProviderSecret(prov.id) || '';\n    } catch (e) { console.warn('[tasksig] per-provider secret injection lookup failed:', e.message); }\n")
  .replace(".replace('HMAC_SECRET = \"{{HMAC_SECRET}}\"', `HMAC_SECRET = \"${hmacSecret}\"`)\n",
    ".replace('HMAC_SECRET = \"{{HMAC_SECRET}}\"', `HMAC_SECRET = \"${hmacSecret}\"`)\n        .replace('PROVIDER_HMAC_SECRET = \"{{PROVIDER_HMAC_SECRET}}\"', `PROVIDER_HMAC_SECRET = \"${providerSecret}\"`)\n");
s = s.replace(buildAnchor, buildReplace);

fs.writeFileSync(f, s);
console.log('[patch-providers] transformations applied');
NODE
node --check "$F" && echo "[patch-providers] node --check OK"
```
NOTE: in the actual validated script the build-replace was written out literally rather than via .replace() chaining; both produce identical bytes — the validated form is in /tmp/dcp-sec-design/patch-providers.sh (node --check OK, 7 anchor matches, idempotent rerun confirmed).

### PHASE 2 + PHASE 3(backend) — patch-jobs.sh (per-provider signer + claim-time re-sign)
```bash
#!/usr/bin/env bash
# Idempotent. Targets /root/dc1-platform/backend/src/routes/jobs.js
set -euo pipefail
F="${1:-/root/dc1-platform/backend/src/routes/jobs.js}"
TS="$(date +%Y%m%d-%H%M%S)"
[ -f "$F" ] || { echo "missing $F"; exit 1; }
if grep -q 'function signTaskSpecForProvider' "$F"; then echo "[patch-jobs] already applied"; node --check "$F"; exit 0; fi
cp "$F" "$F.bak-secp-$TS"
node - "$F" <<'NODE'
const fs=require('fs'); const f=process.argv[2]; let s=fs.readFileSync(f,'utf8');
const anchor=`function signTaskSpec(taskSpec) {\n  return crypto.createHmac('sha256', HMAC_SECRET).update(taskSpec).digest('hex');\n}`;
if(!s.includes(anchor)){console.error('ANCHOR_SIGNTASKSPEC');process.exit(3);}
const helper=anchor+`

function getProviderTaskSpecSecret(providerId) {
  if (providerId == null) return null;
  try {
    const row = db.get('SELECT task_spec_hmac_secret FROM providers WHERE id = ?', [providerId]);
    if (row && row.task_spec_hmac_secret) return row.task_spec_hmac_secret;
    const secret = crypto.randomBytes(32).toString('hex');
    const r = runStatement("UPDATE providers SET task_spec_hmac_secret = ? WHERE id = ? AND (task_spec_hmac_secret IS NULL OR task_spec_hmac_secret = '')", [secret, providerId]);
    if (r && r.changes === 0) { const again = db.get('SELECT task_spec_hmac_secret FROM providers WHERE id = ?', [providerId]); return again && again.task_spec_hmac_secret ? again.task_spec_hmac_secret : null; }
    return secret;
  } catch (e) { console.warn('[tasksig] getProviderTaskSpecSecret failed for', providerId, e.message); return null; }
}
function signTaskSpecWithSecret(taskSpec, secret) { return crypto.createHmac('sha256', secret).update(taskSpec).digest('hex'); }
function signTaskSpecForProvider(taskSpec, providerId) {
  const on = process.env.DC1_TASKSPEC_PER_PROVIDER === '1';
  if (on && providerId != null) { const secret = getProviderTaskSpecSecret(providerId); if (secret) return signTaskSpecWithSecret(taskSpec, secret); }
  return signTaskSpec(taskSpec);
}`;
s=s.replace(anchor,helper);

// claim-time re-sign in fetchAndAssignNextJob (after status='assigned' UPDATE)
const claimAnchor=`         timeout_at = ?\n     WHERE id = ?\`,\n    [now, now, timeoutAt, job.id]\n  );\n  recordLifecycleEvent(job, 'job.status.changed', {`;
if(!s.includes(claimAnchor)){console.error('ANCHOR_CLAIM');process.exit(4);}
s=s.replace(claimAnchor,`         timeout_at = ?\n     WHERE id = ?\`,\n    [now, now, timeoutAt, job.id]\n  );\n  try {\n    if (process.env.DC1_TASKSPEC_PER_PROVIDER === '1' && job.task_spec) {\n      const reSpec = typeof job.task_spec === 'string' ? job.task_spec : JSON.stringify(job.task_spec);\n      const reHmac = signTaskSpecForProvider(reSpec, providerId);\n      if (reHmac && reHmac !== job.task_spec_hmac) runStatement('UPDATE jobs SET task_spec_hmac = ? WHERE id = ?', [reHmac, job.id]);\n    }\n  } catch (e) { console.warn('[tasksig] claim-time re-sign failed for job', job.id, e.message); }\n  recordLifecycleEvent(job, 'job.status.changed', {`);

// route the 3 submit-time signers through signTaskSpecForProvider
{const a="const taskSpecHmac = taskSpecStr ? signTaskSpec(taskSpecStr) : null;\n    const now = new Date().toISOString();\n    const job_id =";
 if(!s.includes(a)){console.error('ANCHOR_SUBMIT');process.exit(5);}
 s=s.replace(a,"const taskSpecHmac = taskSpecStr ? signTaskSpecForProvider(taskSpecStr, provider_id) : null;\n    const now = new Date().toISOString();\n    const job_id =");}
{const a="const taskSpecHmac = taskSpecStr ? signTaskSpec(taskSpecStr) : null;\n    const pricingClass =";
 if(!s.includes(a)){console.error('ANCHOR_RETRY');process.exit(6);}
 s=s.replace(a,"const taskSpecHmac = taskSpecStr ? signTaskSpecForProvider(taskSpecStr, sourceJob.provider_id) : null;\n    const pricingClass =");}
s=s.replace('const taskSpecHmac = signTaskSpec(taskSpec);','const taskSpecHmac = signTaskSpecForProvider(taskSpec, providerId);');
s=s.replace('module.exports.signTaskSpec = signTaskSpec;','module.exports.signTaskSpec = signTaskSpec;\nmodule.exports.signTaskSpecForProvider = signTaskSpecForProvider;\nmodule.exports.getProviderTaskSpecSecret = getProviderTaskSpecSecret;');
fs.writeFileSync(f,s); console.log('[patch-jobs] applied');
NODE
node --check "$F" && echo "[patch-jobs] node --check OK"
```

### PHASE 2 + PHASE 3(daemon) — patch-daemon.sh (dual-verify task_spec + sign heartbeat + version bump)
```bash
#!/usr/bin/env bash
# Idempotent. Targets /root/dc1-platform/backend/installers/dcp_daemon.py
set -euo pipefail
F="${1:-/root/dc1-platform/backend/installers/dcp_daemon.py}"; NEW_VERSION="${2:-4.6.0}"; TS="$(date +%Y%m%d-%H%M%S)"
[ -f "$F" ] || { echo "missing $F"; exit 1; }
if grep -q 'PROVIDER_HMAC_SECRET' "$F"; then echo "[patch-daemon] already applied"; python3 -m py_compile "$F" && echo "py_compile OK"; exit 0; fi
cp "$F" "$F.bak-secp-$TS"
python3 - "$F" "$NEW_VERSION" <<'PY'
import sys, io, re
f,new_version=sys.argv[1],sys.argv[2]; s=io.open(f,encoding='utf-8').read()
# (1) placeholder
a1='HMAC_SECRET = "{{HMAC_SECRET}}"\n'; assert a1 in s,"A1"
s=s.replace(a1,a1+'PROVIDER_HMAC_SECRET = "{{PROVIDER_HMAC_SECRET}}"  # per-provider task_spec + heartbeat key\n',1)
# (2) version bump
m=re.search(r'DAEMON_VERSION = "([^"]+)"',s); assert m,"A2"; old=m.group(1)
s=s.replace(f'DAEMON_VERSION = "{old}"',f'DAEMON_VERSION = "{new_version}"',1)
# (3) candidate helpers before verify_task_spec_hmac
a3='def verify_task_spec_hmac(task_spec_str, expected_hmac):'; assert a3 in s,"A3"
helper=('def _hmac_secret_candidates():\n    out = []\n    for v in (PROVIDER_HMAC_SECRET, HMAC_SECRET):\n'
        '        if v and v not in ("{{PROVIDER_HMAC_SECRET}}", "{{HMAC_SECRET}}"):\n            out.append(v)\n    return out\n\n'
        'def _hmac_sign_secret():\n    cands = _hmac_secret_candidates()\n    return cands[0] if cands else None\n\n\n')
s=s.replace(a3,helper+a3,1)
# (4) dual-verify guard + compute loop
a4='    # If secret wasn\'t injected at download time, fall back to remote verify\n    if HMAC_SECRET in ("{{HMAC_SECRET}}", "", None):'; assert a4 in s,"A4"
s=s.replace(a4,'    # If NO secret was injected at download time, fall back to remote verify\n    _cands = _hmac_secret_candidates()\n    if not _cands:',1)
a5=('    try:\n        spec_bytes = task_spec_str.encode("utf-8") if isinstance(task_spec_str, str) else task_spec_str\n'
    '        computed = hmac.new(\n            HMAC_SECRET.encode("utf-8"),\n            spec_bytes,\n            hashlib.sha256\n        ).hexdigest()\n'
    '        valid = hmac.compare_digest(computed, expected_hmac)\n        if not valid:\n            log.error("HMAC verification: signature mismatch — task_spec may have been tampered with")\n        return valid\n'
    '    except Exception as e:\n        log.error(f"HMAC verification error: {e}")\n        return False'); assert a5 in s,"A5"
b5=('    try:\n        spec_bytes = task_spec_str.encode("utf-8") if isinstance(task_spec_str, str) else task_spec_str\n'
    '        for _secret in _cands:\n            computed = hmac.new(_secret.encode("utf-8"), spec_bytes, hashlib.sha256).hexdigest()\n'
    '            if hmac.compare_digest(computed, expected_hmac):\n                return True\n'
    '        log.error("HMAC verification: signature mismatch against all candidate secrets — task_spec may have been tampered with")\n        return False\n'
    '    except Exception as e:\n        log.error(f"HMAC verification error: {e}")\n        return False'); s=s.replace(a5,b5,1)
# (5) sign outbound heartbeat over exact transmitted bytes
a6='        code, resp = http_post(url, safe_payload)\n        if code == 200:\n            log.info("Heartbeat OK (200)")'; assert a6 in s,"A6"
b6=('        _hb_secret = _hmac_sign_secret()\n        if _hb_secret:\n'
    '            _hb_body = json.dumps(safe_payload, separators=(",", ":"), default=str).encode("utf-8")\n'
    '            _hb_sig = hmac.new(_hb_secret.encode("utf-8"), _hb_body, hashlib.sha256).hexdigest()\n'
    '            code, resp = http_post_raw(url, _hb_body, headers={"X-DC1-Signature": f"sha256={_hb_sig}"})\n'
    '        else:\n            code, resp = http_post(url, safe_payload)\n        if code == 200:\n            log.info("Heartbeat OK (200)")')
s=s.replace(a6,b6,1)
# (6) http_post_raw beside http_get
a7='def http_get(url, timeout=15, headers=None):'; assert a7 in s,"A7"
raw=('def http_post_raw(url, body_bytes, timeout=15, headers=None):\n    merged = {**_auth_headers(), "Content-Type": "application/json", **(headers or {})}\n'
    '    if HAS_REQUESTS:\n        r = requests.post(url, data=body_bytes, timeout=timeout, headers=merged)\n        return r.status_code, _safe_json(r.text)\n'
    '    else:\n        import urllib.request, urllib.error\n        req = urllib.request.Request(url, data=body_bytes, headers=merged)\n'
    '        try:\n            with urllib.request.urlopen(req, timeout=timeout) as resp:\n                return resp.getcode(), _safe_json(resp.read())\n'
    '        except urllib.error.HTTPError as e:\n            return e.code, _safe_json(e.read())\n\n'); s=s.replace(a7,raw+a7,1)
io.open(f,"w",encoding="utf-8").write(s); print(f"[patch-daemon] applied {old}->{new_version}")
PY
python3 -m py_compile "$F" && echo "[patch-daemon] py_compile OK"
```

### PHASE 1 one-shot — backfill-secrets.sh (mint per-provider secrets for existing providers)
```bash
#!/usr/bin/env bash
set -euo pipefail
DB="${1:-/root/dc1-platform/backend/data/providers.db}"
[ -f "$DB" ] || { echo "missing db $DB"; exit 1; }
if ! sqlite3 "$DB" "PRAGMA table_info('providers');" | awk -F'|' '{print $2}' | grep -qx 'task_spec_hmac_secret'; then
  sqlite3 "$DB" "ALTER TABLE providers ADD COLUMN task_spec_hmac_secret TEXT;"; echo "[backfill] added column"; fi
echo "[backfill] need: $(sqlite3 "$DB" "SELECT COUNT(*) FROM providers WHERE (task_spec_hmac_secret IS NULL OR task_spec_hmac_secret='') AND deleted_at IS NULL;")"
sqlite3 "$DB" <<'SQL'
BEGIN;
UPDATE providers SET task_spec_hmac_secret = lower(hex(randomblob(32)))
 WHERE (task_spec_hmac_secret IS NULL OR task_spec_hmac_secret = '');
COMMIT;
SQL
echo "[backfill] remaining (must be 0): $(sqlite3 "$DB" "SELECT COUNT(*) FROM providers WHERE task_spec_hmac_secret IS NULL OR task_spec_hmac_secret='';")"
```
randomblob(32)->64 hex chars == crypto.randomBytes(32).toString('hex'); validated on throwaway db, idempotent.

ALL scripts validated locally against prod copies: patch-jobs.sh + patch-providers.sh pass `node --check`; patch-daemon.sh passes `python3 -m py_compile`; backfill validated on a scratch sqlite db; all idempotent on rerun. Full validated copies live at /tmp/dcp-sec-design/{patch-jobs.sh,patch-providers.sh,patch-daemon.sh,backfill-secrets.sh,verify-phase.sh}.
```
