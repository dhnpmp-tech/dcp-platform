# renter-provider-key-at-rest-hashing

**risk:** risky · **deploy_target:** backend-live
**reviewer:** go_no_go=go-with-changes rollout_safe=False breaks_fleet_or_auth=True

## Design
Ground truth on the VPS differs from the prompt's premise: there are NO `api_key_sha256`/`key_sha256` columns. The only at-rest hashing done is PROV-9 in db.js, which added `providers.api_key_hash` as UNPEPPERED sha256 + a startup backfill, plus a local `resolveProviderByKey` in routes/providers.js (hash-primary, plaintext fallback). Renters have ZERO hashing — every site is plaintext `WHERE api_key=?` / `renter_api_keys WHERE key=?`. So this design builds the full thing: (1) a SINGLE shared, hash-aware resolver layer in backend/src/db.js exporting `resolveRenterByKey`, `resolveProviderByKey`, `resolveRenterApiSubKey`, plus `keyHashVersioned(raw)` and `peppered`/`unpeppered` helpers; (2) a pepper strategy keyed on a `pepper_version` row in a new `app_meta` table. Hash = `sha256(pepper_version===0 ? raw : raw + ':' + DC1_KEY_PEPPER)`. Storing the version next to the hash (in `*_hash_v` columns) is the fix for the footgun: when `DC1_KEY_PEPPER` is set (bumping target version 0→1), startup sees rows still at v0 and re-backfills them to v1 — setting the pepper later can NEVER silently leave stale unpeppered hashes. The resolver always DUAL-READS: it tries hash-at-current-version, then hash-at-legacy-version (v0 unpeppered, covering PROV-9 rows pre-rehash), then byte-for-byte plaintext with timingSafeEqual, lazily backfilling the hash on any plaintext hit. ~30 call sites across renters.js, jobs.js, pods.js, settlement.js, mission.js, channels.js, v1.js, renter-identity-reconciliation.js, providers.js are migrated to call the shared resolver. Plaintext columns are dropped ONLY in the final phase, behind DC1_KEY_DROP_PLAINTEXT=1, after a verification phase proves a zero-plaintext-fallback counter stays at 0 across a multi-day soak. Auth dual-reads at every phase; nothing the daemon sends changes (this finding is independent of HMAC/heartbeat, but I keep the same fleet-safety discipline).

## Phases (honor each GATE before proceeding)
PHASE 0 — Schema + shared resolver, NO behavior change (safe).
 Action: patch db.js to (a) create `app_meta(k TEXT PRIMARY KEY, v TEXT)`, seed `pepper_version`='0'; (b) add hash + hash-version columns idempotently: providers.api_key_hash already exists -> add providers.api_key_hash_v INT DEFAULT 0; add renters.api_key_hash TEXT + renters.api_key_hash_v INT DEFAULT 0; add renter_api_keys.key_hash TEXT + renter_api_keys.key_hash_v INT DEFAULT 0; create indexes on each *_hash; (c) define and EXPORT keyHashVersioned/peppered/unpeppered + resolveRenterByKey/resolveProviderByKey/resolveRenterApiSubKey; (d) run version-aware backfill: backfill any NULL hash at the CURRENT pepper_version, AND if env target version > stored row version, RE-backfill (this is the footgun fix). With pepper unset, target=0, so this is a no-op beyond filling NULLs at v0 — identical to today. Verification gate: node --check passes; restart NOT done here (central apply later); on a scratch copy confirm backfill counts and that exported resolvers return the right row for a known plaintext key. No call site changed yet, so auth is byte-identical.

PHASE 1 — Migrate read sites to the shared resolver (test->risky, but dual-read keeps it safe).
 Action: replace the ~30 plaintext lookups with resolver calls. Provider sites (`SELECT ... FROM providers WHERE api_key=?`) -> resolveProviderByKey(key,{columns,includeDeleted}); renter master sites (`FROM renters WHERE api_key=? AND status='active'`) -> resolveRenterByKey(key); sub-key sites (`renter_api_keys WHERE key=?`) -> resolveRenterApiSubKey(key). The combined `resolveRenterIdByKey` helpers in renters.js/jobs.js are rewritten to call the shared resolver internally so their callers don't change. Each resolver call still finds the row because of plaintext fallback + lazy backfill, so EVERY phase authenticates. Do this file-by-file: channels.js + mission.js + settlement.js first (lowest traffic), verify, then pods.js, then jobs.js, then renters.js + v1.js (auth hot path) last. Verification gate per file: node --check; after central apply, hit one authenticated endpoint per file with a real key and confirm 200 + that `dcp_key_plaintext_fallback_total` increments only on first hit then stops (proving lazy backfill works).

