// DC1 Provider Onboarding - SQLite Database Module
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// PROV-9: deterministic sha256hex used both to backfill api_key_hash here and
// (mirrored as hashProviderApiKey) in routes/providers.js. Keep the two in lockstep.
function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

const DB_PATH = process.env.DC1_DB_PATH || path.join(__dirname, '..', 'data', 'providers.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
// Auto-checkpoint after every 100 pages (~400KB of writes) — ensures reads are never stale
db.pragma('wal_autocheckpoint = 100');

// Also force checkpoint every 10 seconds as belt-and-suspenders
setInterval(() => {
  try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (_) {}
}, 10000);

// ─── TABLE DEFINITIONS (single definition per table, no duplicates) ───

db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    organization TEXT,
    gpu_model TEXT,
    gpu_count INTEGER DEFAULT 1,
    vram_gb INTEGER,
    vram_mb INTEGER,
    supported_compute_types TEXT,
    gpu_profile_source TEXT DEFAULT 'manual',
    gpu_profile_updated_at TEXT,
    os TEXT DEFAULT 'linux',
    bandwidth_mbps INTEGER,
    storage_tb REAL,
    location TEXT,
    ip_address TEXT,
    cost_per_gpu_second_halala REAL DEFAULT NULL, -- null = platform default rate; provider-settable via /preferences
    status TEXT DEFAULT 'pending',
    approval_status TEXT DEFAULT 'pending',
    approved_at TEXT,
    rejected_reason TEXT,
    api_key TEXT,
    notes TEXT,
    wallet_address TEXT,
    wallet_address_updated_at TEXT,
    total_earnings REAL DEFAULT 0,
    total_earnings_halala INTEGER DEFAULT 0,
    total_jobs INTEGER DEFAULT 0,
    claimable_earnings_halala INTEGER DEFAULT 0,
    container_restart_count INTEGER DEFAULT 0,
    model_cache_disk_mb INTEGER DEFAULT 0,
    model_cache_disk_total_mb INTEGER DEFAULT 0,
    model_cache_disk_used_pct REAL DEFAULT 0,
    model_preload_status TEXT DEFAULT 'none',
    model_preload_model TEXT,
    model_preload_requested_at TEXT,
    model_preload_updated_at TEXT,
    deleted_at TEXT,
    deletion_scheduled_for TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ─── ADMIN AUDIT LOG TABLE ───
// Immutable trail for privileged admin actions.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id, timestamp DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id, timestamp DESC)`);

// ─── Rentable persistent volumes (paid, exclusive, quota-enforced) ──────────
// A renter rents a fixed-size volume (10/20/30 GB); it maps to a per-renter
// MinIO bucket with a hard quota on the in-Kingdom Node-2 store. Billed monthly
// in halala. The 100 GB pool ceiling is enforced at rent time in the route.
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_volumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL,
    size_gb INTEGER NOT NULL,
    bucket TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',          -- active | released | suspended
    price_halala_per_month INTEGER NOT NULL,
    rented_at TEXT NOT NULL,
    current_period_start TEXT NOT NULL,
    current_period_end TEXT NOT NULL,               -- +30 days; monthly re-bill
    last_billed_at TEXT,
    released_at TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_volumes_renter ON renter_volumes(renter_id, status)`);

try {
  db.prepare('ALTER TABLE providers ADD COLUMN wallet_address TEXT').run();
} catch (_) {}
try {
  db.prepare('ALTER TABLE providers ADD COLUMN wallet_address_updated_at TEXT').run();
} catch (_) {}

// ─── Audit C3 — backend-side endpoint reachability columns ──────────────────
// Heartbeat alone is not enough: a daemon can heartbeat from one host while
// its inference endpoint URL (Cloudflare tunnel, WG mesh IP, etc.) is dead.
// `lib/provider-probe.js` runs a 30s background loop that pings each
// online provider's vllm_endpoint_url and writes the result here. v1.js
// routing filters `capableProviders` on a real probe verdict, not heartbeat
// freshness alone.
try { db.prepare('ALTER TABLE providers ADD COLUMN endpoint_reachable INTEGER DEFAULT 0').run(); } catch (_) {}
try { db.prepare('ALTER TABLE providers ADD COLUMN endpoint_probed_at TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE providers ADD COLUMN endpoint_probe_error TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE providers ADD COLUMN endpoint_probe_failures INTEGER DEFAULT 0').run(); } catch (_) {}
// Daemon Health Contract: accepting_jobs = the daemon's own 'an engine answers
// its health endpoint right now' signal (top-level heartbeat field, dcp_daemon.py
// ~6456). DEFAULT 1 = back-compat (a provider that never reports it stays
// candidate). Gating status/availability on this is what makes 'online' mean
// 'can actually serve' — closing the heartbeat-alive-but-engine-dead zombie class.
try { db.prepare('ALTER TABLE providers ADD COLUMN accepting_jobs INTEGER DEFAULT 1').run(); } catch (_) {}

// ─── Audit C2 — financial idempotency table ─────────────────────────────────
// DB-backed (not in-memory like H6's inference cache) so a server restart
// can't drop the cache mid-flight and let a retry create a second billing
// row. 24h TTL by default. Keyed by (subject_type|subject_id):endpoint:client_key
// so two different renters can use the same Idempotency-Key string without
// colliding.
db.exec(`
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key_hash TEXT PRIMARY KEY,
    subject_type TEXT NOT NULL,    -- 'renter' | 'provider'
    subject_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_method TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT,            -- JSON string, may be NULL for non-json bodies
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT UNIQUE,
    provider_id INTEGER,
    job_type TEXT,
    model TEXT,
    status TEXT DEFAULT 'pending',
    container_id TEXT,
    workspace_volume_name TEXT,
    checkpoint_name TEXT,
    checkpoint_path TEXT,
    checkpoint_enabled INTEGER DEFAULT 0,
    checkpointed_at TEXT,
    vram_required INTEGER DEFAULT 0,
    cost_halala INTEGER DEFAULT 0,
    gpu_requirements TEXT,
    container_spec TEXT,
    notes TEXT,
    submitted_at TEXT,
    started_at TEXT,
    first_token_at TEXT,
    completed_at TEXT,
    updated_at TEXT,
    created_at TEXT,
    duration_minutes INTEGER,
    logs_jsonl TEXT,
    webhook_notified_at TEXT,
    webhook_delivery_status TEXT,
    webhook_delivery_attempts INTEGER DEFAULT 0,
    completion_email_sent_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS job_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    exit_code INTEGER,
    log_path TEXT,
    gpu_seconds_used REAL DEFAULT 0,
    cost_halala INTEGER DEFAULT 0
  )
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_exec_job_attempt ON job_executions(job_id, attempt_number)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_exec_job_id ON job_executions(job_id, started_at DESC)`);

// ─── STORAGE VOLUMES TABLE ───
// Persistent volumes for inference endpoints. Users can stop computing while keeping model weights.
db.exec(`
  CREATE TABLE IF NOT EXISTS storage_volumes (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    provider_id INTEGER,
    renter_id INTEGER,
    size_gb INTEGER NOT NULL DEFAULT 10,
    status TEXT DEFAULT 'creating' CHECK(status IN ('creating','active','stopped','deleting','deleted')),
    created_at TEXT NOT NULL,
    stopped_at TEXT,
    deleted_at TEXT,
    last_charged_at TEXT,
    total_compute_charged_halala INTEGER DEFAULT 0,
    total_storage_charged_halala INTEGER DEFAULT 0,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id),
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_storage_volumes_job ON storage_volumes(job_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_storage_volumes_provider ON storage_volumes(provider_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_storage_volumes_renter ON storage_volumes(renter_id, status)`);

// ─── SERVE SESSIONS TABLE ───
// Tracks active vLLM serving sessions exposed through DC1 proxy.
// provider_id and port are nullable: vLLM direct-completion sessions are created
// before a provider is assigned (job is still pending routing at INSERT time).
db.exec(`
  CREATE TABLE IF NOT EXISTS serve_sessions (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    provider_id INTEGER,
    model TEXT NOT NULL,
    port INTEGER,
    provider_ip TEXT,
    endpoint_url TEXT,
    session_token TEXT,
    status TEXT DEFAULT 'starting' CHECK(status IN ('starting','serving','stopped','expired')),
    started_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    stopped_at TEXT,
    last_inference_at TEXT,
    total_inferences INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_billed_halala INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id),
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
  )
`);

// Migration: make provider_id and port nullable for existing databases.
// SQLite does not support DROP/ALTER COLUMN directly — we use a safe PRAGMA
// workaround that only runs if the old NOT NULL constraint is present.
try {
  db.exec(`PRAGMA foreign_keys = OFF`);
  const colInfo = db.prepare(`PRAGMA table_info(serve_sessions)`).all();
  const providerIdCol = colInfo.find(c => c.name === 'provider_id');
  if (providerIdCol && providerIdCol.notnull === 1) {
    // Recreate table without NOT NULL on provider_id and port
    db.exec(`
      ALTER TABLE serve_sessions RENAME TO _serve_sessions_old;
      CREATE TABLE serve_sessions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE,
        provider_id INTEGER,
        model TEXT NOT NULL,
        port INTEGER,
        provider_ip TEXT,
        endpoint_url TEXT,
        session_token TEXT,
        status TEXT DEFAULT 'starting' CHECK(status IN ('starting','serving','stopped','expired')),
        started_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        stopped_at TEXT,
        last_inference_at TEXT,
        total_inferences INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_billed_halala INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers(id),
        FOREIGN KEY (job_id) REFERENCES jobs(job_id)
      );
      INSERT INTO serve_sessions SELECT * FROM _serve_sessions_old;
      DROP TABLE _serve_sessions_old;
    `);
  }
  db.exec(`PRAGMA foreign_keys = ON`);
} catch (_migErr) {
  db.exec(`PRAGMA foreign_keys = ON`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_serve_sessions_provider ON serve_sessions(provider_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_serve_sessions_expiry ON serve_sessions(status, expires_at)`);

// ─── COST RATES TABLE ───
// Supports model-specific token rates for vLLM serve billing.
db.exec(`
  CREATE TABLE IF NOT EXISTS cost_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL UNIQUE,
    token_rate_halala INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  )
`);
const nowIso = new Date().toISOString();
try { db.prepare(`INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
   VALUES (?, ?, 1, ?)`).run('__default__', 19, nowIso); } catch(e) {}
try { db.prepare(`INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
   VALUES (?, ?, 1, ?)`).run('mistralai/Mistral-7B-Instruct-v0.2', 22, nowIso); } catch(e) {}
try { db.prepare(`INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
   VALUES (?, ?, 1, ?)`).run('meta-llama/Meta-Llama-3-8B-Instruct', 19, nowIso); } catch(e) {}
try { db.prepare(`INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
   VALUES (?, ?, 1, ?)`).run('microsoft/Phi-3-mini-4k-instruct', 17, nowIso); } catch(e) {}
try { db.prepare(`INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
   VALUES (?, ?, 1, ?)`).run('google/gemma-2b-it', 15, nowIso); } catch(e) {}
try { db.prepare(`INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
   VALUES (?, ?, 1, ?)`).run('TinyLlama/TinyLlama-1.1B-Chat-v1.0', 10, nowIso); } catch(e) {}
try { db.prepare(`UPDATE cost_rates SET token_rate_halala = 19 WHERE model = '__default__' AND token_rate_halala = 1`).run(); } catch (e) {}