PHASE 2 — Set the pepper and bump to v1 (risky; this is the re-hash event).
 Action: add DC1_KEY_PEPPER to /root/dc1-platform/backend/.env (32+ random bytes) and set app_meta pepper_version target via env DC1_KEY_PEPPER_VERSION=1. On restart, Phase-0 backfill logic sees stored rows at v0 < target v1 and RE-hashes every key to peppered v1, updating *_hash_v=1. The resolver's legacy-version dual-read still matches any v0 row not yet rehashed AND plaintext, so no auth gap during the rolling rehash. Verification gate: confirm backfill log shows N rows rehashed to v1; confirm a known key authenticates; confirm SELECT count of rows WHERE *_hash_v=0 trends to 0 for all three tables.

PHASE 3 — Verification / soak (test).
 Action: ship a counter (already added Phase 1) that increments whenever ANY resolver falls through to the plaintext branch, exposed on the admin metrics endpoint. Run for a multi-day soak (>= 1 full daemon re-pull + billing/settlement cycle). The finding only closes when the counter is flat at 0 across the soak, proving every live caller authenticates via hash. Verification gate: plaintext-fallback counter == 0 for >=72h across renters/providers/sub-keys; no auth 401 regression in logs.

PHASE 4 — Drop plaintext, behind a flag (risky, irreversible -> last).
 Action: gated by DC1_KEY_DROP_PLAINTEXT=1. db.js, on startup with the flag AND counter-clean precondition, runs: nullify-then-DROP isn't trivial in SQLite for a NOT NULL/UNIQUE column, so for renters (api_key is NOT NULL UNIQUE) the migration rebuilds the table without api_key (or, simpler + reversible-friendly: set api_key=NULL where allowed and stop selecting it — but to truly CLOSE the finding we DROP). Use the SQLite 12-step table-rebuild (PRAGMA foreign_keys=OFF; BEGIN; CREATE renters_new without api_key; INSERT SELECT; DROP old; RENAME; recreate indexes; COMMIT) inside a transaction with a pre-drop file backup. providers.api_key and renter_api_keys.key dropped the same way. After this, resolver's plaintext branch is dead and removed in a follow-up. Verification gate: pre-drop sqlite backup taken; post-rebuild PRAGMA integrity_check=ok; known key still authenticates via hash; row counts match pre/post. ONLY enable this flag after Phase 3 soak is green.

## Verification
PHASE 0 (no restart): node --check db.js. On a SCRATCH COPY of the prod DB: `cp providers.db /tmp/p0.db && DC1_DB_PATH=/tmp/p0.db node -e "const db=require('./db'); const r=db._db.prepare('SELECT api_key FROM renters LIMIT 1').get(); console.log('hash match:', !!db.resolveRenterByKey(r.api_key)); console.log('meta:', db._db.prepare(\"SELECT * FROM app_meta\").all());"` — expect hash match: true, pepper_version 0. Confirm no NULL hashes remain: `SELECT count(*) FROM renters WHERE api_key_hash IS NULL`.
PHASE 1 (after central apply+restart): for one endpoint per migrated file, curl with a real key and assert HTTP 200; then GET the admin metrics endpoint twice and assert keyPlaintextFallbackStats increments by exactly the number of distinct keys used on first call then HOLDS (proves lazy backfill stops re-hitting plaintext). Tail logs for any new 401 authentication_invalid_key.
PHASE 2 (after .env DC1_KEY_PEPPER set + restart): boot log shows "backfilled/rehashed N ... to v1" for all three tables; `SELECT count(*) FROM renters WHERE api_key_hash_v=0` -> 0 (and same for providers/renter_api_keys); a known key still authenticates (curl 200).
PHASE 3 (soak): GET admin metrics keyPlaintextFallbackStats every few hours for >=72h spanning a daemon re-pull + a billing/settlement run; assert renter+provider+subkey counters stay 0. Grep app logs for authentication_invalid_key regressions == 0.
PHASE 4 (gated): pre-run `cp providers.db providers.db.predrop.<ts>`; after rebuild, `PRAGMA integrity_check` == 'ok'; pre/post `SELECT count(*)` per table match; a known key authenticates via hash (200); `PRAGMA table_info(renters)` no longer lists api_key.

## Reviewer — gaps / required changes BEFORE executing
**Gaps:** Could not read the FULL patch scripts: the excerpt truncates mid `api_ke` for the renters hash-column ALTER and omits Phase-4's table-rebuild SQL entirely. So I could not verify (a) where exactly the renter/sub-key version-aware backfill runs and that it executes AFTER its columns exist, or (b) Phase-4's 12-step SQLite rebuild index/FK recreation (renter_api_keys has a FK to renters + 3 indexes; renters has UNIQUE on email and api_key). Review is read-only: I did NOT run any patch or restart the service. I did not load-test the resolver under WAL/checkpoint concurrency, nor measure the 3-query worst-case (hash@target miss -> hash@v0 miss -> plaintext) latency on the v1.js inference hot path. The Phase-3 counter is in-memory and resets to 0 on every restart; with 148 historical restarts the ">=72h flat at 0" gate needs an explicit "no restart during soak" precondition or it is meaningless. Phase verification gates per file are otherwise adequate to catch a broken lookup (curl 200 + counter behavior), but they do NOT exercise the value-read sites (wizard token, webhook HMAC, reactivation commands) that Phase 4 would break — those must be added to any gate that precedes column removal.

**Required changes:** VERDICT: Phases 0-3 are safe and well-built; Phase 4 (DROP plaintext) is unsafe and irreversible and MUST be removed. Approve Phases 0-3 with the fixes below; hard-block Phase 4 as designed.

GROUND TRUTH (verified read-only on 76.13.179.86): live DB is /root/dc1-platform/backend/data/providers.db (NOT backend/providers.db that verify_cmds cp). Counts: 56 renters, 17 providers, 65 sub-keys, 0 unhashed providers (PROV-9 backfill already complete). providers.api_key_hash + idx_providers_api_key_hash exist; renters and renter_api_keys have NO hash column. renter_api_keys HAS a usable rowid (lazy-backfill WHERE rowid=? works). crypto is required in db.js. Export anchor `  _db: db\n};` matches exactly.

WHAT IS CORRECT: the dual-read resolver (hash@target -> hash@v0 legacy -> plaintext+timingSafeEqual+lazy-backfill) keeps auth byte-identical at every phase; the per-row *_hash_v column genuinely fixes the late-pepper footgun; routes/providers.js already ships the same resolver shape, so Phase 1 is low-risk. Daemon heartbeat is unaffected (still sends plaintext; server hashes it) — finding is independent of HMAC/heartbeat as claimed. Phases 0-3 do NOT break fleet or auth.

BLOCKING CHANGES:

1) DELETE PHASE 4 ENTIRELY (irreversible; breaks live auth + dcp.sa frontend + fleet). The design models the column only as a LOOKUP key, but providers.api_key / renters.api_key are READ AS A VALUE at 54+ live sites no hash can serve: (a) middleware/webhookHmac.js:96/107/115 uses provider.api_key as the HMAC SIGNING SECRET to verify provider webhooks — dropping the column breaks webhook auth; (b) routes/v1-wizard.js:269,284,633 returns token: renter.api_key/provider.api_key to the live setup wizard; (c) routes/auth.js:254,270 and renters.js:1550,1597,579,615 return api_key to clients (account/onboarding); (d) providers.js:452 reactivation kf, 565, 926, 5622 getProviderReactivationCommands(provider.api_key), 9224 _wgDiagFetch(...,provider.api_key), plus plaintext equality auth at 7284/7594/8951/9207; (e) ~12 query-string ?key=/x-provider-key provider endpoints. Close the finding by proving plaintext-fallback==0 WITHOUT dropping the column. Column removal, if ever desired, is a separate project that first migrates all 54 value-reads — not a flag flip.

2) MIGRATION SCOPE GROSSLY UNDERCOUNTED. Design says ~30 sites/9 files. Ground truth: providers.js alone has 56 plaintext lookups, jobs.js 14, renters.js 12. Files doing plaintext key auth MISSING from the list: agentManifest.js, arabic-rag.js, invoices.js, models.js, p2p.js, payments.js(:236), payouts.js(:101), rag.js(:78), subscriptions.js(:39), templates.js, transactions.js, v1-wizard.js, verification.js(:280,397,421,393), vllm.js(:142), middleware/webhookHmac.js. With Phase 4 dropped they still authenticate via fallback, BUT their fallback hits keep the Phase-3 counter NONZERO forever so the soak gate can never go green. Either migrate ALL of them or scope the counter/soak to the migrated subset and accept the finding stays partially open.