// ─── COST_RATES MODEL_CLASS ─── (migration 017)
// Per-class PAYG rate card decided Peter 2026-05-20 after competitor
// analysis. Pre-017 the table had no model_class and default=19 halala/M
// which is below cost for 27B+ models. New 5-class rate card seeds:
//   tiny   15, small 30, medium 150, large 400, embedding 5 (halala/M)
// See migrations/017_cost_rates_model_class.sql for authoritative source.
try { db.exec('ALTER TABLE cost_rates ADD COLUMN model_class TEXT'); } catch (_) { /* idempotent */ }
try { db.prepare(`UPDATE cost_rates SET model_class = 'small' WHERE model_class IS NULL`).run(); } catch (_) {}
const CLASS_RATE_SEEDS = [
  // tiny
  ['TinyLlama/TinyLlama-1.1B-Chat-v1.0', 15, 'tiny'],
  ['qwen2.5vl:3b',                       15, 'tiny'],
  ['google/gemma-2b-it',                 15, 'tiny'],
  // small
  ['mistralai/Mistral-7B-Instruct-v0.2', 30, 'small'],
  ['meta-llama/Meta-Llama-3-8B-Instruct',30, 'small'],
  ['microsoft/Phi-3-mini-4k-instruct',   30, 'small'],
  ['qwen3:8b',                           30, 'small'],
  ['humain-ai/ALLaM-7B-Instruct-preview',30, 'small'],
  // medium (flagship)
  ['qwen3.6-27b-mtp',                    150, 'medium'],
  ['Qwen/Qwen2.5-Coder-32B-Instruct',    150, 'medium'],
  // embedding
  ['bge-m3',                             5,  'embedding'],
];
for (const [model, rate, klass] of CLASS_RATE_SEEDS) {
  try {
    db.prepare(`INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(model) DO UPDATE SET token_rate_halala = excluded.token_rate_halala,
                                                  model_class = excluded.model_class`)
      .run(model, rate, klass, nowIso);
  } catch (e) { /* table may not exist yet on first boot of an older schema */ }
}
// Raise __default__ floor to small-class 30 halala/M
try { db.prepare(`UPDATE cost_rates SET token_rate_halala = 30, model_class = 'small' WHERE model = '__default__'`).run(); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_cost_rates_class ON cost_rates(model_class)`); } catch (_) {}

// ─── COST_RATES RECLASSIFY ─── (migration 018, 2026-05-21 pricing audit)
// Pre-017 entries drifted: ~25 rows were blanket-tagged `small` even
// though they routed to 30B+ MoE or 35B dense, and one row was at 1
// halala/M (test seed). Reclassify per the 5-class card decided
// 2026-05-20 so /pricing renders correctly and we don't underbill.
// See migrations/018_cost_rates_reclassify.sql for the full audit.
const CLASS_RECLASSIFY = [
  // [models[], rate, class]
  [['hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4'], 30, 'small'],
  [['qwen3:30b-a3b', 'nemotron:30b-a3b', 'Qwen/Qwen3-30B-A3B-GPTQ-Int4',
    'mlx-community/Qwen3-30B-A3B-4bit', 'qwen3.5:35b-a3b',
    'qwen3.6-35b', 'qwen3.6-35b-a3b'], 400, 'large'],
  [['qwen3:14b', 'qwen2.5:14b', 'Qwen/Qwen2.5-14B-Instruct-AWQ', 'gemma3:27b'], 150, 'medium'],
  [['deepseek-r1-distill-qwen-7b', 'falcon-h1-7b-instruct', 'qwen3:4b',
    'mlx-community/Qwen3-4B-4bit', 'qwen2.5:7b', 'mlx-community/Qwen3-8B-4bit',
    'mistral:7b', 'llama3.1:8b', 'deepseek-r1:7b', 'glm4:9b',
    'Qwen/Qwen2.5-7B-Instruct-AWQ'], 30, 'small'],
];
for (const [models, rate, klass] of CLASS_RECLASSIFY) {
  for (const model of models) {
    try {
      db.prepare(`UPDATE cost_rates SET token_rate_halala = ?, model_class = ? WHERE model = ?`)
        .run(rate, klass, model);
    } catch (_) { /* row may not exist on a fresh DB; that's fine */ }
  }
}

// ─── GPU PRICING TABLE ───
// Admin-controlled base rental rates per GPU model in halala/hour.
// DCP floor prices from platform pricing model (March 2026)
// Conversion: $USD/hr → SAR/hr (assuming 1 USD ≈ 3.75 SAR) → halala (1 SAR = 100 halala)
db.exec(`
  CREATE TABLE IF NOT EXISTS gpu_pricing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gpu_model TEXT UNIQUE NOT NULL,
    rate_halala INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
const DCP_FLOOR_PRICES = [
  { gpu: 'RTX 3090',  usd_per_hr: 0.105 },  // $0.105/hr × 100,000 = 10,500 halala/hour
  { gpu: 'RTX 4080',  usd_per_hr: 0.131 },  // $0.131/hr × 100,000 = 13,100 halala/hour
  { gpu: 'RTX 4090',  usd_per_hr: 0.267 },  // $0.267/hr × 100,000 = 26,700 halala/hour
  { gpu: 'RTX 5090',  usd_per_hr: 0.394 },  // $0.394/hr × 100,000 = 39,400 halala/hour
  { gpu: 'A100 SXM',  usd_per_hr: 0.786 },  // $0.786/hr × 100,000 = 78,600 halala/hour
  { gpu: 'H100 SXM',  usd_per_hr: 1.421 }, // $1.421/hr × 100,000 = 142,100 halala/hour
];
try {
  DCP_FLOOR_PRICES.forEach(({ gpu, usd_per_hr }) => {
    const halala_per_hour = Math.round(usd_per_hr * 100_000);
    db.prepare(
      `INSERT OR IGNORE INTO gpu_pricing (gpu_model, rate_halala, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`
    ).run(gpu, halala_per_hour);
  });
} catch (e) {
  console.error('Failed to seed GPU pricing:', e);
}

// ─── MODEL REGISTRY TABLE ───
// Curated model catalog exposed to renters via GET /api/models.
db.exec(`
  CREATE TABLE IF NOT EXISTS model_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    family TEXT NOT NULL,
    vram_gb INTEGER NOT NULL,
    quantization TEXT NOT NULL,
    context_window INTEGER NOT NULL,
    use_cases TEXT NOT NULL,
    min_gpu_vram_gb INTEGER NOT NULL,
    default_price_halala_per_min INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )
`);
const modelSeedNow = new Date().toISOString();
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'mistralai/Mistral-7B-Instruct-v0.2',
    'Mistral 7B Instruct',
    'mistral',
    14,
    'bf16',
    32768,
    JSON.stringify(['chat', 'coding', 'arabic']),
    16,
    15,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'meta-llama/Meta-Llama-3-8B-Instruct',
    'LLaMA 3 8B Instruct',
    'llama',
    16,
    'bf16',
    8192,
    JSON.stringify(['chat', 'reasoning']),
    16,
    17,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'Qwen/Qwen2-7B-Instruct',
    'Qwen2 7B Instruct',
    'qwen',
    14,
    'bf16',
    32768,
    JSON.stringify(['chat', 'arabic', 'translation']),
    16,
    14,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'qwen2.5vl:3b',
    'Qwen2.5-VL 3B Instruct',
    'qwen',
    8,
    'int4',
    32768,
    JSON.stringify(['vision', 'chat', 'multimodal']),
    8,
    15,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'microsoft/Phi-3-mini-4k-instruct',
    'Phi-3 Mini',
    'phi',
    4,
    'int4',
    4096,
    JSON.stringify(['chat', 'classification']),
    6,
    8,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    'DeepSeek R1 7B',
    'deepseek',
    16,
    'bf16',
    32768,
    JSON.stringify(['reasoning', 'coding']),
    16,
    18,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'ALLaM-AI/ALLaM-7B-Instruct-preview',
    'ALLaM 7B Instruct',
    'allam',
    24,
    'bf16',
    8192,
    JSON.stringify(['arabic', 'chat', 'enterprise']),
    24,
    22,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'tiiuae/Falcon-H1-7B-Instruct',
    'Falcon H1 7B Instruct',
    'falcon',
    24,
    'bf16',
    8192,
    JSON.stringify(['arabic', 'chat', 'reasoning']),
    24,
    20,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'inceptionai/jais-13b-chat',
    'JAIS 13B Chat',
    'jais',
    24,
    'bf16',
    4096,
    JSON.stringify(['arabic', 'chat', 'enterprise']),
    24,
    27,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'BAAI/bge-m3',
    'BGE M3 Embeddings',
    'embedding',
    8,
    'fp16',
    8192,
    JSON.stringify(['embedding', 'rag', 'retrieval']),
    8,
    12,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'BAAI/bge-reranker-v2-m3',
    'BGE Reranker v2 M3',
    'reranker',
    8,
    'fp16',
    4096,
    JSON.stringify(['reranking', 'rag', 'search']),
    8,
    14,
    modelSeedNow
  );
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO model_registry
     (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    'stabilityai/stable-diffusion-xl-base-1.0',
    'Stable Diffusion XL Base 1.0',
    'diffusion',
    16,
    'fp16',
    2048,
    JSON.stringify(['image-generation', 'creative', 'marketing']),
    16,
    30,
    modelSeedNow
  );
} catch (e) {}