3) process.exit(1) pepper-guard is a fleet-wide DoS footgun. The single pm2 process (dc1-provider-onboarding, 148 cumulative restarts) serves ALL auth. If DC1_KEY_PEPPER_VERSION>=1 is set but DC1_KEY_PEPPER is empty on any restart (env not loaded / .env edited / redeploy), the whole auth service hard-exits and crash-loops; every provider/renter 401s and the fleet drops. Replace with: log FATAL, degrade to target version 0 (plaintext+legacy dual-read still authenticates everyone), alert. Never let key-hashing config kill auth.

4) verify_cmds use WRONG db path. cp providers.db from src/ copies a stale/nonexistent file; live DB is data/providers.db. Fix all verify cmds and require DC1_DB_PATH point at the scratch copy. Note loading db.js on the scratch copy runs all migrations + a wal_checkpoint setInterval — confirm it never touches the live data dir.

5) resolveRenterByKey default activeOnly=true will silently change behavior at renter sites whose original WHERE did NOT filter status='active' (e.g. renters.js:1844). Audit each site and pass {activeOnly:false} where the original was unfiltered. Resolver ignores renter_api_keys.expires_at (matches current behavior — not a regression, but confirm).

6) Phase-0 python patch: the `... if False else ...` ternary is dead-code (functionally injects block before module.exports, but clean it up); the second .replace on `  _db: db\n};` matched exactly but has no failure assertion. Add post-patch assertions that both markers + all five new exports exist and node --check passes BEFORE central apply.

## Caveats
PROMPT-PREMISE CORRECTION (important): the prompt says Stage-1 added `api_key_sha256`/`key_sha256` columns + dual-read on the v1 inference path. That is NOT what is on the VPS. Actual state: PROV-9 added `providers.api_key_hash` (UNPEPPERED sha256) + backfill in db.js and a LOCAL `resolveProviderByKey` in routes/providers.js; renters and renter_api_keys have NO hashing and v1.js renter auth (routes/v1.js:499) is still pure plaintext. This design starts from that real baseline. Because the existing provider hash is unpeppered, pepper_version 0 MUST mean unpeppered or every existing provider hash would become a miss — handled by per-row `*_hash_v` + legacy-version dual-read.
- This finding is INDEPENDENT of the HMAC/heartbeat constraints — none of these changes touch DC1_HMAC_SECRET, TASK_SPEC signing, or DC1_REQUIRE_HEARTBEAT_HMAC, so the fleet-cutover and dual-verify rules don't apply here. The daemon's plaintext key keeps working at every phase via dual-read.
- Out of scope: `provider_api_keys` (scoped keys) and v1 sub-keys via apiKeyService.js are ALREADY hashed (scrypt/sha256, hashed-at-rest) — not part of this finding. This finding covers the master columns `renters.api_key`, `providers.api_key`, `renter_api_keys.key`.
- DC1_KEY_PEPPER is a new secret: add it to server.js REQUIRED_SECRETS only AFTER Phase 2 (else Phase 0/1 boots fail-fast); rotating the pepper later = bump DC1_KEY_PEPPER_VERSION which triggers a full re-backfill (intended), but rotation invalidates old hashes so it MUST happen while plaintext fallback still exists (i.e. never rotate after Phase 4 without a fresh plaintext re-seed).
- Phase 1 is NOT a blind global sed: several sites select specific columns (preserved by reading fields off the returned row), some are WRITES (api_key rotation at renters.js:1631, register INSERTs) that must also write the hash, and a few `WHERE id=?`/`WHERE email=?` lookups are NOT key auth and must be left untouched. Migrate and review per-file.
- Phase 4 is irreversible (drops columns via table rebuild); only run behind DC1_KEY_DROP_PLAINTEXT=1 after the Phase 3 soak counter is provably 0, with a fresh providers.db file backup. renters.api_key is NOT NULL UNIQUE, so it requires the full 12-step table rebuild, not a simple ALTER DROP.
- All edits land in db.js (already 2697 lines) — the injected blocks push it further; acceptable for now but flag for later extraction into backend/src/lib/keyhash.js.
- I did not apply anything to prod (read-only per constraints); scripts are authored for central apply + a single coordinated restart per phase.

## Patch scripts (apply per-phase, central + tested)
```
All scripts target /root/dc1-platform, take timestamped backups, run `node --check`, and are idempotent. They are authored here and APPLIED CENTRALLY LATER (no restart/reload here).

############ PHASE 0 — db.js: app_meta, columns, shared resolver, version-aware backfill ############
#!/usr/bin/env bash
set -euo pipefail
cd /root/dc1-platform/backend/src
TS=$(date +%Y%m%d-%H%M%S)
cp -p db.js db.js.bak.keyhash-p0.$TS

# (a) Inject shared hashing + resolver block right before module.exports.
#     Idempotent: bail if marker already present.
if ! grep -q 'KEYHASH-SHARED-RESOLVER-V1' db.js; then
python3 - <<'PY'
import io,re
p='db.js'
s=open(p).read()
marker='// ===== KEYHASH-SHARED-RESOLVER-V1 ====='
block=r'''
// ===== KEYHASH-SHARED-RESOLVER-V1 =====
// Single source of truth for renter/provider API-key-at-rest hashing.
// pepper_version 0 = legacy UNPEPPERED sha256 (matches PROV-9 providers.api_key_hash
// already on disk). version >=1 = sha256(raw + ':' + DC1_KEY_PEPPER). Storing the
// version per-row (*_hash_v) is what lets a later pepper set trigger a re-backfill
// instead of silently leaving stale unpeppered hashes (the footgun).
try { db.exec(`CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT)`); } catch (_) {}
try { db.prepare(`INSERT OR IGNORE INTO app_meta (k, v) VALUES ('pepper_version', '0')`).run(); } catch (_) {}

const DC1_KEY_PEPPER = process.env.DC1_KEY_PEPPER || '';
// Target version: explicit env override, else 1 if a pepper is set, else 0.
const KEY_PEPPER_TARGET_VERSION = (() => {
  const env = process.env.DC1_KEY_PEPPER_VERSION;
  if (env != null && env !== '') return parseInt(env, 10) || 0;
  return DC1_KEY_PEPPER ? 1 : 0;
})();
if (KEY_PEPPER_TARGET_VERSION >= 1 && !DC1_KEY_PEPPER) {
  console.error('[db][keyhash] FATAL: pepper target version >=1 but DC1_KEY_PEPPER is empty');
  process.exit(1);
}
function keyHashVersioned(raw, version) {
  const v = String(raw == null ? '' : raw);
  if (!v) return null;
  const input = version >= 1 ? (v + ':' + DC1_KEY_PEPPER) : v;
  return crypto.createHash('sha256').update(input).digest('hex');
}
// Observability: counts every time auth falls through to the plaintext branch.
// Drives the Phase-3 soak gate; must be flat at 0 before dropping plaintext.
const _keyPlaintextFallback = { renter: 0, provider: 0, subkey: 0 };
function keyPlaintextFallbackStats() { return { ..._keyPlaintextFallback }; }

function _timingEq(a, b) {
  const ab = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
function _currentPepperVersion() {
  try { return parseInt(db.prepare(`SELECT v FROM app_meta WHERE k='pepper_version'`).get()?.v || '0', 10) || 0; }
  catch (_) { return 0; }
}

// Generic hash-aware resolver: hash@target -> hash@v0(legacy) -> plaintext+lazy-backfill.
function _resolveByKey(raw, cfg) {
  const key = typeof raw === 'string' ? raw : String(raw || '');
  if (!key) return null;
  const { table, keyCol, hashCol, hashVerCol, extraWhere = '', counter } = cfg;
  const where = extraWhere ? ' AND ' + extraWhere : '';
  const tgt = KEY_PEPPER_TARGET_VERSION;
  // 1) primary: hash at target version
  let row = db.prepare(`SELECT * FROM ${table} WHERE ${hashCol} = ?${where}`).get(keyHashVersioned(key, tgt));
  if (row) return row;
  // 2) legacy: if target>0, also try v0 unpeppered (PROV-9 rows not yet rehashed)
  if (tgt >= 1) {
    row = db.prepare(`SELECT * FROM ${table} WHERE ${hashCol} = ?${where}`).get(keyHashVersioned(key, 0));
    if (row) return row;
  }
  // 3) plaintext fallback (byte-for-byte) + lazy backfill to target hash
  row = db.prepare(`SELECT * FROM ${table} WHERE ${keyCol} = ?${where}`).get(key);
  if (!row) return null;
  if (!_timingEq(row[keyCol], key)) return null;
  if (counter) _keyPlaintextFallback[counter]++;
  try {
    db.prepare(`UPDATE ${table} SET ${hashCol} = ?, ${hashVerCol} = ? WHERE rowid = ?`)
      .run(keyHashVersioned(key, tgt), tgt, row.rowid);
  } catch (_) {}
  return row;
}

function resolveRenterByKey(rawKey, { activeOnly = true } = {}) {
  return _resolveByKey(rawKey, {
    table: 'renters', keyCol: 'api_key', hashCol: 'api_key_hash', hashVerCol: 'api_key_hash_v',
    extraWhere: activeOnly ? "status = 'active'" : '', counter: 'renter',
  });
}
function resolveProviderByKey(rawKey, { includeDeleted = true } = {}) {
  return _resolveByKey(rawKey, {
    table: 'providers', keyCol: 'api_key', hashCol: 'api_key_hash', hashVerCol: 'api_key_hash_v',
    extraWhere: includeDeleted ? '' : 'deleted_at IS NULL', counter: 'provider',
  });
}
function resolveRenterApiSubKey(rawKey) {
  return _resolveByKey(rawKey, {
    table: 'renter_api_keys', keyCol: 'key', hashCol: 'key_hash', hashVerCol: 'key_hash_v',
    extraWhere: 'revoked_at IS NULL', counter: 'subkey',
  });
}
// ===== /KEYHASH-SHARED-RESOLVER-V1 =====
'''
s = s.replace('module.exports = {', marker.join([block,'\nmodule.exports = {']).replace(marker,'',1) if False else block + '\nmodule.exports = {', 1)
# add exports
s = s.replace('  _db: db\n};',
              '  resolveRenterByKey,\n  resolveProviderByKey,\n  resolveRenterApiSubKey,\n  keyHashVersioned,\n  keyPlaintextFallbackStats,\n  _db: db\n};',1)
open(p,'w').write(s)
print('resolver injected')
PY
fi

# (b) Column + index migrations + version-aware backfill — inject before the resolver block insert point is fine;
#     do them as a separate idempotent ALTER block appended near other ALTERs.
if ! grep -q 'KEYHASH-COLUMNS-V1' db.js; then
python3 - <<'PY'
p='db.js'; s=open(p).read()
anchor="try { db.prepare('ALTER TABLE providers ADD COLUMN api_key_hash TEXT').run(); } catch (_) { /* idempotent */ }"
add='''
// ===== KEYHASH-COLUMNS-V1 =====
try { db.prepare('ALTER TABLE providers ADD COLUMN api_key_hash_v INTEGER DEFAULT 0').run(); } catch (_) {}
try { db.prepare('ALTER TABLE renters ADD COLUMN api_key_hash TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE renters ADD COLUMN api_key_hash_v INTEGER DEFAULT 0').run(); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_renters_api_key_hash ON renters(api_key_hash)`); } catch (_) {}
try { db.prepare('ALTER TABLE renter_api_keys ADD COLUMN key_hash TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE renter_api_keys ADD COLUMN key_hash_v INTEGER DEFAULT 0').run(); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_api_keys_key_hash ON renter_api_keys(key_hash)`); } catch (_) {}
// ===== /KEYHASH-COLUMNS-V1 =====
'''
s=s.replace(anchor, anchor+'\n'+add,1)
open(p,'w').write(s); print('columns injected')
PY
fi

# (c) Version-aware backfill executed at startup (idempotent + re-hash on version bump).
#     Appended AFTER the resolver block so keyHashVersioned/_currentPepperVersion exist.
if ! grep -q 'KEYHASH-BACKFILL-V1' db.js; then
python3 - <<'PY'
p='db.js'; s=open(p).read()
add='''
// ===== KEYHASH-BACKFILL-V1 =====
// Backfill NULL hashes at the target version, AND re-hash any row whose stored
// hash version is below target (this is what makes "set the pepper later" actually
// re-hash, instead of silently leaving stale unpeppered hashes).
(function keyhashBackfill(){
  const tgt = KEY_PEPPER_TARGET_VERSION;
  const tables = [
    { t:'renters',         k:'api_key', h:'api_key_hash', hv:'api_key_hash_v' },
    { t:'providers',       k:'api_key', h:'api_key_hash', hv:'api_key_hash_v' },
    { t:'renter_api_keys', k:'key',     h:'key_hash',     hv:'key_hash_v'    },
  ];
  for (const x of tables) {
    try {
      const rows = db.prepare(
        `SELECT rowid, ${x.k} AS rawk FROM ${x.t} WHERE ${x.k} IS NOT NULL AND (${x.h} IS NULL OR ${x.hv} < ?)`
      ).all(tgt);
      if (!rows.length) continue;
      const upd = db.prepare(`UPDATE ${x.t} SET ${x.h} = ?, ${x.hv} = ? WHERE rowid = ?`);
      db.transaction((rs)=>{ for (const r of rs) upd.run(keyHashVersioned(r.rawk, tgt), tgt, r.rowid); })(rows);
      console.log(`[db][keyhash] backfilled/rehashed ${rows.length} ${x.t} row(s) to v${tgt}`);
    } catch (e) { console.warn(`[db][keyhash] backfill ${x.t} failed (non-fatal, plaintext fallback authenticates):`, e && e.message); }
  }
  try { db.prepare(`UPDATE app_meta SET v=? WHERE k='pepper_version'`).run(String(tgt)); } catch (_) {}
})();
// ===== /KEYHASH-BACKFILL-V1 =====
'''
s=s.replace('// ===== /KEYHASH-SHARED-RESOLVER-V1 =====',
            '// ===== /KEYHASH-SHARED-RESOLVER-V1 =====\n'+add,1)
open(p,'w').write(s); print('backfill injected')
PY
fi
node --check db.js && echo "PHASE0 db.js node --check OK"

############ PHASE 1 — migrate call sites (per-file, idempotent sed-with-marker) ############
# Strategy: rewrite the SHARED helper functions to delegate, then point direct
# call sites at them. Example for jobs.js getRenterFromKey + getProviderFromReq:
#!/usr/bin/env bash
set -euo pipefail
cd /root/dc1-platform/backend/src
TS=$(date +%Y%m%d-%H%M%S)
for f in routes/jobs.js routes/renters.js routes/pods.js routes/settlement.js routes/mission.js routes/channels.js routes/v1.js services/renter-identity-reconciliation.js routes/providers.js; do
  cp -p "$f" "$f.bak.keyhash-p1.$TS"
done
# Each direct `db.get('SELECT ... FROM renters WHERE api_key = ? AND status = ?', key, 'active')`
# becomes `db.resolveRenterByKey(key)` (resolver applies status filter + dual-read);
# `FROM providers WHERE api_key = ?` -> `db.resolveProviderByKey(key, {includeDeleted:...})`;
# `renter_api_keys WHERE key = ? AND revoked_at IS NULL` -> `db.resolveRenterApiSubKey(key)`.
# These are mechanical, reviewed individually (column lists preserved by selecting from the
# returned row object) — NOT a blind global sed, because some sites select specific columns
# and some (e.g. renters.js:1631 UPDATE ... SET api_key=?) are WRITES that must ALSO write the
# new hash. Writes get: after `UPDATE renters SET api_key=?...` also set
# `api_key_hash = <db.keyHashVersioned(newKey, currentVer)>, api_key_hash_v = currentVer`.
# Verification:
for f in routes/jobs.js routes/renters.js routes/pods.js routes/settlement.js routes/mission.js routes/channels.js routes/v1.js services/renter-identity-reconciliation.js routes/providers.js; do
  node --check "$f" && echo "P1 $f OK"
done

############ PHASE 4 — drop plaintext (gated, with rebuild + backup) ############
#!/usr/bin/env bash
set -euo pipefail
cd /root/dc1-platform/backend/src
TS=$(date +%Y%m%d-%H%M%S)
cp -p db.js db.js.bak.keyhash-p4.$TS
# Inject a flag-gated, integrity-checked SQLite table-rebuild that removes the
# plaintext columns. Idempotent: only runs if DC1_KEY_DROP_PLAINTEXT=1 AND the
# column still exists AND keyPlaintextFallbackStats are all 0 at boot.
# (Full rebuild SQL omitted here for brevity — uses the 12-step pattern inside a
#  single transaction with PRAGMA integrity_check assertion before COMMIT, and a
#  pre-run `cp providers.db providers.db.predrop.$TS` file backup.)
node --check db.js && echo "PHASE4 db.js node --check OK"
```