// ─── MODEL BENCHMARK PROFILES TABLE ───
// Benchmarked latency/quality/cost feed used by bilingual model cards.
db.exec(`
  CREATE TABLE IF NOT EXISTS model_benchmark_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id TEXT NOT NULL UNIQUE,
    benchmark_suite TEXT NOT NULL,
    latency_p50_ms REAL NOT NULL,
    latency_p95_ms REAL NOT NULL,
    latency_p99_ms REAL NOT NULL,
    arabic_mmlu_score REAL NOT NULL,
    arabicaqa_score REAL NOT NULL,
    cost_per_1k_tokens_halala INTEGER NOT NULL,
    vram_required_gb INTEGER NOT NULL,
    cold_start_ms INTEGER NOT NULL,
    measured_at TEXT NOT NULL,
    notes_en TEXT,
    notes_ar TEXT,
    FOREIGN KEY (model_id) REFERENCES model_registry(model_id)
  )
`);
const benchmarkSeedNow = new Date().toISOString();
const benchmarkSeedRows = [
  {
    model_id: 'mistralai/Mistral-7B-Instruct-v0.2',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 420,
    latency_p95_ms: 860,
    latency_p99_ms: 1210,
    arabic_mmlu_score: 54.2,
    arabicaqa_score: 62.4,
    cost_per_1k_tokens_halala: 95,
    vram_required_gb: 16,
    cold_start_ms: 6800,
    notes_en: 'Strong low-latency baseline for bilingual support bots and summarization.',
    notes_ar: 'خيار سريع وفعال لتطبيقات الدعم ثنائي اللغة والتلخيص.',
  },
  {
    model_id: 'meta-llama/Meta-Llama-3-8B-Instruct',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 480,
    latency_p95_ms: 960,
    latency_p99_ms: 1410,
    arabic_mmlu_score: 58.7,
    arabicaqa_score: 66.1,
    cost_per_1k_tokens_halala: 108,
    vram_required_gb: 16,
    cold_start_ms: 7500,
    notes_en: 'Balanced quality and speed for Arabic+English enterprise assistants.',
    notes_ar: 'توازن جيد بين الجودة والسرعة للمساعدات المؤسسية بالعربية والإنجليزية.',
  },
  {
    model_id: 'Qwen/Qwen2-7B-Instruct',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 430,
    latency_p95_ms: 890,
    latency_p99_ms: 1290,
    arabic_mmlu_score: 61.4,
    arabicaqa_score: 69.8,
    cost_per_1k_tokens_halala: 102,
    vram_required_gb: 16,
    cold_start_ms: 7200,
    notes_en: 'Best Arabic quality in the 7B class with strong long-context behavior.',
    notes_ar: 'أفضل جودة عربية ضمن فئة 7B مع أداء قوي للسياق الطويل.',
  },
  {
    model_id: 'microsoft/Phi-3-mini-4k-instruct',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 300,
    latency_p95_ms: 650,
    latency_p99_ms: 940,
    arabic_mmlu_score: 42.9,
    arabicaqa_score: 51.2,
    cost_per_1k_tokens_halala: 62,
    vram_required_gb: 6,
    cold_start_ms: 4100,
    notes_en: 'Lowest cost profile for lightweight Arabic Q&A and classification.',
    notes_ar: 'أقل تكلفة للمهام الخفيفة مثل الأسئلة والأجوبة والتصنيف بالعربية.',
  },
  {
    model_id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 560,
    latency_p95_ms: 1100,
    latency_p99_ms: 1610,
    arabic_mmlu_score: 63.1,
    arabicaqa_score: 71.5,
    cost_per_1k_tokens_halala: 124,
    vram_required_gb: 16,
    cold_start_ms: 8900,
    notes_en: 'Higher reasoning quality with moderate latency overhead.',
    notes_ar: 'جودة استدلال أعلى مع زيادة متوسطة في زمن الاستجابة.',
  },
  {
    model_id: 'ALLaM-AI/ALLaM-7B-Instruct-preview',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 510,
    latency_p95_ms: 990,
    latency_p99_ms: 1390,
    arabic_mmlu_score: 67.2,
    arabicaqa_score: 74.8,
    cost_per_1k_tokens_halala: 132,
    vram_required_gb: 24,
    cold_start_ms: 9100,
    notes_en: 'Saudi Arabic-first quality profile; prioritize for prewarm Tier A enterprise workloads.',
    notes_ar: 'جودة عربية سعودية عالية؛ يُفضّل ضمن نماذج Tier A الجاهزة مسبقًا.',
  },
  {
    model_id: 'tiiuae/Falcon-H1-7B-Instruct',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 470,
    latency_p95_ms: 930,
    latency_p99_ms: 1320,
    arabic_mmlu_score: 64.8,
    arabicaqa_score: 72.1,
    cost_per_1k_tokens_halala: 118,
    vram_required_gb: 24,
    cold_start_ms: 8700,
    notes_en: 'Balanced Arabic throughput and quality for launch-critical Tier A serving.',
    notes_ar: 'توازن ممتاز بين السرعة والجودة العربية لدعم الإطلاق ضمن Tier A.',
  },
  {
    model_id: 'inceptionai/jais-13b-chat',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 630,
    latency_p95_ms: 1260,
    latency_p99_ms: 1780,
    arabic_mmlu_score: 70.4,
    arabicaqa_score: 78.6,
    cost_per_1k_tokens_halala: 154,
    vram_required_gb: 24,
    cold_start_ms: 11600,
    notes_en: 'High-accuracy Arabic enterprise default for Tier B premium chat workloads.',
    notes_ar: 'خيار عالي الدقة للمحادثة العربية المؤسسية ضمن Tier B.',
  },
  {
    model_id: 'BAAI/bge-m3',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 110,
    latency_p95_ms: 260,
    latency_p99_ms: 410,
    arabic_mmlu_score: 0,
    arabicaqa_score: 0,
    cost_per_1k_tokens_halala: 24,
    vram_required_gb: 8,
    cold_start_ms: 3200,
    notes_en: 'High-throughput embedding profile for Arabic RAG pipelines.',
    notes_ar: 'نموذج تضمين سريع عالي الإنتاجية لتطبيقات الاسترجاع العربي.',
  },
  {
    model_id: 'BAAI/bge-reranker-v2-m3',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 180,
    latency_p95_ms: 340,
    latency_p99_ms: 520,
    arabic_mmlu_score: 0,
    arabicaqa_score: 0,
    cost_per_1k_tokens_halala: 34,
    vram_required_gb: 8,
    cold_start_ms: 3600,
    notes_en: 'Low-latency Arabic reranking for retrieval quality uplift.',
    notes_ar: 'تحسين جودة الاسترجاع العربي بزمن استجابة منخفض.',
  },
  {
    model_id: 'stabilityai/stable-diffusion-xl-base-1.0',
    benchmark_suite: 'saudi-arabic-v1',
    latency_p50_ms: 980,
    latency_p95_ms: 1880,
    latency_p99_ms: 2760,
    arabic_mmlu_score: 0,
    arabicaqa_score: 0,
    cost_per_1k_tokens_halala: 0,
    vram_required_gb: 16,
    cold_start_ms: 13200,
    notes_en: 'Tier B Arabic prompt image generation baseline with warm-cache preference.',
    notes_ar: 'خط أساس لتوليد الصور بالنص العربي ضمن Tier B مع تفضيل الذاكرة الدافئة.',
  },
];
for (const row of benchmarkSeedRows) {
  try {
    db.prepare(
      `INSERT OR IGNORE INTO model_benchmark_profiles
       (model_id, benchmark_suite, latency_p50_ms, latency_p95_ms, latency_p99_ms, arabic_mmlu_score, arabicaqa_score, cost_per_1k_tokens_halala, vram_required_gb, cold_start_ms, measured_at, notes_en, notes_ar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.model_id,
      row.benchmark_suite,
      row.latency_p50_ms,
      row.latency_p95_ms,
      row.latency_p99_ms,
      row.arabic_mmlu_score,
      row.arabicaqa_score,
      row.cost_per_1k_tokens_halala,
      row.vram_required_gb,
      row.cold_start_ms,
      benchmarkSeedNow,
      row.notes_en,
      row.notes_ar
    );
  } catch (e) {}
}

// ─── CONTAINER IMAGE ALLOWLIST ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS allowed_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_ref TEXT NOT NULL UNIQUE,
    image_type TEXT NOT NULL DEFAULT 'custom',
    description TEXT,
    approved_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_allowed_images_approved_at ON allowed_images(approved_at DESC)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS recovery_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    provider_id INTEGER,
    from_provider_id INTEGER,
    to_provider_id INTEGER,
    event_type TEXT,
    reason TEXT,
    status TEXT CHECK(status IN ('pending','success','failed','no_backup')),
    timestamp TEXT,
    details TEXT,
    started_at TEXT,
    completed_at TEXT,
    resolved_at TEXT,
    notes TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS daemon_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER,
    event_type TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    daemon_version TEXT,
    job_id TEXT,
    hostname TEXT,
    os_info TEXT,
    python_version TEXT,
    details TEXT,
    event_timestamp TEXT,
    received_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS benchmark_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    benchmark_type TEXT NOT NULL CHECK(benchmark_type IN ('quick','standard','full')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
    started_at TEXT,
    completed_at TEXT,
    score_gflops REAL,
    temp_max_celsius REAL,
    vram_used_mib INTEGER,
    latency_ms REAL,
    notes TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inference_stream_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    model_id TEXT,
    provider_tier TEXT,
    stream_success INTEGER NOT NULL CHECK(stream_success IN (0, 1)),
    stream_error_code TEXT,
    duration_ms REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_stream_events_provider_created ON inference_stream_events(provider_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_stream_events_tier_created ON inference_stream_events(provider_tier, created_at DESC)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bottleneck_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    trigger TEXT NOT NULL CHECK(trigger IN ('high_utilization','queue_overflow','timeout')),
    utilization_pct REAL,
    jobs_affected INTEGER DEFAULT 0,
    action_taken TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    jobs_checked INTEGER DEFAULT 0,
    jobs_clean INTEGER DEFAULT 0,
    jobs_flagged INTEGER DEFAULT 0,
    total_collected_halala INTEGER DEFAULT 0,
    total_paid_halala INTEGER DEFAULT 0,
    dc1_margin_halala INTEGER DEFAULT 0,
    notes TEXT
  )
`);

// ─── MIGRATIONS (idempotent — safe to re-run) ───

const migrations = [
  // providers columns
  'ALTER TABLE providers ADD COLUMN gpu_status TEXT',
  'ALTER TABLE providers ADD COLUMN provider_ip TEXT',
  'ALTER TABLE providers ADD COLUMN provider_hostname TEXT',
  'ALTER TABLE providers ADD COLUMN last_heartbeat TEXT',
  'ALTER TABLE providers ADD COLUMN gpu_name_detected TEXT',
  'ALTER TABLE providers ADD COLUMN gpu_vram_mib INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN vram_mb INTEGER',
  'ALTER TABLE providers ADD COLUMN gpu_driver TEXT',
  'ALTER TABLE providers ADD COLUMN gpu_compute TEXT',
  'ALTER TABLE providers ADD COLUMN total_earnings REAL DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN total_earnings_halala INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN total_jobs INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN uptime_percent REAL DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN reliability_score INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN rotated_at TEXT',
  'ALTER TABLE providers ADD COLUMN cost_per_gpu_second_halala REAL DEFAULT NULL',
  // jobs columns (for existing DBs that had the old narrow schema)
  'ALTER TABLE jobs ADD COLUMN job_type TEXT',
  'ALTER TABLE jobs ADD COLUMN model TEXT',
  'ALTER TABLE jobs ADD COLUMN cost_halala INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN gpu_requirements TEXT',
  'ALTER TABLE jobs ADD COLUMN container_spec TEXT',
  'ALTER TABLE jobs ADD COLUMN notes TEXT',
  'ALTER TABLE jobs ADD COLUMN submitted_at TEXT',
  'ALTER TABLE jobs ADD COLUMN started_at TEXT',
  'ALTER TABLE jobs ADD COLUMN completed_at TEXT',
  'ALTER TABLE jobs ADD COLUMN duration_minutes INTEGER',
  'ALTER TABLE jobs ADD COLUMN container_id TEXT',
  'ALTER TABLE jobs ADD COLUMN workspace_volume_name TEXT',
  'ALTER TABLE jobs ADD COLUMN checkpoint_name TEXT',
  'ALTER TABLE jobs ADD COLUMN checkpoint_path TEXT',
  'ALTER TABLE jobs ADD COLUMN checkpoint_enabled INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN checkpointed_at TEXT',
  // jobs columns added by sync E2E branch (needed on deployed VPS)
  'ALTER TABLE jobs ADD COLUMN assigned_at TEXT',
  'ALTER TABLE jobs ADD COLUMN picked_up_at TEXT',
  'ALTER TABLE jobs ADD COLUMN task_spec TEXT',
  'ALTER TABLE jobs ADD COLUMN result TEXT',
  'ALTER TABLE jobs ADD COLUMN error TEXT',
  // billing actuals — set at completion from real elapsed time (not submitted estimate)
  'ALTER TABLE jobs ADD COLUMN actual_cost_halala INTEGER',
  'ALTER TABLE jobs ADD COLUMN actual_duration_minutes INTEGER',
  'ALTER TABLE jobs ADD COLUMN provider_earned_halala INTEGER',
  'ALTER TABLE jobs ADD COLUMN dc1_fee_halala INTEGER',
  // renter_id for renter auth (existing jobs may lack this)
  'ALTER TABLE jobs ADD COLUMN renter_id INTEGER',
  // job timeout enforcement
  'ALTER TABLE jobs ADD COLUMN max_duration_seconds INTEGER DEFAULT 600',
  'ALTER TABLE jobs ADD COLUMN timeout_at TEXT',
  // HMAC signature for task_spec security
  'ALTER TABLE jobs ADD COLUMN task_spec_hmac TEXT',
  // provider self-service columns
  'ALTER TABLE providers ADD COLUMN run_mode TEXT DEFAULT \'always-on\'',
  'ALTER TABLE providers ADD COLUMN scheduled_start TEXT DEFAULT \'23:00\'',
  'ALTER TABLE providers ADD COLUMN scheduled_end TEXT DEFAULT \'07:00\'',
  'ALTER TABLE providers ADD COLUMN gpu_usage_cap_pct INTEGER DEFAULT 80',
  'ALTER TABLE providers ADD COLUMN vram_reserve_gb INTEGER DEFAULT 1',
  'ALTER TABLE providers ADD COLUMN temp_limit_c INTEGER DEFAULT 85',
  'ALTER TABLE providers ADD COLUMN is_paused INTEGER DEFAULT 0',
  // provider readiness + daemon tracking
  'ALTER TABLE providers ADD COLUMN readiness_status TEXT DEFAULT \'pending\'',
  'ALTER TABLE providers ADD COLUMN readiness_details TEXT',
  'ALTER TABLE providers ADD COLUMN p2p_peer_id TEXT',
  'ALTER TABLE providers ADD COLUMN daemon_version TEXT',
  'ALTER TABLE providers ADD COLUMN current_job_id TEXT',
  'ALTER TABLE providers ADD COLUMN available_gpu_tiers TEXT',
  'ALTER TABLE providers ADD COLUMN approval_status TEXT DEFAULT \'pending\'',
  'ALTER TABLE providers ADD COLUMN approved_at TEXT',
  'ALTER TABLE providers ADD COLUMN rejected_reason TEXT',
  // machine verification columns
  'ALTER TABLE providers ADD COLUMN verification_status TEXT DEFAULT \'unverified\'',
  'ALTER TABLE providers ADD COLUMN verification_score INTEGER',
  'ALTER TABLE providers ADD COLUMN verification_last_at TEXT',
  'ALTER TABLE providers ADD COLUMN verification_challenge TEXT',
  'ALTER TABLE providers ADD COLUMN verified_gpu TEXT',
  // recovery_events columns (for existing DBs that had the old narrow schema)
  'ALTER TABLE recovery_events ADD COLUMN job_id TEXT',
  'ALTER TABLE recovery_events ADD COLUMN provider_id INTEGER',
  'ALTER TABLE recovery_events ADD COLUMN from_provider_id INTEGER',
  'ALTER TABLE recovery_events ADD COLUMN to_provider_id INTEGER',
  'ALTER TABLE recovery_events ADD COLUMN event_type TEXT',
  'ALTER TABLE recovery_events ADD COLUMN reason TEXT',
  'ALTER TABLE recovery_events ADD COLUMN status TEXT',
  'ALTER TABLE recovery_events ADD COLUMN timestamp TEXT',
  'ALTER TABLE recovery_events ADD COLUMN details TEXT',
  'ALTER TABLE recovery_events ADD COLUMN started_at TEXT',
  'ALTER TABLE recovery_events ADD COLUMN completed_at TEXT',
  'ALTER TABLE recovery_events ADD COLUMN resolved_at TEXT',
  'ALTER TABLE recovery_events ADD COLUMN notes TEXT',
  // Job progress phase — daemon reports download/load/generate phases in real-time
  'ALTER TABLE jobs ADD COLUMN progress_phase TEXT',
  'ALTER TABLE jobs ADD COLUMN progress_updated_at TEXT',
  // SSE job log streaming storage (JSON-lines)
  'ALTER TABLE jobs ADD COLUMN logs_jsonl TEXT',
  // Refund tracking for failed/timed-out jobs
  'ALTER TABLE jobs ADD COLUMN refunded_at TEXT',
  // Cached HuggingFace models — daemon reports which models are pre-downloaded
  'ALTER TABLE providers ADD COLUMN cached_models TEXT',
  // Job execution engine — DCP-18
  'ALTER TABLE jobs ADD COLUMN priority INTEGER DEFAULT 2',         // 1=high, 2=normal, 3=low
  'ALTER TABLE jobs ADD COLUMN retry_count INTEGER DEFAULT 0',      // how many times job was retried
  'ALTER TABLE jobs ADD COLUMN max_retries INTEGER DEFAULT 2',      // transient failure retry ceiling
  // Container crash recovery telemetry — daemon-managed retry metadata
  'ALTER TABLE jobs ADD COLUMN restart_count INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN last_error TEXT',
  // GPU metrics — DCP-19: multi-GPU data stored as JSON per heartbeat
  'ALTER TABLE heartbeat_log ADD COLUMN gpu_metrics_json TEXT',     // full all_gpus array from daemon
  'ALTER TABLE heartbeat_log ADD COLUMN gpu_count INTEGER DEFAULT 1',
  // Provider GPU spec — DCP-20
  'ALTER TABLE providers ADD COLUMN gpu_count_reported INTEGER',    // number of GPUs reported by daemon
  'ALTER TABLE providers ADD COLUMN gpu_spec_json TEXT',            // full GPU spec array from daemon
  'ALTER TABLE providers ADD COLUMN gpu_compute_capability TEXT',   // e.g. "8.9"
  'ALTER TABLE providers ADD COLUMN gpu_cuda_version TEXT',         // e.g. "12.2"
  // Ocean-style structured resource advertisement — DCP-27
  'ALTER TABLE providers ADD COLUMN resource_spec TEXT',            // JSON: {resources:[{id,total,type,...}]}
  // SAR payment integration — DCP-31
  'ALTER TABLE payments ADD COLUMN moyasar_id TEXT',
  'ALTER TABLE payments ADD COLUMN payment_method TEXT DEFAULT \'creditcard\'',
  'ALTER TABLE payments ADD COLUMN refunded_at TEXT',               // when refund processed
  'ALTER TABLE payments ADD COLUMN refund_amount_halala INTEGER',   // partial refund support
  // Escrow-based earnings tracking — DCP-32 (integer halala, avoids SAR float drift)
  'ALTER TABLE providers ADD COLUMN claimable_earnings_halala INTEGER DEFAULT 0',
  // vLLM serverless endpoint — DCP-34
  'ALTER TABLE jobs ADD COLUMN endpoint_url TEXT',          // OpenAI-compatible /v1 endpoint URL (vllm_serve)
  'ALTER TABLE jobs ADD COLUMN serve_port INTEGER',         // provider-side port the vLLM container listens on
  // Provider reputation system — DCP-51
  'ALTER TABLE providers ADD COLUMN reputation_score REAL DEFAULT 100.0', // composite trust score (0–100)
  // Provider per-minute pricing — DCP-205 job router (NULL = use global COST_RATES)
  'ALTER TABLE providers ADD COLUMN price_per_min_halala INTEGER DEFAULT NULL',
  // Canonical GPU info payload from daemon heartbeat (DCP-244)
  'ALTER TABLE providers ADD COLUMN gpu_info_json TEXT',
  'ALTER TABLE providers ADD COLUMN gpu_vram_mb INTEGER',
  'ALTER TABLE providers ADD COLUMN supported_compute_types TEXT',
  'ALTER TABLE providers ADD COLUMN gpu_profile_source TEXT DEFAULT \'manual\'',
  'ALTER TABLE providers ADD COLUMN gpu_profile_updated_at TEXT',
  'ALTER TABLE providers ADD COLUMN container_restart_count INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN model_cache_disk_mb INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN model_cache_disk_total_mb INTEGER DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN model_cache_disk_used_pct REAL DEFAULT 0',
  'ALTER TABLE providers ADD COLUMN model_preload_status TEXT DEFAULT \'none\'',
  'ALTER TABLE providers ADD COLUMN model_preload_model TEXT',
  'ALTER TABLE providers ADD COLUMN model_preload_requested_at TEXT',
  'ALTER TABLE providers ADD COLUMN model_preload_updated_at TEXT',
  'ALTER TABLE providers ADD COLUMN vllm_models TEXT',
  // Optional renter callback endpoint for job lifecycle webhooks
  'ALTER TABLE renters ADD COLUMN use_case TEXT',
  'ALTER TABLE renters ADD COLUMN phone TEXT',
  'ALTER TABLE renters ADD COLUMN webhook_url TEXT',
  'ALTER TABLE renters ADD COLUMN rotated_at TEXT',
  // PDPL deletion lifecycle tracking
  'ALTER TABLE renters ADD COLUMN deleted_at TEXT',
  'ALTER TABLE renters ADD COLUMN deletion_scheduled_for TEXT',
  'ALTER TABLE providers ADD COLUMN deleted_at TEXT',
  'ALTER TABLE providers ADD COLUMN deletion_scheduled_for TEXT',
  // Job completion callback delivery tracking
  'ALTER TABLE jobs ADD COLUMN webhook_notified_at TEXT',
  'ALTER TABLE jobs ADD COLUMN webhook_delivery_status TEXT',
  'ALTER TABLE jobs ADD COLUMN webhook_delivery_attempts INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN completion_email_sent_at TEXT',
  'ALTER TABLE jobs ADD COLUMN retried_from_job_id INTEGER',
  'ALTER TABLE jobs ADD COLUMN first_token_at TEXT',
  // Control-plane lifecycle metadata (DCP-368)
  'ALTER TABLE jobs ADD COLUMN pricing_class TEXT DEFAULT \'standard\'',
  'ALTER TABLE jobs ADD COLUMN capacity_class TEXT DEFAULT \'on_demand\'',
  'ALTER TABLE jobs ADD COLUMN prewarm_requested INTEGER DEFAULT 0',
  'ALTER TABLE job_executions ADD COLUMN gpu_seconds_used REAL DEFAULT 0',
  'ALTER TABLE job_executions ADD COLUMN cost_halala INTEGER DEFAULT 0',
  'ALTER TABLE heartbeat_log ADD COLUMN container_restart_count INTEGER DEFAULT 0',
  'ALTER TABLE heartbeat_log ADD COLUMN model_cache_used_mb INTEGER DEFAULT 0',
  'ALTER TABLE heartbeat_log ADD COLUMN model_cache_total_mb INTEGER DEFAULT 0',
  'ALTER TABLE heartbeat_log ADD COLUMN model_cache_used_pct REAL DEFAULT 0',
  'ALTER TABLE withdrawal_requests ADD COLUMN updated_at TEXT',
  'ALTER TABLE withdrawal_requests ADD COLUMN is_amount_reserved INTEGER DEFAULT 1',
  // Token tracking for vLLM inference billing — Sprint 25 Gap 1
  'ALTER TABLE jobs ADD COLUMN prompt_tokens INTEGER',
  'ALTER TABLE jobs ADD COLUMN completion_tokens INTEGER',
  // Model cache tier for provider job routing — Sprint 25 Gap 5
  "ALTER TABLE model_registry ADD COLUMN prewarm_class TEXT DEFAULT 'warm'",
  // OpenRouter model metadata compatibility — DCP-112
  'ALTER TABLE model_registry ADD COLUMN parameter_count TEXT',
  // Actual elapsed seconds for sub-minute billing accuracy — Sprint 25 Gap 3
  'ALTER TABLE jobs ADD COLUMN duration_seconds INTEGER',
  // Template-based job submission — Sprint 27
  'ALTER TABLE jobs ADD COLUMN template_id TEXT',
  // GPU-model-aware rate snapshot at job dispatch time — DCP-762
  'ALTER TABLE jobs ADD COLUMN gpu_rate_snapshot TEXT',
  // Job billing lifecycle phase — DCP-911
  "ALTER TABLE jobs ADD COLUMN lifecycle_status TEXT DEFAULT 'pending'",
  // vLLM inference proxy — DCP-922: provider-registered vLLM endpoint URL
  'ALTER TABLE providers ADD COLUMN vllm_endpoint_url TEXT',
  // Provider staking -- DCP-920 (ProviderStake.sol integration)
  // stake_status: 'none' | 'active' | 'slashed' | 'insufficient' | 'withdrawn'
  "ALTER TABLE providers ADD COLUMN stake_status TEXT DEFAULT 'none'",
  "ALTER TABLE providers ADD COLUMN stake_amount_wei TEXT DEFAULT '0'",
  'ALTER TABLE providers ADD COLUMN stake_tx_hash TEXT',
  'ALTER TABLE providers ADD COLUMN evm_wallet_address TEXT',
  'ALTER TABLE providers ADD COLUMN unstake_requested_at TEXT',
  // Stake verification flag on serve sessions -- DCP-920
  'ALTER TABLE serve_sessions ADD COLUMN stake_verified INTEGER',
  // Job attestation signatures + on-chain record -- DCP-927 (JobAttestation.sol)
  // attestation_status: 'pending' | 'signed' | 'on_chain' | 'failed'
  'ALTER TABLE serve_sessions ADD COLUMN attestation_signature TEXT',
  'ALTER TABLE jobs ADD COLUMN attestation_tx_hash TEXT',
  "ALTER TABLE jobs ADD COLUMN attestation_status TEXT DEFAULT 'pending'",
  // Per-second billing — DCP-1034: split into compute (gpu_seconds), storage (gb_seconds), bandwidth (bytes)
  'ALTER TABLE jobs ADD COLUMN gpu_seconds_used REAL DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN storage_gb_seconds INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN bandwidth_bytes_out INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN bandwidth_bytes_in INTEGER DEFAULT 0',
  // Billing breakdown — compute_halala, storage_halala, bandwidth_halala stored at completion
  'ALTER TABLE jobs ADD COLUMN compute_halala INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN storage_halala INTEGER DEFAULT 0',
  'ALTER TABLE jobs ADD COLUMN bandwidth_halala INTEGER DEFAULT 0',
  // Audit H5: WireGuard mesh IP advertised by the daemon. When set, v1.js
  // prefers it over vllm_endpoint_url so traffic stays on the mesh.
  'ALTER TABLE providers ADD COLUMN wg_mesh_ip TEXT',
  // WG auto-provisioning: store the provider's WireGuard public key so we
  // can idempotently return their existing config on re-registration.
  'ALTER TABLE providers ADD COLUMN wg_public_key TEXT',
  // WG key rotation: track last rotation timestamp for rate limiting (max 1/24h)
  'ALTER TABLE providers ADD COLUMN wg_last_rotation_at TEXT',
  // Tier 2: persist derived tunnel-health flag from heartbeat for the
  // dashboard badge. NULL = wg not in scope, 1 = healthy, 0 = zombied.
  'ALTER TABLE providers ADD COLUMN wg_tunnel_healthy INTEGER',
  // Tier 2: most recent handshake age in seconds (rounded). Lets the
  // dashboard render a tooltip without re-deriving from raw wg_health.
  'ALTER TABLE providers ADD COLUMN wg_handshake_age_s INTEGER',
  // Audit M6: per-renter HMAC secret for outbound webhook signatures.
  // Replaces the legacy fallback that used the renter's API key as the signing
  // secret — leaking the API key inside webhook signatures sent to URLs the
  // renter (or anyone reading their webhook traffic) controls.
  'ALTER TABLE renters ADD COLUMN webhook_secret TEXT',
  // Mission Control 2026-05-16: tag comment provenance.
  //   source: free-form origin string ("ui", "agent:claude", ...)
  //   kind:   semantic class ("comment" default, "reassignment", "closing")
  // Both nullable for back-compat — old rows stay readable.
  'ALTER TABLE mission_task_comments ADD COLUMN source TEXT',
  'ALTER TABLE mission_task_comments ADD COLUMN kind TEXT',
  // Migration 020: Moyasar Payouts API wiring on providers (POST /v1/payout_accounts).
  // moyasar_payout_account_id — UUID returned after IBAN registration.
  // payout_iban / payout_holder_name — cached locally for display + revalidation.
  // (payout_requests columns moved below — they must run AFTER CREATE TABLE payout_requests.)
  'ALTER TABLE providers ADD COLUMN moyasar_payout_account_id TEXT',
  'ALTER TABLE providers ADD COLUMN payout_iban TEXT',
  'ALTER TABLE providers ADD COLUMN payout_holder_name TEXT',
  'ALTER TABLE providers ADD COLUMN payout_account_registered_at TEXT',
  // Backlog gap #1: dedup state for provider online→offline alerts. Set when we
  // notify a provider that their node went offline; cleared (NULL) when they
  // come back online. Persisted so a worker restart never re-spams providers,
  // and so we can conservatively re-alert if a node stays offline > 24h.
  'ALTER TABLE providers ADD COLUMN last_offline_alert_at TEXT',
  // Interactive GPU pods (job_type='interactive_pod') — provider-side published
  // ports, the provider WG mesh IP, and the public access surface (relay).
  'ALTER TABLE jobs ADD COLUMN jupyter_host_port INTEGER',
  'ALTER TABLE jobs ADD COLUMN ssh_host_port INTEGER',
  'ALTER TABLE jobs ADD COLUMN pod_wg_mesh_ip TEXT',
  'ALTER TABLE jobs ADD COLUMN access_url TEXT',
  'ALTER TABLE jobs ADD COLUMN ssh_command TEXT',
  'ALTER TABLE jobs ADD COLUMN pod_jpub INTEGER',
  'ALTER TABLE jobs ADD COLUMN pod_spub INTEGER',
  // Migration 021 renter columns are applied AFTER CREATE TABLE renters
  // (see the second migration sweep below) because the table is created
  // later in this file.
];

migrations.forEach(sql => {
  try {
    db.exec(sql);
  } catch (e) {
    // Column already exists — safe to ignore
  }
});

// ─── PROVIDER_ENGINES TABLE ─── (migration 015)
// Multi-engine routing source of truth. One row per (provider_id, engine_type)
// so a single provider can expose more than one inference backend (e.g.
// llama.cpp at 8080 + Ollama at 11434). Legacy `providers.vllm_endpoint_url`
// + `providers.cached_models` remain intact for backward compatibility — the
// gateway selects between paths via the MULTI_ENGINE_ROUTING_ENABLED env flag.
//
// On production this table was created surgically during the 2026-05-19
// phantom-daemon remediation (see migrations/015_provider_engines.sql for the
// full audit comment). The IF NOT EXISTS guards keep prod rows intact.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_engines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    engine_type TEXT NOT NULL CHECK (engine_type IN ('ollama','vllm','llamacpp')),
    base_url TEXT NOT NULL,
    port INTEGER NOT NULL,
    served_models TEXT NOT NULL DEFAULT '[]',
    reachable INTEGER DEFAULT 1,
    last_probed_at TEXT,
    last_probe_error TEXT,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider_id, engine_type),
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_engines_provider ON provider_engines(provider_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_engines_lookup  ON provider_engines(reachable, engine_type)`);
// Engine version (e.g. Ollama "0.12.3", vLLM "0.6.2") reported by the daemon's
// engines[] heartbeat. Used for observability and version-sensitive knob
// decisions (some reasoning knobs behave differently across engine versions).
try { db.prepare('ALTER TABLE provider_engines ADD COLUMN engine_version TEXT').run(); } catch (_) {}

// ─── CHANNEL_HEALTH TABLE ─── (migration 018, reconciled into git 2026-05-30)
// One row per probed channel; written by channels/heartbeat_mvp.py every 60s,
// read by GET /api/channels/health. Applied surgically on prod earlier; added
// here (idempotent) so fresh installs get the schema too.
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_health (
    channel_id        TEXT PRIMARY KEY,
    alive             INTEGER NOT NULL DEFAULT 0,
    last_success_at   REAL,
    last_error        TEXT,
    reconnect_hint    TEXT,
    probed_at         REAL NOT NULL,
    latency_ms        INTEGER,
    consecutive_fail  INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_health_alive ON channel_health (alive, probed_at)`);

// ─── DANGEROUS_ACTION TABLES ─── (migration 019, reconciled into git 2026-05-30)
// dangerous_action_log: append-only audit of gated invocations.
// consumed_tokens: single-use enforcement for action-authorizing tokens.
db.exec(`
  CREATE TABLE IF NOT EXISTS dangerous_action_log (
    req_id            TEXT PRIMARY KEY,
    class             TEXT NOT NULL,
    fn                TEXT NOT NULL,
    payload_hash      TEXT NOT NULL,
    requester         TEXT NOT NULL,
    approver          TEXT,
    approval_source   TEXT,
    outcome           TEXT NOT NULL,
    error_reason      TEXT,
    ts                REAL NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_dal_class_ts   ON dangerous_action_log (class, ts)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_dal_outcome_ts ON dangerous_action_log (outcome, ts)`);
db.exec(`
  CREATE TABLE IF NOT EXISTS consumed_tokens (
    token_hash        TEXT PRIMARY KEY,
    class             TEXT NOT NULL,
    payload_hash      TEXT NOT NULL,
    approver          TEXT NOT NULL,
    approval_source   TEXT NOT NULL,
    issued_at         REAL NOT NULL,
    expires_at        REAL NOT NULL,
    consumed_at       REAL NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_consumed_expires ON consumed_tokens (expires_at)`);

// ─── RENTER SUBSCRIPTIONS ─── (migration 016)
// Dual pricing SKU: PAYG (renters.balance_halala) + monthly subscription.
// Subscription = SAR monthly fee → SAR credit grant + per-tier discount
// applied to PAYG per-model rates. Models bill at their OWN rate (not a
// flat bundle rate). Credit grants roll over 30 days then expire.
// Schema source of truth: migrations/016_renter_subscriptions.sql
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('starter','growth','scale')),
    monthly_sar INTEGER NOT NULL,
    discount_bps INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','active','past_due','cancelled','expired')) DEFAULT 'pending',
    moyasar_subscription_id TEXT UNIQUE,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (renter_id) REFERENCES renters(id) ON DELETE CASCADE
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_subscriptions_renter ON renter_subscriptions(renter_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_subscriptions_status ON renter_subscriptions(status)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_renter_subscriptions_one_open ON renter_subscriptions(renter_id) WHERE status IN ('pending','active','past_due')`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subscription_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    renter_id INTEGER NOT NULL,
    granted_at TEXT NOT NULL,
    amount_halala INTEGER NOT NULL,
    consumed_halala INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'monthly_grant' CHECK (source IN ('monthly_grant','adjustment','promo')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (subscription_id) REFERENCES renter_subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (renter_id) REFERENCES renters(id) ON DELETE CASCADE
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_subscription_credits_renter_remaining ON subscription_credits(renter_id, expires_at) WHERE consumed_halala < amount_halala`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_subscription_credits_subscription ON subscription_credits(subscription_id)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS moyasar_webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    received_at TEXT NOT NULL,
    applied_at TEXT
  )
`);

// ─── RENTERS TABLE ───
db.exec(`
  CREATE TABLE IF NOT EXISTS renters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL UNIQUE,
    organization TEXT,
    use_case TEXT,
    phone TEXT,
    status TEXT DEFAULT 'active',
    balance_halala INTEGER DEFAULT 0,
    total_spent_halala INTEGER DEFAULT 0,
    total_jobs INTEGER DEFAULT 0,
    webhook_url TEXT,
    rotated_at TEXT,
    deleted_at TEXT,
    deletion_scheduled_for TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  )
`);

// Migration 021 (auto-top-up renter columns — applied AFTER CREATE TABLE renters).
[
  'ALTER TABLE renters ADD COLUMN auto_topup_enabled INTEGER DEFAULT 0',
  'ALTER TABLE renters ADD COLUMN auto_topup_threshold_halala INTEGER DEFAULT 0',
  'ALTER TABLE renters ADD COLUMN auto_topup_amount_halala INTEGER DEFAULT 0',
  'ALTER TABLE renters ADD COLUMN auto_topup_monthly_cap_halala INTEGER DEFAULT 0',
  // Optional renter-set monthly inference spend cap (#20). 0 = unlimited.
  'ALTER TABLE renters ADD COLUMN monthly_spend_cap_halala INTEGER DEFAULT 0',
  'ALTER TABLE renters ADD COLUMN moyasar_card_token TEXT',
  'ALTER TABLE renters ADD COLUMN moyasar_card_brand TEXT',
  'ALTER TABLE renters ADD COLUMN moyasar_card_last4 TEXT',
  'ALTER TABLE renters ADD COLUMN moyasar_card_saved_at TEXT',
  'ALTER TABLE renters ADD COLUMN auto_topup_monthly_used_halala INTEGER DEFAULT 0',
  'ALTER TABLE renters ADD COLUMN auto_topup_monthly_reset_at TEXT',
  'ALTER TABLE renters ADD COLUMN auto_topup_consecutive_failures INTEGER DEFAULT 0',
  'ALTER TABLE renters ADD COLUMN auto_topup_paused_until TEXT',
  'ALTER TABLE renters ADD COLUMN auto_topup_last_attempt_at TEXT',
  // Agent self-serve onboarding (2026-06): provenance + audit columns so an
  // auto-minted renter (no email click) can be told apart from a human-verified
  // one and revoked/audited. All nullable/defaulted — backfilled NULL on
  // existing rows, never breaks the human magic-link flow.
  //   source        — 'agent' for the programmatic zero-human path, NULL/'web' otherwise.
  //   signup_ip     — request IP at agent-register time (revoke/abuse forensics).
  //   trial_grant_halala — the one-time trial credited at agent-register (audit).
  "ALTER TABLE renters ADD COLUMN source TEXT",
  'ALTER TABLE renters ADD COLUMN signup_ip TEXT',
  'ALTER TABLE renters ADD COLUMN trial_grant_halala INTEGER DEFAULT 0',
].forEach((sql) => {
  try { db.exec(sql); } catch (_) { /* column exists */ }
});

// ─── CREDIT GRANTS TABLE ───
// Immutable audit trail for admin-issued renter credits.
db.exec(`
  CREATE TABLE IF NOT EXISTS credit_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL,
    amount_halala INTEGER NOT NULL CHECK (amount_halala > 0),
    reason TEXT NOT NULL,
    granted_by TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_credit_grants_renter_time ON credit_grants(renter_id, created_at DESC)`);

// ─── API KEY ROTATION AUDIT TABLE ───
// Security audit trail + per-account rate limiting support.
db.exec(`
  CREATE TABLE IF NOT EXISTS api_key_rotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_type TEXT NOT NULL CHECK(account_type IN ('provider', 'renter')),
    account_id INTEGER NOT NULL,
    rotated_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_api_key_rotations_account_time ON api_key_rotations(account_type, account_id, rotated_at DESC)`);

// ─── RENTER NOTIFICATIONS TABLE ─── (migration 013)
// In-dashboard notifications. Replaces per-job completion emails to stop
// burning Resend quota; dailyDigest service rolls these into one email/day.
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    job_id INTEGER,
    payload TEXT,
    read_at TEXT,
    digested_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (renter_id) REFERENCES renters(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_notif_unread ON renter_notifications(renter_id, read_at, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_notif_digest ON renter_notifications(kind, digested_at, created_at)`);

// ─── SCOPED RENTER API KEYS TABLE ─── Sprint 25 Gap 2
// Sub-keys with explicit scope grants; master renters.api_key retains full access.
// scopes: JSON array of allowed operations, e.g. ["inference", "billing"]
// Valid scopes: "inference" (submit vLLM jobs), "billing" (view balance/payments), "admin" (all)
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_api_keys (
    id TEXT PRIMARY KEY,
    renter_id INTEGER NOT NULL,
    key TEXT NOT NULL UNIQUE,
    label TEXT,
    scopes TEXT NOT NULL DEFAULT '["inference"]',
    org_id TEXT,
    org_role TEXT NOT NULL DEFAULT 'member' CHECK(org_role IN ('owner', 'admin', 'member', 'read-only')),
    expires_at TEXT,
    revoked_at TEXT,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
try { db.prepare(`ALTER TABLE renter_api_keys ADD COLUMN org_id TEXT`).run(); } catch (_) {}
try { db.prepare(`ALTER TABLE renter_api_keys ADD COLUMN org_role TEXT NOT NULL DEFAULT 'member' CHECK(org_role IN ('owner', 'admin', 'member', 'read-only'))`).run(); } catch (_) {}
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_api_keys_key ON renter_api_keys(key)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_api_keys_renter ON renter_api_keys(renter_id, revoked_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_api_keys_org ON renter_api_keys(org_id, org_role, revoked_at)`);

// ─── CLI DEVICE-CODE LOGIN TABLE ─── (dcp launcher, routes/cli-auth.js)
// OAuth-style device flow: `dcp login` creates a pending row, the renter
// approves the user_code in the browser (binding renter_id + a scoped key),
// and the CLI polls /v1/cli/device/token until it can claim the key.
db.exec(`
  CREATE TABLE IF NOT EXISTS cli_device_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_code TEXT NOT NULL UNIQUE,
    user_code TEXT NOT NULL UNIQUE,
    renter_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','claimed','expired')),
    api_key TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    approved_at TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cli_device_codes_user ON cli_device_codes(user_code, status)`);

// ─── ORG RBAC AUDIT LOG TABLE ─── (DCP-320)
// Immutable per-organization trail for RBAC access decisions and privileged mutations.
db.exec(`
  CREATE TABLE IF NOT EXISTS org_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK(actor_type IN ('master_key', 'scoped_key', 'unknown')),
    actor_id TEXT,
    actor_role TEXT NOT NULL CHECK(actor_role IN ('owner', 'admin', 'member', 'read-only', 'unknown')),
    renter_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('allow', 'deny')),
    reason TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_org_audit_org_time ON org_audit_log(org_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_org_audit_action_time ON org_audit_log(action, created_at DESC)`);

// ─── IMAGE SECURITY TABLES ───
// Trivy scan evidence + approved image digest pinning for container execution policy.
db.exec(`
  CREATE TABLE IF NOT EXISTS image_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_ref TEXT NOT NULL,
    registry TEXT NOT NULL,
    resolved_digest TEXT,
    scanned_at TEXT NOT NULL,
    critical_count INTEGER NOT NULL DEFAULT 0,
    scan_report_json TEXT,
    approved INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT,
    approved_by TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_image_scans_image_time ON image_scans(image_ref, scanned_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_image_scans_digest ON image_scans(resolved_digest, scanned_at DESC)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS approved_container_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_ref TEXT NOT NULL UNIQUE,
    registry TEXT NOT NULL,
    resolved_digest TEXT NOT NULL,
    scan_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    approved_at TEXT NOT NULL,
    approved_by TEXT,
    last_validated_at TEXT,
    FOREIGN KEY (scan_id) REFERENCES image_scans(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_approved_container_images_active ON approved_container_images(is_active, approved_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_approved_container_images_digest ON approved_container_images(resolved_digest)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_rate_limit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_key TEXT NOT NULL,
    actor_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_rate_limit_log_action_actor_time ON admin_rate_limit_log(action_key, actor_fingerprint, created_at DESC)`);

// ─── SENSITIVE SECURITY AUDIT EVENTS TABLE ─── (DCP-394)
// Captures high-sensitivity runtime route access/mutations with deterministic action labels.
db.exec(`
  CREATE TABLE IF NOT EXISTS security_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    method TEXT NOT NULL,
    route_path TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('success', 'error')),
    actor_type TEXT NOT NULL CHECK(actor_type IN ('admin', 'provider', 'renter', 'unknown')),
    actor_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_security_audit_events_action_time ON security_audit_events(action, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_security_audit_events_resource_time ON security_audit_events(resource_type, resource_id, created_at DESC)`);

// ─── PDPL REQUEST AUDIT TABLE ───
// Records immutable export/deletion requests for compliance evidence.
db.exec(`
  CREATE TABLE IF NOT EXISTS pdpl_request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_type TEXT NOT NULL CHECK(account_type IN ('provider', 'renter')),
    account_id INTEGER NOT NULL,
    request_type TEXT NOT NULL CHECK(request_type IN ('export', 'delete')),
    requested_at TEXT NOT NULL,
    metadata_json TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pdpl_request_log_account_time ON pdpl_request_log(account_type, account_id, requested_at DESC)`);

// ─── RENTER QUOTA TABLE ───
// Per-renter submission/spend controls enforced at job submission.
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_quota (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL UNIQUE,
    daily_jobs_limit INTEGER NOT NULL DEFAULT 100,
    monthly_spend_limit_halala INTEGER NOT NULL DEFAULT 10000,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_quota_renter_id ON renter_quota(renter_id)`);

// ─── QUOTA LOG TABLE ───
// Audit trail for quota and balance checks on job submissions.
db.exec(`
  CREATE TABLE IF NOT EXISTS quota_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL,
    job_id TEXT,
    check_type TEXT NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 0,
    limit_value INTEGER,
    current_value INTEGER,
    requested_value INTEGER,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_quota_log_renter_id ON quota_log(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_quota_log_job_id ON quota_log(job_id, created_at DESC)`);

// ─── PAYMENTS TABLE ─── (DCP-31: Moyasar SAR payment integration)
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT NOT NULL UNIQUE,        -- Internal/external payment identifier
    moyasar_id TEXT UNIQUE,                 -- Canonical Moyasar payment ID
    renter_id INTEGER NOT NULL,
    amount_sar REAL NOT NULL,
    amount_halala INTEGER NOT NULL,
    status TEXT DEFAULT 'initiated',        -- initiated|paid|failed|refunded
    source_type TEXT DEFAULT 'creditcard',  -- creditcard|mada|applepay
    payment_method TEXT DEFAULT 'creditcard',
    description TEXT,
    callback_url TEXT,
    checkout_url TEXT,                      -- Moyasar hosted checkout URL
    gateway_response TEXT,                  -- Full Moyasar response JSON
    created_at TEXT NOT NULL,
    confirmed_at TEXT,                      -- When webhook confirmed payment
    refunded_at TEXT,
    refund_amount_halala INTEGER,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_renter_id ON payments(renter_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_moyasar_id ON payments(moyasar_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC)`);

// ─── PAYMENT REFUND REQUESTS TABLE — migration 023 ─────────────────────────
// Renter-created queue; admins approve/reject from /admin/payments.
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_refund_requests (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    renter_id INTEGER NOT NULL,
    amount_halala INTEGER NOT NULL CHECK(amount_halala > 0),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','processing','approved','rejected')),
    requested_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,
    admin_note TEXT,
    moyasar_refund_id TEXT,
    gateway_response TEXT,
    FOREIGN KEY (payment_id) REFERENCES payments(payment_id),
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_renter ON payment_refund_requests(renter_id, requested_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payment_refund_requests_status ON payment_refund_requests(status, requested_at DESC)`);
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refund_requests_open_payment
  ON payment_refund_requests(payment_id)
  WHERE status IN ('pending','processing')
`);

// ─── RENTER CREDIT LEDGER TABLE — DCP-755 ───
// Immutable double-entry audit trail for all renter balance movements.
// Every credit (top-up, admin grant, refund) and debit (job start) is recorded here.
// The authoritative balance is renters.balance_halala; this table is the audit trail.
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_credit_ledger (
    id           TEXT PRIMARY KEY,
    renter_id    INTEGER NOT NULL,
    amount_halala INTEGER NOT NULL CHECK (amount_halala > 0),
    direction    TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
    source       TEXT NOT NULL,
    job_id       TEXT,
    payment_ref  TEXT,
    note         TEXT,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_renter_time ON renter_credit_ledger(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_job_id      ON renter_credit_ledger(job_id) WHERE job_id IS NOT NULL`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_source      ON renter_credit_ledger(source, created_at DESC)`);

// ─── WITHDRAWALS TABLE ───
db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    withdrawal_id TEXT NOT NULL UNIQUE,
    provider_id INTEGER NOT NULL,
    amount_sar REAL NOT NULL,
    payout_method TEXT DEFAULT 'bank_transfer',
    payout_details TEXT,
    status TEXT DEFAULT 'pending',
    requested_at TEXT NOT NULL,
    processed_at TEXT,
    notes TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    amount_halala INTEGER NOT NULL,
    is_amount_reserved INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','paid','failed')),
    iban TEXT NOT NULL,
    admin_note TEXT,
    created_at TEXT NOT NULL,
    processed_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_provider ON withdrawal_requests(provider_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status, created_at DESC)`);

// ─── VERIFICATION RUNS TABLE ───
db.exec(`
  CREATE TABLE IF NOT EXISTS verification_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    challenge_id TEXT NOT NULL UNIQUE,
    challenge_params TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
    requested_at TEXT,
    completed_at TEXT,
    result_data TEXT,
    verdict TEXT CHECK(verdict IN ('verified','suspect','failed')),
    score INTEGER,
    flags TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);

// ─── HEARTBEAT LOG TABLE ───
db.exec(`
  CREATE TABLE IF NOT EXISTS heartbeat_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    provider_ip TEXT,
    provider_hostname TEXT,
    gpu_util_pct REAL,
    gpu_temp_c REAL,
    gpu_power_w REAL,
    gpu_vram_free_mib INTEGER,
    gpu_vram_total_mib INTEGER,
    daemon_version TEXT,
    python_version TEXT,
    os_info TEXT,
    gpu_metrics_json TEXT,
    gpu_count INTEGER DEFAULT 1,
    container_restart_count INTEGER DEFAULT 0,
    model_cache_used_mb INTEGER DEFAULT 0,
    model_cache_total_mb INTEGER DEFAULT 0,
    model_cache_used_pct REAL DEFAULT 0,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);

// ─── PROVIDER GPU TELEMETRY TABLE ───
// Time-series heartbeat snapshots used for fleet-level utilization analytics.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_gpu_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    gpu_name TEXT,
    gpu_vram_gb INTEGER,
    gpu_util_pct REAL,
    vram_used_gb REAL,
    cold_start_ms INTEGER,
    active_jobs INTEGER DEFAULT 0,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_provider_time ON provider_gpu_telemetry(provider_id, recorded_at)`);

try {
  db.prepare('ALTER TABLE provider_gpu_telemetry ADD COLUMN cold_start_ms INTEGER').run();
} catch (e) {}

// ─── PROVIDER METRICS TABLE — DCP-892 ───
// Lightweight timeseries for the REST heartbeat (:id/heartbeat) and health poller.
// Stores gpu_utilization_pct, vram_used_mb, active_jobs per provider per ping.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    gpu_utilization_pct REAL,
    vram_used_mb INTEGER,
    active_jobs INTEGER DEFAULT 0,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider_time ON provider_metrics(provider_id, recorded_at)`);

// ─── PROVIDER ACTIVATION EVENTS TABLE — DCP-443 ───
// Tracks installer/daemon download milestones to quantify provider activation conversion.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_activation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    event_code TEXT NOT NULL,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_activation_events_provider_time ON provider_activation_events(provider_id, occurred_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_activation_events_code_time ON provider_activation_events(event_code, occurred_at DESC)`);

// ─── CONVERSION FUNNEL EVENTS TABLE — DCP-357 ───
// Canonical provider + renter activation funnel contract:
// view -> register -> first_action -> first_success
db.exec(`
  CREATE TABLE IF NOT EXISTS conversion_funnel_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    occurred_at TEXT NOT NULL,
    journey TEXT NOT NULL CHECK(journey IN ('provider','renter')),
    stage TEXT NOT NULL CHECK(stage IN ('view','register','first_action','first_success')),
    actor_type TEXT NOT NULL DEFAULT 'anonymous' CHECK(actor_type IN ('provider','renter','anonymous','admin','system')),
    actor_id INTEGER,
    actor_key TEXT,
    anonymous_id TEXT,
    session_id TEXT,
    correlation_id TEXT,
    locale TEXT,
    locale_raw TEXT,
    language TEXT,
    country_code TEXT,
    source_surface TEXT,
    source_channel TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    referrer TEXT,
    referrer_host TEXT,
    referrer_path TEXT,
    request_path TEXT,
    request_method TEXT,
    success INTEGER NOT NULL DEFAULT 1,
    metadata_json TEXT,
    dedupe_key TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_conversion_funnel_time ON conversion_funnel_events(occurred_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_conversion_funnel_journey_stage ON conversion_funnel_events(journey, stage, occurred_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_conversion_funnel_actor ON conversion_funnel_events(actor_key, occurred_at DESC)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_funnel_dedupe_key ON conversion_funnel_events(dedupe_key) WHERE dedupe_key IS NOT NULL`);

// ─── CONTROL PLANE POLICY TABLE ───
// Queue/SLO policy inputs used by autoscale and pre-warm recommendations.
db.exec(`
  CREATE TABLE IF NOT EXISTS control_plane_policies (
    pricing_class TEXT PRIMARY KEY CHECK(pricing_class IN ('priority','standard','economy')),
    target_queue_wait_seconds INTEGER NOT NULL DEFAULT 90,
    target_cold_start_ms INTEGER NOT NULL DEFAULT 120000,
    target_cold_start_p50_ms INTEGER NOT NULL DEFAULT 8000,
    target_gpu_utilization_pct REAL NOT NULL DEFAULT 85,
    queue_per_warm_provider INTEGER NOT NULL DEFAULT 2,
    min_warm_providers INTEGER NOT NULL DEFAULT 1,
    max_scale_up_step INTEGER NOT NULL DEFAULT 3,
    scale_down_idle_seconds INTEGER NOT NULL DEFAULT 600,
    prewarm_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`);

// Seed canonical pricing classes once (idempotent).
const controlPlaneSeedNow = new Date().toISOString();
try {
  db.prepare(
    `INSERT OR IGNORE INTO control_plane_policies
      (pricing_class, target_queue_wait_seconds, target_cold_start_ms, target_cold_start_p50_ms, target_gpu_utilization_pct, queue_per_warm_provider, min_warm_providers, max_scale_up_step, scale_down_idle_seconds, prewarm_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('priority', 30, 20000, 8000, 80, 1, 2, 5, 300, 1, controlPlaneSeedNow);
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO control_plane_policies
      (pricing_class, target_queue_wait_seconds, target_cold_start_ms, target_cold_start_p50_ms, target_gpu_utilization_pct, queue_per_warm_provider, min_warm_providers, max_scale_up_step, scale_down_idle_seconds, prewarm_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('standard', 90, 20000, 8000, 85, 2, 1, 3, 600, 1, controlPlaneSeedNow);
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO control_plane_policies
      (pricing_class, target_queue_wait_seconds, target_cold_start_ms, target_cold_start_p50_ms, target_gpu_utilization_pct, queue_per_warm_provider, min_warm_providers, max_scale_up_step, scale_down_idle_seconds, prewarm_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('economy', 180, 20000, 8000, 92, 3, 0, 2, 1200, 0, controlPlaneSeedNow);
} catch (e) {}

try {
  db.prepare('ALTER TABLE control_plane_policies ADD COLUMN target_cold_start_p50_ms INTEGER NOT NULL DEFAULT 8000').run();
} catch (e) {}
try {
  db.prepare('ALTER TABLE control_plane_policies ADD COLUMN target_gpu_utilization_pct REAL NOT NULL DEFAULT 85').run();
} catch (e) {}
try {
  db.prepare(
    `UPDATE control_plane_policies
     SET target_cold_start_ms = MIN(COALESCE(target_cold_start_ms, 20000), 20000),
         target_cold_start_p50_ms = MIN(COALESCE(target_cold_start_p50_ms, 8000), 8000)
     WHERE pricing_class IN ('priority','standard','economy')`
  ).run();
} catch (e) {}

// ─── CONTROL PLANE SIGNAL TABLE ───
// Snapshot log of queue-aware scaling recommendations and SLO health.
db.exec(`
  CREATE TABLE IF NOT EXISTS control_plane_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pricing_class TEXT NOT NULL CHECK(pricing_class IN ('priority','standard','economy')),
    capacity_class TEXT NOT NULL DEFAULT 'on_demand' CHECK(capacity_class IN ('on_demand','flex','spot')),
    compute_type TEXT NOT NULL,
    vram_required_mb INTEGER NOT NULL DEFAULT 0,
    queued_total INTEGER NOT NULL DEFAULT 0,
    active_total INTEGER NOT NULL DEFAULT 0,
    providers_online INTEGER NOT NULL DEFAULT 0,
    providers_degraded INTEGER NOT NULL DEFAULT 0,
    providers_warm INTEGER NOT NULL DEFAULT 0,
    avg_queue_wait_seconds REAL DEFAULT 0,
    p95_queue_wait_seconds REAL DEFAULT 0,
    avg_gpu_util_pct REAL,
    cold_start_p95_ms INTEGER,
    cold_start_p50_ms INTEGER,
    recommended_warm_pool INTEGER NOT NULL DEFAULT 0,
    recommended_scale_delta INTEGER NOT NULL DEFAULT 0,
    recommended_action TEXT NOT NULL CHECK(recommended_action IN ('scale_up','scale_down','hold')),
    reason TEXT,
    snapshot_json TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_control_plane_signals_created_at ON control_plane_signals(created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_control_plane_signals_bucket ON control_plane_signals(pricing_class, compute_type, vram_required_mb, created_at DESC)`);
try {
  db.prepare('ALTER TABLE control_plane_signals ADD COLUMN avg_gpu_util_pct REAL').run();
} catch (e) {}
try {
  db.prepare('ALTER TABLE control_plane_signals ADD COLUMN cold_start_p50_ms INTEGER').run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE control_plane_signals ADD COLUMN capacity_class TEXT NOT NULL DEFAULT 'on_demand'").run();
} catch (e) {}

// ─── CONTROL PLANE CAPACITY POLICY TABLE ───
// Capacity classes tune prewarm + scaling behavior for serverless pools.
db.exec(`
  CREATE TABLE IF NOT EXISTS control_plane_capacity_policies (
    capacity_class TEXT PRIMARY KEY CHECK(capacity_class IN ('on_demand','flex','spot')),
    queue_wait_multiplier REAL NOT NULL DEFAULT 1.0,
    warm_pool_multiplier REAL NOT NULL DEFAULT 1.0,
    max_scale_up_multiplier REAL NOT NULL DEFAULT 1.0,
    min_warm_floor INTEGER NOT NULL DEFAULT 0,
    prewarm_enabled INTEGER NOT NULL DEFAULT 1,
    spillover_to_higher_class INTEGER NOT NULL DEFAULT 1,
    preemptible INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )
`);

const capacityPolicySeedNow = new Date().toISOString();
try {
  db.prepare(
    `INSERT OR IGNORE INTO control_plane_capacity_policies
      (capacity_class, queue_wait_multiplier, warm_pool_multiplier, max_scale_up_multiplier, min_warm_floor, prewarm_enabled, spillover_to_higher_class, preemptible, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('on_demand', 1.0, 1.0, 1.0, 1, 1, 1, 0, 1, capacityPolicySeedNow);
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO control_plane_capacity_policies
      (capacity_class, queue_wait_multiplier, warm_pool_multiplier, max_scale_up_multiplier, min_warm_floor, prewarm_enabled, spillover_to_higher_class, preemptible, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('flex', 1.2, 0.6, 0.8, 0, 1, 1, 1, 1, capacityPolicySeedNow);
} catch (e) {}
try {
  db.prepare(
    `INSERT OR IGNORE INTO control_plane_capacity_policies
      (capacity_class, queue_wait_multiplier, warm_pool_multiplier, max_scale_up_multiplier, min_warm_floor, prewarm_enabled, spillover_to_higher_class, preemptible, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('spot', 1.5, 0.0, 0.6, 0, 0, 0, 1, 1, capacityPolicySeedNow);
} catch (e) {}

// ─── ESCROW HOLDS TABLE ─── (DCP-32: off-chain escrow for GPU job billing)
// Tracks pre-paid funds through the job lifecycle:
//   held → locked → released_provider (success)
//                 → released_renter   (failure/cancel)
//                 → expired           (timeout)
db.exec(`
  CREATE TABLE IF NOT EXISTS escrow_holds (
    id TEXT PRIMARY KEY,
    renter_api_key TEXT NOT NULL,
    provider_id INTEGER NOT NULL,
    job_id TEXT NOT NULL UNIQUE,
    amount_halala INTEGER NOT NULL,
    status TEXT DEFAULT 'held' CHECK(status IN ('held','locked','released_provider','released_renter','expired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    resolved_at DATETIME,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_job_id ON escrow_holds(job_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_renter ON escrow_holds(renter_api_key, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_provider ON escrow_holds(provider_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_escrow_expires ON escrow_holds(status, expires_at)`);

// ─── JOB LOGS TABLE ───
// Stores stdout/stderr lines from job execution; daemon streams these after execution
db.exec(`
  CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    level TEXT DEFAULT 'info',
    message TEXT NOT NULL,
    logged_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id, line_no)`);

// ─── JOB LIFECYCLE EVENTS TABLE ───
// Deterministic status/error event stream used by API + SSE consumers.
db.exec(`
  CREATE TABLE IF NOT EXISTS job_lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    sequence_no INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT,
    source TEXT NOT NULL DEFAULT 'api',
    error_category TEXT,
    error_code TEXT,
    message TEXT,
    payload_json TEXT,
    occurred_at TEXT NOT NULL
  )
`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_lifecycle_unique_seq ON job_lifecycle_events(job_id, sequence_no)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_lifecycle_occurred ON job_lifecycle_events(job_id, occurred_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_lifecycle_error_category ON job_lifecycle_events(error_category, occurred_at DESC)`);

// ─── JOB SWEEP LOG TABLE ───
// Audit trail for stale-job sweeps (DCP-129)
db.exec(`
  CREATE TABLE IF NOT EXISTS job_sweep_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    reason TEXT NOT NULL,
    swept_at TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_sweep_log_job_id ON job_sweep_log(job_id, swept_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_sweep_log_swept_at ON job_sweep_log(swept_at DESC)`);

// ─── JOB TEMPLATES TABLE ─── (DCP-304: renter job templates)
db.exec(`
  CREATE TABLE IF NOT EXISTS job_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    job_type TEXT NOT NULL,
    model TEXT NOT NULL,
    system_prompt TEXT,
    max_tokens INTEGER,
    resource_spec_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (renter_id) REFERENCES renters(id) ON DELETE CASCADE
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_job_templates_renter ON job_templates(renter_id, created_at DESC)`);

// Index for renter job history queries (DCP-695)
db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_renter_id ON jobs(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_provider_type_status_model ON jobs(provider_id, job_type, status, model)`);

// ─── PAYOUT REQUESTS TABLE ─── (DCP-763)
// Off-chain payout request queue. Providers request USD withdrawals from their
// claimable_earnings_halala balance. DCP admin processes via bank transfer.
// Status flow: pending → processing → paid
//              pending/processing → rejected (funds returned to claimable balance)
db.exec(`
  CREATE TABLE IF NOT EXISTS payout_requests (
    id            TEXT    PRIMARY KEY,
    provider_id   INTEGER NOT NULL,
    amount_usd    REAL    NOT NULL,
    amount_sar    REAL    NOT NULL,
    amount_halala INTEGER NOT NULL,
    escrow_tx_hash TEXT,
    status        TEXT    NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','processing','paid','rejected')),
    requested_at  TEXT    NOT NULL,
    processed_at  TEXT,
    payment_ref   TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
// Backfill migration for databases created before escrow_tx_hash existed.
try {
  db.prepare('ALTER TABLE payout_requests ADD COLUMN escrow_tx_hash TEXT').run();
} catch (_) {}
// Migration 020 (payout_requests columns — applied AFTER CREATE TABLE).
[
  'ALTER TABLE payout_requests ADD COLUMN moyasar_payout_id TEXT',
  'ALTER TABLE payout_requests ADD COLUMN moyasar_status TEXT',
  'ALTER TABLE payout_requests ADD COLUMN gateway_response TEXT',
  'ALTER TABLE payout_requests ADD COLUMN failure_reason TEXT',
].forEach((sql) => {
  try { db.exec(sql); } catch (_) { /* column exists */ }
});

db.exec(`CREATE INDEX IF NOT EXISTS idx_payout_requests_provider ON payout_requests(provider_id, requested_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status, requested_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_payout_requests_moyasar_id ON payout_requests(moyasar_payout_id) WHERE moyasar_payout_id IS NOT NULL`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_providers_moyasar_payout_account ON providers(moyasar_payout_account_id) WHERE moyasar_payout_account_id IS NOT NULL`);

// ─── CRON HEARTBEATS (migration 022) ─────────────────────────────────────────
// Per-cron last-run timestamp + outcome. Node crons UPSERT a row at the end
// of each tick; the Python heartbeat_mvp probe reads this to detect stuck
// crons and alerts on staleness > 2 × interval_ms.
db.exec(`
  CREATE TABLE IF NOT EXISTS cron_heartbeats (
    cron_id            TEXT PRIMARY KEY,
    last_run_at        REAL NOT NULL,
    last_outcome       TEXT NOT NULL,
    last_summary       TEXT,
    last_error         TEXT,
    interval_ms        INTEGER NOT NULL,
    consecutive_errors INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_last_run ON cron_heartbeats(last_run_at)`);

// ─── BILLING ATOMICITY: request-id idempotency table (migration 021) ──────────
// One row per /v1 inference request. PK on request_id makes settlement
// transactions idempotent under retry (process crash, webhook replay, sweep).
db.exec(`
  CREATE TABLE IF NOT EXISTS billing_attempts (
    request_id              TEXT    PRIMARY KEY,
    renter_id               INTEGER NOT NULL,
    provider_id             INTEGER,
    cost_halala             INTEGER NOT NULL,
    provider_earned_halala  INTEGER NOT NULL,
    status                  TEXT    NOT NULL CHECK(status IN ('settled','insufficient_balance','error')),
    error_code              TEXT,
    settled_at              TEXT    NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_billing_attempts_renter ON billing_attempts(renter_id, settled_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_billing_attempts_status ON billing_attempts(status, settled_at DESC)`);

// ─── AUTO-TOP-UP: per-attempt audit log (migration 021) ──────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS auto_topup_attempts (
    id                    TEXT    PRIMARY KEY,
    renter_id             INTEGER NOT NULL,
    amount_halala         INTEGER NOT NULL,
    status                TEXT    NOT NULL CHECK(status IN ('initiated','paid','failed','3ds_required','capped','paused')),
    moyasar_payment_id    TEXT,
    trigger_reason        TEXT,
    balance_before_halala INTEGER,
    balance_after_halala  INTEGER,
    error_code            TEXT,
    error_message         TEXT,
    gateway_response      TEXT,
    created_at            TEXT    NOT NULL,
    completed_at          TEXT,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_auto_topup_attempts_renter ON auto_topup_attempts(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_auto_topup_attempts_status ON auto_topup_attempts(status, created_at DESC)`);

// ─── PROVIDER API KEYS TABLE ─── (DCP-760)
// Scoped long-lived credentials for unattended GPU provider nodes.
// Raw keys are never stored — only SHA-256 hashes.
// Key format: dcp_prov_<32 base62 chars>
// key_prefix: dcp_prov_<first 8 base62 chars> — stored plaintext for O(prefix) lookup.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_api_keys (
    id TEXT PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    label TEXT,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_prov_api_keys_prefix ON provider_api_keys(key_prefix, revoked_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_prov_api_keys_provider ON provider_api_keys(provider_id, revoked_at)`);

// ─── INVOICES TABLE ─── (DCP-780)
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    invoice_id      TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL UNIQUE,
    renter_id       INTEGER NOT NULL,
    provider_id     INTEGER,
    amount_usd      REAL NOT NULL,
    sar_equivalent  REAL NOT NULL,
    settlement_hash TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_renter   ON invoices(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_job      ON invoices(job_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider_id, created_at DESC)`);

// ─── OPENROUTER SETTLEMENT TABLES ─── (DCP-84)
// Usage-level immutable ledger for OpenRouter-billed traffic.
db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_usage_ledger (
    id                 TEXT PRIMARY KEY,
    request_id         TEXT,
    provider_response_id TEXT,
    job_id             TEXT,
    request_path       TEXT,
    renter_id          INTEGER NOT NULL,
    provider_id        INTEGER,
    model              TEXT NOT NULL,
    source             TEXT NOT NULL DEFAULT 'v1',
    prompt_tokens      INTEGER NOT NULL DEFAULT 0,
    completion_tokens  INTEGER NOT NULL DEFAULT 0,
    total_tokens       INTEGER NOT NULL DEFAULT 0,
    prompt_cost_halala INTEGER NOT NULL DEFAULT 0,
    completion_cost_halala INTEGER NOT NULL DEFAULT 0,
    token_rate_halala  INTEGER,
    cost_halala        INTEGER NOT NULL,
    usd_prompt         TEXT,
    usd_completion     TEXT,
    usd_total          TEXT,
    currency           TEXT NOT NULL DEFAULT 'SAR',
    settlement_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK(settlement_status IN ('pending','settled','failed')),
    settlement_id      TEXT,
    created_at         TEXT NOT NULL
  )
`);
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN request_id TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN provider_response_id TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN job_id TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN request_path TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN prompt_cost_halala INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN completion_cost_halala INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN token_rate_halala INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN usd_prompt TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN usd_completion TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE openrouter_usage_ledger ADD COLUMN usd_total TEXT').run(); } catch (_) {}
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_usage_pending ON openrouter_usage_ledger(settlement_status, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_usage_settlement ON openrouter_usage_ledger(settlement_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_usage_renter ON openrouter_usage_ledger(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_usage_job ON openrouter_usage_ledger(job_id, created_at DESC)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_or_usage_request_id ON openrouter_usage_ledger(request_id) WHERE request_id IS NOT NULL`);

db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_settlements (
    id                    TEXT PRIMARY KEY,
    period_start          TEXT NOT NULL,
    period_end            TEXT NOT NULL,
    cadence               TEXT NOT NULL DEFAULT 'daily',
    settlement_mode       TEXT NOT NULL
                          CHECK(settlement_mode IN ('invoice','auto_topup')),
    expected_total_halala INTEGER NOT NULL,
    reconciled_halala     INTEGER NOT NULL,
    discrepancy_halala    INTEGER NOT NULL DEFAULT 0,
    usage_count           INTEGER NOT NULL DEFAULT 0,
    currency              TEXT NOT NULL DEFAULT 'SAR',
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','processing','completed','partial','failed')),
    failure_reason        TEXT,
    created_at            TEXT NOT NULL,
    completed_at          TEXT
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_settlements_created ON openrouter_settlements(created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_settlements_status ON openrouter_settlements(status, created_at DESC)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_settlement_items (
    id             TEXT PRIMARY KEY,
    settlement_id  TEXT NOT NULL,
    usage_id       TEXT NOT NULL UNIQUE,
    renter_id      INTEGER NOT NULL,
    provider_id    INTEGER,
    cost_halala    INTEGER NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (settlement_id) REFERENCES openrouter_settlements(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_items_settlement ON openrouter_settlement_items(settlement_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_items_renter ON openrouter_settlement_items(renter_id, created_at DESC)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_settlement_invoices (
    id             TEXT PRIMARY KEY,
    settlement_id  TEXT NOT NULL UNIQUE,
    amount_halala  INTEGER NOT NULL,
    currency       TEXT NOT NULL DEFAULT 'SAR',
    due_at         TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'issued'
                   CHECK(status IN ('issued','paid','void')),
    created_at     TEXT NOT NULL,
    FOREIGN KEY (settlement_id) REFERENCES openrouter_settlements(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_settlement_topups (
    id             TEXT PRIMARY KEY,
    settlement_id  TEXT NOT NULL UNIQUE,
    amount_halala  INTEGER NOT NULL,
    currency       TEXT NOT NULL DEFAULT 'SAR',
    status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK(status IN ('queued','processed','failed')),
    created_at     TEXT NOT NULL,
    FOREIGN KEY (settlement_id) REFERENCES openrouter_settlements(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_settlement_alerts (
    id             TEXT PRIMARY KEY,
    settlement_id  TEXT,
    severity       TEXT NOT NULL DEFAULT 'warning'
                   CHECK(severity IN ('warning','critical')),
    code           TEXT NOT NULL,
    message        TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (settlement_id) REFERENCES openrouter_settlements(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_or_alerts_created ON openrouter_settlement_alerts(created_at DESC)`);

// ─── RENTER WEBHOOKS TABLE — DCP-861 ───
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_webhooks (
    id TEXT PRIMARY KEY,
    renter_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT 'job.completed,job.failed,balance.low',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (renter_id) REFERENCES renters(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_webhooks_renter ON renter_webhooks(renter_id, active)`);

// ─── RENTER WEBHOOK DELIVERIES TABLE — DCP-861 ───
db.exec(`
  CREATE TABLE IF NOT EXISTS renter_webhook_deliveries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL,
    renter_id INTEGER NOT NULL,
    job_id TEXT,
    event TEXT NOT NULL,
    payload TEXT,
    status_code INTEGER,
    attempt INTEGER NOT NULL DEFAULT 1,
    delivered INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (webhook_id) REFERENCES renter_webhooks(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_webhook_deliveries_webhook ON renter_webhook_deliveries(webhook_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_renter_webhook_deliveries_job ON renter_webhook_deliveries(job_id)`);

// ─── BILLING RECORDS TABLE ─── DCP-911
db.exec(`
  CREATE TABLE IF NOT EXISTS billing_records (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    renter_id INTEGER,
    provider_id INTEGER,
    model_id TEXT,
    token_count INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    gross_cost_halala INTEGER NOT NULL DEFAULT 0,
    platform_fee_halala INTEGER NOT NULL DEFAULT 0,
    provider_earning_halala INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'SAR',
    status TEXT NOT NULL DEFAULT 'pending_release'
      CHECK(status IN ('pending_release', 'released', 'disputed', 'refunded')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id),
    FOREIGN KEY (renter_id) REFERENCES renters(id),
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_billing_records_job ON billing_records(job_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_billing_records_provider ON billing_records(provider_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_billing_records_renter ON billing_records(renter_id, created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_billing_records_status ON billing_records(status, created_at DESC)`);

// ─── REFERRALS TABLE ───
// Provider referral system: each provider gets a referral code. When a new provider
// signs up with a referral code, the referrer earns a percentage of their first month.
db.exec(`
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    referred_id INTEGER NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'paid')),
    bonus_pct REAL DEFAULT 5.0,
    bonus_duration_days INTEGER DEFAULT 30,
    total_bonus_halala INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    paid_at DATETIME,
    FOREIGN KEY (referrer_id) REFERENCES providers(id),
    FOREIGN KEY (referred_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_pair ON referrals(referrer_id, referred_id)`);

// Add referral_code to providers table
try { db.prepare('ALTER TABLE providers ADD COLUMN referral_code TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE providers ADD COLUMN referred_by INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE providers ADD COLUMN referral_earnings_halala INTEGER DEFAULT 0').run(); } catch (_) {}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_referral_code ON providers(referral_code)`);

// ─── PROV-9 — provider API-key hashing (backward-compatible) ────────────────
// Provider keys were stored + compared as raw plaintext across ~58 WHERE
// api_key = ? lookups. Add a sha256 hash column + a one-time startup backfill.
// CRITICAL SAFETY: the LIVE fleet's daemon keeps sending its PLAINTEXT key in
// every heartbeat and we do NOT change the daemon. The server hashes the
// incoming plaintext to look up by hash; routes/providers.js also keeps a
// legacy plaintext fallback so a row whose hash was not yet backfilled still
// authenticates. The plaintext `api_key` column is intentionally retained.
try { db.prepare('ALTER TABLE providers ADD COLUMN api_key_hash TEXT').run(); } catch (_) { /* idempotent */ }
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_providers_api_key_hash ON providers(api_key_hash)`); } catch (_) {}
// One-time backfill: hash every existing plaintext key that has no hash yet.
// Idempotent (WHERE api_key_hash IS NULL) so restarts are cheap no-ops.
try {
  const _toBackfill = db.prepare('SELECT id, api_key FROM providers WHERE api_key_hash IS NULL AND api_key IS NOT NULL').all();
  if (_toBackfill.length > 0) {
    const _setHash = db.prepare('UPDATE providers SET api_key_hash = ? WHERE id = ?');
    const _runBackfill = db.transaction((rows) => {
      for (const r of rows) _setHash.run(sha256hex(r.api_key), r.id);
    });
    _runBackfill(_toBackfill);
    console.log(`[db][PROV-9] backfilled api_key_hash for ${_toBackfill.length} provider(s)`);
  }
} catch (e) {
  console.warn('[db][PROV-9] api_key_hash backfill failed (non-fatal, plaintext fallback still authenticates):', e && e.message);
}

// ─── PROVIDER GROUPS TABLE ───
// Fleet management: group multiple machines under one account.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'disbanded')),
    total_gpus INTEGER DEFAULT 0,
    total_vram_gb REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_provider_groups_owner ON provider_groups(owner_id, status)`);

// Add group membership to providers
try { db.prepare('ALTER TABLE providers ADD COLUMN group_id INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE providers ADD COLUMN group_role TEXT DEFAULT \'member\'').run(); } catch (_) {}
db.exec(`CREATE INDEX IF NOT EXISTS idx_providers_group ON providers(group_id)`);

// ─── MISSION CONTROL TABLES ───
// Native task/goal/milestone tracking for humans + agents. Single store,
// no Plane/external dependency. See migrations/012_mission_control.sql
// for the canonical schema documentation.
db.exec(`
  CREATE TABLE IF NOT EXISTS mission_assignees (
    id           TEXT    PRIMARY KEY,
    display_name TEXT    NOT NULL,
    kind         TEXT    NOT NULL CHECK(kind IN ('human','agent')),
    avatar_url   TEXT,
    external_id  TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mission_goals (
    id          TEXT    PRIMARY KEY,
    title       TEXT    NOT NULL,
    description TEXT,
    owner_id    TEXT,
    status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','done','dropped')),
    target_date TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mission_milestones (
    id           TEXT    PRIMARY KEY,
    goal_id      TEXT,
    name         TEXT    NOT NULL,
    description  TEXT,
    status       TEXT    NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','done','dropped')),
    target_date  TEXT,
    completed_at TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS mission_tasks (
    id             TEXT    PRIMARY KEY,
    title          TEXT    NOT NULL,
    description    TEXT,
    status         TEXT    NOT NULL DEFAULT 'todo'
                   CHECK(status IN ('todo','in_progress','blocked','review','done','cancelled')),
    priority       TEXT    NOT NULL DEFAULT 'p2' CHECK(priority IN ('p0','p1','p2','p3')),
    assignee_id    TEXT,
    milestone_id   TEXT,
    goal_id        TEXT,
    created_by     TEXT,
    due_date       TEXT,
    blocked_reason TEXT,
    source         TEXT,
    source_url     TEXT,
    external_id    TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at   TEXT
  );
  CREATE TABLE IF NOT EXISTS mission_task_comments (
    id         TEXT    PRIMARY KEY,
    task_id    TEXT    NOT NULL,
    author_id  TEXT,
    body       TEXT    NOT NULL,
    source     TEXT,
    kind       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mission_tasks_status    ON mission_tasks(status, priority, due_date);
  CREATE INDEX IF NOT EXISTS idx_mission_tasks_assignee  ON mission_tasks(assignee_id, status);
  CREATE INDEX IF NOT EXISTS idx_mission_tasks_milestone ON mission_tasks(milestone_id);
  CREATE INDEX IF NOT EXISTS idx_mission_tasks_goal      ON mission_tasks(goal_id);
  CREATE INDEX IF NOT EXISTS idx_mission_tasks_updated   ON mission_tasks(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mission_milestones_goal ON mission_milestones(goal_id, status);
  CREATE INDEX IF NOT EXISTS idx_mission_comments_task   ON mission_task_comments(task_id, created_at DESC);
`);
const _missionSeed = db.prepare(
  `INSERT OR IGNORE INTO mission_assignees (id, display_name, kind, external_id) VALUES (?, ?, ?, ?)`
);
for (const a of [
  ['peter',  'Peter',        'human', '7652446182'],
  ['tareq',  'Tareq',        'human', '5297693905'],
  ['fadi',   'Fadi',         'human', null],
  ['claude', 'Claude (dev)', 'agent', 'dcp_dev_bot'],
  ['nexus',  'Nexus',        'agent', 'NexusDatacenter_bot'],
  ['tito',   'Tito (bench)', 'agent', 'Tito_the_bot'],
]) {
  try { _missionSeed.run(...a); } catch (_) {}
}

// ─── HERMES AGENT OBSERVABILITY TABLES ───
// Closes the gap surfaced 2026-05-13 on Tareq Node 2: the provider's local
// agent (Hermes) writes errors to ~/.dcp/agent.log but never ships them.
// `provider_agent_liveness` is upserted on every Hermes beacon (60s cadence);
// `provider_agent_log_snapshots` holds opt-in log tail uploads triggered by
// admin setting `wants_logs_at`. See backend/src/routes/providers.js
// agent-liveness/agent-logs routes for the ingest path.
db.exec(`
  CREATE TABLE IF NOT EXISTS provider_agent_liveness (
    provider_id INTEGER PRIMARY KEY,
    agent TEXT NOT NULL,
    pid INTEGER,
    uptime_s INTEGER,
    dashboard_port INTEGER,
    gateway_state TEXT,
    active_agents INTEGER,
    platforms_json TEXT,
    last_error_excerpt TEXT,
    last_error_at TEXT,
    mem_rss_mb INTEGER,
    log_tail_sha256 TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    wants_logs_at TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS provider_agent_log_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER NOT NULL,
    captured_at TEXT NOT NULL DEFAULT (datetime('now')),
    byte_count INTEGER,
    log_excerpt TEXT,
    FOREIGN KEY (provider_id) REFERENCES providers(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_log_snapshots_provider ON provider_agent_log_snapshots(provider_id, captured_at)`);

// Compatibility wrapper: providers.js uses db.run/get/all (async sqlite3 style)
// better-sqlite3 uses db.prepare().run/get/all - these wrappers bridge the gap
function flatParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => Array.isArray(p) ? acc.concat(p) : acc.concat([p]), []);
}

module.exports = {
  run: (sql, ...params) => db.prepare(sql).run(...flatParams(params)),
  get: (sql, ...params) => db.prepare(sql).get(...flatParams(params)),
  all: (sql, ...params) => db.prepare(sql).all(...flatParams(params)),
  prepare: (sql) => db.prepare(sql),
  transaction: (fn) => db.transaction(fn),
  close: () => db.close(),
  _db: db
};
