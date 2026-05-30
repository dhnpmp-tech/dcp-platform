'use strict';

const db = require('../db');

const ONLINE_THRESHOLD_SECONDS = 120;
const DEGRADED_THRESHOLD_SECONDS = 600;
const DEFAULT_PRICING_CLASS = 'standard';
const PRICING_CLASS_ORDER = ['priority', 'standard', 'economy'];
const PRICING_CLASS_SET = new Set(PRICING_CLASS_ORDER);
const DEFAULT_CAPACITY_CLASS = 'on_demand';
const CAPACITY_CLASS_ORDER = ['on_demand', 'flex', 'spot'];
const CAPACITY_CLASS_SET = new Set(CAPACITY_CLASS_ORDER);
const MAX_BUCKETS = 500;
const DEFAULT_COLD_START_P50_SLO_MS = 8000;
const DEFAULT_COLD_START_P95_SLO_MS = 20000;
const DEFAULT_GPU_UTILIZATION_SLO_PCT = 85;
const TOP_DEMAND_MODELS_LIMIT = 10;

function normalizePricingClass(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return DEFAULT_PRICING_CLASS;
  return PRICING_CLASS_SET.has(normalized) ? normalized : DEFAULT_PRICING_CLASS;
}

function normalizeComputeType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'inference';
}

function normalizeCapacityClass(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return DEFAULT_CAPACITY_CLASS;
  if (normalized === 'ondemand') return 'on_demand';
  return CAPACITY_CLASS_SET.has(normalized) ? normalized : DEFAULT_CAPACITY_CLASS;
}

function percentileFromSorted(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  if (percentile <= 0) return sortedValues[0];
  if (percentile >= 100) return sortedValues[sortedValues.length - 1];

  const rank = (percentile / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sortedValues[low];
  const ratio = rank - low;
  return sortedValues[low] + (sortedValues[high] - sortedValues[low]) * ratio;
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseSupportedComputeTypes(raw) {
  if (!raw) return null;

  const parsed = parseJsonSafe(raw);
  if (Array.isArray(parsed)) {
    const set = new Set(parsed.map((v) => normalizeComputeType(v)).filter(Boolean));
    return set.size > 0 ? set : null;
  }

  if (typeof raw === 'string') {
    const set = new Set(
      raw
        .split(',')
        .map((token) => normalizeComputeType(token))
        .filter(Boolean)
    );
    return set.size > 0 ? set : null;
  }

  return null;
}

function resolveProviderVramMb(provider) {
  const direct = toFiniteNumber(provider?.vram_mb);
  if (direct != null && direct > 0) return direct;

  const gpuMb = toFiniteNumber(provider?.gpu_vram_mb);
  if (gpuMb != null && gpuMb > 0) return gpuMb;

  const gpuMib = toFiniteNumber(provider?.gpu_vram_mib);
  if (gpuMib != null && gpuMib > 0) return gpuMib;

  const vramGb = toFiniteNumber(provider?.vram_gb);
  if (vramGb != null && vramGb > 0) return Math.round(vramGb * 1024);

  return 0;
}

function getProviderLiveStatus(lastHeartbeat, nowMs) {
  if (!lastHeartbeat) return 'offline';
  const heartbeatMs = Date.parse(lastHeartbeat);
  if (!Number.isFinite(heartbeatMs)) return 'offline';
  const ageSeconds = (nowMs - heartbeatMs) / 1000;
  if (ageSeconds < ONLINE_THRESHOLD_SECONDS) return 'online';
  if (ageSeconds < DEGRADED_THRESHOLD_SECONDS) return 'degraded';
  return 'offline';
}

function getDefaultPolicy(pricingClass) {
  const normalized = normalizePricingClass(pricingClass);
  if (normalized === 'priority') {
    return {
      pricing_class: 'priority',
      target_queue_wait_seconds: 30,
      target_cold_start_ms: 20000,
      target_cold_start_p50_ms: 8000,
      target_gpu_utilization_pct: 80,
      queue_per_warm_provider: 1,
      min_warm_providers: 2,
      max_scale_up_step: 5,
      scale_down_idle_seconds: 300,
      prewarm_enabled: 1,
    };
  }
  if (normalized === 'economy') {
    return {
      pricing_class: 'economy',
      target_queue_wait_seconds: 180,
      target_cold_start_ms: 20000,
      target_cold_start_p50_ms: 8000,
      target_gpu_utilization_pct: 92,
      queue_per_warm_provider: 3,
      min_warm_providers: 0,
      max_scale_up_step: 2,
      scale_down_idle_seconds: 1200,
      prewarm_enabled: 0,
    };
  }
  return {
    pricing_class: 'standard',
    target_queue_wait_seconds: 90,
    target_cold_start_ms: 20000,
    target_cold_start_p50_ms: 8000,
    target_gpu_utilization_pct: 85,
    queue_per_warm_provider: 2,
    min_warm_providers: 1,
    max_scale_up_step: 3,
    scale_down_idle_seconds: 600,
    prewarm_enabled: 1,
  };
}

function listPolicies() {
  const rows = db.all(
    `SELECT pricing_class,
            target_queue_wait_seconds,
            target_cold_start_ms,
            target_cold_start_p50_ms,
            target_gpu_utilization_pct,
            queue_per_warm_provider,
            min_warm_providers,
            max_scale_up_step,
            scale_down_idle_seconds,
            prewarm_enabled,
            updated_at
     FROM control_plane_policies
     ORDER BY CASE pricing_class
              WHEN 'priority' THEN 0
              WHEN 'standard' THEN 1
              WHEN 'economy' THEN 2
              ELSE 3 END`
  );

  const byClass = new Map(rows.map((row) => [normalizePricingClass(row.pricing_class), row]));
  return PRICING_CLASS_ORDER.map((pricingClass) => {
    const row = byClass.get(pricingClass);
    const defaults = getDefaultPolicy(pricingClass);
    return {
      ...defaults,
      ...(row || {}),
      pricing_class: pricingClass,
      prewarm_enabled: Number(row?.prewarm_enabled ?? defaults.prewarm_enabled) ? 1 : 0,
      target_cold_start_ms: Number(row?.target_cold_start_ms ?? defaults.target_cold_start_ms),
      target_cold_start_p50_ms: Number(row?.target_cold_start_p50_ms ?? defaults.target_cold_start_p50_ms),
      target_gpu_utilization_pct: Number(row?.target_gpu_utilization_pct ?? defaults.target_gpu_utilization_pct),
      updated_at: row?.updated_at || null,
    };
  });
}

function getDefaultCapacityPolicy(capacityClass) {
  const normalized = normalizeCapacityClass(capacityClass);
  if (normalized === 'flex') {
    return {
      capacity_class: 'flex',
      queue_wait_multiplier: 1.2,
      warm_pool_multiplier: 0.6,
      max_scale_up_multiplier: 0.8,
      min_warm_floor: 0,
      prewarm_enabled: 1,
      spillover_to_higher_class: 1,
      preemptible: 1,
      enabled: 1,
    };
  }
  if (normalized === 'spot') {
    return {
      capacity_class: 'spot',
      queue_wait_multiplier: 1.5,
      warm_pool_multiplier: 0.0,
      max_scale_up_multiplier: 0.6,
      min_warm_floor: 0,
      prewarm_enabled: 0,
      spillover_to_higher_class: 0,
      preemptible: 1,
      enabled: 1,
    };
  }
  return {
    capacity_class: 'on_demand',
    queue_wait_multiplier: 1.0,
    warm_pool_multiplier: 1.0,
    max_scale_up_multiplier: 1.0,
    min_warm_floor: 1,
    prewarm_enabled: 1,
    spillover_to_higher_class: 1,
    preemptible: 0,
    enabled: 1,
  };
}

function listCapacityPolicies() {
  const rows = db.all(
    `SELECT capacity_class,
            queue_wait_multiplier,
            warm_pool_multiplier,
            max_scale_up_multiplier,
            min_warm_floor,
            prewarm_enabled,
            spillover_to_higher_class,
            preemptible,
            enabled,
            updated_at
     FROM control_plane_capacity_policies
     ORDER BY CASE capacity_class
              WHEN 'on_demand' THEN 0
              WHEN 'flex' THEN 1
              WHEN 'spot' THEN 2
              ELSE 3 END`
  );

  const byClass = new Map(rows.map((row) => [normalizeCapacityClass(row.capacity_class), row]));
  return CAPACITY_CLASS_ORDER.map((capacityClass) => {
    const defaults = getDefaultCapacityPolicy(capacityClass);
    const row = byClass.get(capacityClass) || {};
    return {
      ...defaults,
      ...row,
      capacity_class: capacityClass,
      queue_wait_multiplier: Number(row.queue_wait_multiplier ?? defaults.queue_wait_multiplier),
      warm_pool_multiplier: Number(row.warm_pool_multiplier ?? defaults.warm_pool_multiplier),
      max_scale_up_multiplier: Number(row.max_scale_up_multiplier ?? defaults.max_scale_up_multiplier),
      min_warm_floor: Number(row.min_warm_floor ?? defaults.min_warm_floor),
      prewarm_enabled: Number(row.prewarm_enabled ?? defaults.prewarm_enabled) ? 1 : 0,
      spillover_to_higher_class: Number(row.spillover_to_higher_class ?? defaults.spillover_to_higher_class) ? 1 : 0,
      preemptible: Number(row.preemptible ?? defaults.preemptible) ? 1 : 0,
      enabled: Number(row.enabled ?? defaults.enabled) ? 1 : 0,
      updated_at: row.updated_at || null,
    };
  });
}

function getCapacityPolicyMap() {
  const map = new Map();
  for (const policy of listCapacityPolicies()) {
    map.set(policy.capacity_class, {
      capacity_class: policy.capacity_class,
      queue_wait_multiplier: Math.max(0.5, Math.min(3, Number(policy.queue_wait_multiplier || 1))),
      warm_pool_multiplier: Math.max(0, Math.min(3, Number(policy.warm_pool_multiplier || 1))),
      max_scale_up_multiplier: Math.max(0.25, Math.min(3, Number(policy.max_scale_up_multiplier || 1))),
      min_warm_floor: Math.max(0, Math.min(1000, Number(policy.min_warm_floor || 0))),
      prewarm_enabled: Number(policy.prewarm_enabled) ? 1 : 0,
      spillover_to_higher_class: Number(policy.spillover_to_higher_class) ? 1 : 0,
      preemptible: Number(policy.preemptible) ? 1 : 0,
      enabled: Number(policy.enabled) ? 1 : 0,
      updated_at: policy.updated_at || null,
    });
  }
  return map;
}

function getPolicyMap() {
  const map = new Map();
  for (const policy of listPolicies()) {
    map.set(policy.pricing_class, {
      pricing_class: policy.pricing_class,
      target_queue_wait_seconds: Number(policy.target_queue_wait_seconds || getDefaultPolicy(policy.pricing_class).target_queue_wait_seconds),
      target_cold_start_ms: Number(policy.target_cold_start_ms || getDefaultPolicy(policy.pricing_class).target_cold_start_ms),
      target_cold_start_p50_ms: Number(policy.target_cold_start_p50_ms || getDefaultPolicy(policy.pricing_class).target_cold_start_p50_ms),
      target_gpu_utilization_pct: Number(policy.target_gpu_utilization_pct || getDefaultPolicy(policy.pricing_class).target_gpu_utilization_pct),
      queue_per_warm_provider: Math.max(1, Number(policy.queue_per_warm_provider || getDefaultPolicy(policy.pricing_class).queue_per_warm_provider)),
      min_warm_providers: Math.max(0, Number(policy.min_warm_providers || getDefaultPolicy(policy.pricing_class).min_warm_providers)),
      max_scale_up_step: Math.max(1, Number(policy.max_scale_up_step || getDefaultPolicy(policy.pricing_class).max_scale_up_step)),
      scale_down_idle_seconds: Math.max(60, Number(policy.scale_down_idle_seconds || getDefaultPolicy(policy.pricing_class).scale_down_idle_seconds)),
      prewarm_enabled: Number(policy.prewarm_enabled) ? 1 : 0,
      updated_at: policy.updated_at || null,
    });
  }
  return map;
}

function updatePolicy(pricingClass, patch = {}) {
  const normalizedClass = normalizePricingClass(pricingClass);
  const existing = getPolicyMap().get(normalizedClass) || getDefaultPolicy(normalizedClass);

  const next = {
    pricing_class: normalizedClass,
    target_queue_wait_seconds: Number.isFinite(Number(patch.target_queue_wait_seconds))
      ? Math.max(5, Math.min(3600, Number(patch.target_queue_wait_seconds)))
      : Number(existing.target_queue_wait_seconds),
    target_cold_start_ms: Number.isFinite(Number(patch.target_cold_start_ms))
      ? Math.max(1000, Math.min(120000, Number(patch.target_cold_start_ms)))
      : Number(existing.target_cold_start_ms),
    target_cold_start_p50_ms: Number.isFinite(Number(patch.target_cold_start_p50_ms))
      ? Math.max(1000, Math.min(60000, Number(patch.target_cold_start_p50_ms)))
      : Number(existing.target_cold_start_p50_ms || DEFAULT_COLD_START_P50_SLO_MS),
    target_gpu_utilization_pct: Number.isFinite(Number(patch.target_gpu_utilization_pct))
      ? Math.max(10, Math.min(100, Number(patch.target_gpu_utilization_pct)))
      : Number(existing.target_gpu_utilization_pct || DEFAULT_GPU_UTILIZATION_SLO_PCT),
    queue_per_warm_provider: Number.isFinite(Number(patch.queue_per_warm_provider))
      ? Math.max(1, Math.min(100, Number(patch.queue_per_warm_provider)))
      : Number(existing.queue_per_warm_provider),
    min_warm_providers: Number.isFinite(Number(patch.min_warm_providers))
      ? Math.max(0, Math.min(1000, Number(patch.min_warm_providers)))
      : Number(existing.min_warm_providers),
    max_scale_up_step: Number.isFinite(Number(patch.max_scale_up_step))
      ? Math.max(1, Math.min(1000, Number(patch.max_scale_up_step)))
      : Number(existing.max_scale_up_step),
    scale_down_idle_seconds: Number.isFinite(Number(patch.scale_down_idle_seconds))
      ? Math.max(60, Math.min(86400, Number(patch.scale_down_idle_seconds)))
      : Number(existing.scale_down_idle_seconds),
    prewarm_enabled: patch.prewarm_enabled == null
      ? Number(existing.prewarm_enabled) ? 1 : 0
      : (Number(patch.prewarm_enabled) ? 1 : 0),
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO control_plane_policies (
       pricing_class,
       target_queue_wait_seconds,
       target_cold_start_ms,
       target_cold_start_p50_ms,
       target_gpu_utilization_pct,
       queue_per_warm_provider,
       min_warm_providers,
       max_scale_up_step,
       scale_down_idle_seconds,
       prewarm_enabled,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pricing_class) DO UPDATE SET
       target_queue_wait_seconds = excluded.target_queue_wait_seconds,
       target_cold_start_ms = excluded.target_cold_start_ms,
       target_cold_start_p50_ms = excluded.target_cold_start_p50_ms,
       target_gpu_utilization_pct = excluded.target_gpu_utilization_pct,
       queue_per_warm_provider = excluded.queue_per_warm_provider,
       min_warm_providers = excluded.min_warm_providers,
       max_scale_up_step = excluded.max_scale_up_step,
       scale_down_idle_seconds = excluded.scale_down_idle_seconds,
       prewarm_enabled = excluded.prewarm_enabled,
       updated_at = excluded.updated_at`
  ).run(
    next.pricing_class,
    next.target_queue_wait_seconds,
    next.target_cold_start_ms,
    next.target_cold_start_p50_ms,
    next.target_gpu_utilization_pct,
    next.queue_per_warm_provider,
    next.min_warm_providers,
    next.max_scale_up_step,
    next.scale_down_idle_seconds,
    next.prewarm_enabled,
    next.updated_at
  );

  return next;
}

function updateCapacityPolicy(capacityClass, patch = {}) {
  const normalizedClass = normalizeCapacityClass(capacityClass);
  const existing = getCapacityPolicyMap().get(normalizedClass) || getDefaultCapacityPolicy(normalizedClass);
  const next = {
    capacity_class: normalizedClass,
    queue_wait_multiplier: Number.isFinite(Number(patch.queue_wait_multiplier))
      ? Math.max(0.5, Math.min(3, Number(patch.queue_wait_multiplier)))
      : Number(existing.queue_wait_multiplier),
    warm_pool_multiplier: Number.isFinite(Number(patch.warm_pool_multiplier))
      ? Math.max(0, Math.min(3, Number(patch.warm_pool_multiplier)))
      : Number(existing.warm_pool_multiplier),
    max_scale_up_multiplier: Number.isFinite(Number(patch.max_scale_up_multiplier))
      ? Math.max(0.25, Math.min(3, Number(patch.max_scale_up_multiplier)))
      : Number(existing.max_scale_up_multiplier),
    min_warm_floor: Number.isFinite(Number(patch.min_warm_floor))
      ? Math.max(0, Math.min(1000, Number(patch.min_warm_floor)))
      : Number(existing.min_warm_floor),
    prewarm_enabled: patch.prewarm_enabled == null
      ? (Number(existing.prewarm_enabled) ? 1 : 0)
      : (Number(patch.prewarm_enabled) ? 1 : 0),
    spillover_to_higher_class: patch.spillover_to_higher_class == null
      ? (Number(existing.spillover_to_higher_class) ? 1 : 0)
      : (Number(patch.spillover_to_higher_class) ? 1 : 0),
    preemptible: patch.preemptible == null
      ? (Number(existing.preemptible) ? 1 : 0)
      : (Number(patch.preemptible) ? 1 : 0),
    enabled: patch.enabled == null
      ? (Number(existing.enabled) ? 1 : 0)
      : (Number(patch.enabled) ? 1 : 0),
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO control_plane_capacity_policies (
       capacity_class,
       queue_wait_multiplier,
       warm_pool_multiplier,
       max_scale_up_multiplier,
       min_warm_floor,
       prewarm_enabled,
       spillover_to_higher_class,
       preemptible,
       enabled,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(capacity_class) DO UPDATE SET
       queue_wait_multiplier = excluded.queue_wait_multiplier,
       warm_pool_multiplier = excluded.warm_pool_multiplier,
       max_scale_up_multiplier = excluded.max_scale_up_multiplier,
       min_warm_floor = excluded.min_warm_floor,
       prewarm_enabled = excluded.prewarm_enabled,
       spillover_to_higher_class = excluded.spillover_to_higher_class,
       preemptible = excluded.preemptible,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`
  ).run(
    next.capacity_class,
    next.queue_wait_multiplier,
    next.warm_pool_multiplier,
    next.max_scale_up_multiplier,
    next.min_warm_floor,
    next.prewarm_enabled,
    next.spillover_to_higher_class,
    next.preemptible,
    next.enabled,
    next.updated_at
  );

  return next;
}

function getRecentSignals(limit = 100) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
  return db.all(
    `SELECT id,
            pricing_class,
            capacity_class,
            compute_type,
            vram_required_mb,
            queued_total,
            active_total,
            providers_online,
            providers_degraded,
            providers_warm,
            avg_queue_wait_seconds,
            p95_queue_wait_seconds,
            avg_gpu_util_pct,
            cold_start_p95_ms,
            cold_start_p50_ms,
            recommended_warm_pool,
            recommended_scale_delta,
            recommended_action,
            reason,
            snapshot_json,
            created_at
     FROM control_plane_signals
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    safeLimit
  );
}

function loadProviderPool() {
  return db.all(
    `SELECT id,
            is_paused,
            status,
            last_heartbeat,
            supported_compute_types,
            vram_mb,
            gpu_vram_mb,
            gpu_vram_mib,
            vram_gb,
            model_preload_status,
            model_preload_model
     FROM providers`
  );
}

function getGlobalColdStartMetrics() {
  const rows = db.all(
    `SELECT cold_start_ms
     FROM provider_gpu_telemetry
     WHERE cold_start_ms IS NOT NULL
       AND cold_start_ms > 0
       AND recorded_at >= datetime('now', '-24 hours')
     ORDER BY cold_start_ms ASC`
  );
  const values = rows
    .map((row) => Number(row?.cold_start_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (values.length === 0) {
    return {
      sample_count_24h: 0,
      p50_ms: null,
      p95_ms: null,
    };
  }
  return {
    sample_count_24h: values.length,
    p50_ms: Math.round(percentileFromSorted(values, 50)),
    p95_ms: Math.round(percentileFromSorted(values, 95)),
  };
}

function loadLatestUtilizationByProvider() {
  const rows = db.all(
    `SELECT t.provider_id,
            t.gpu_util_pct
     FROM provider_gpu_telemetry t
     INNER JOIN (
       SELECT provider_id, MAX(recorded_at) AS max_recorded_at
       FROM provider_gpu_telemetry
       GROUP BY provider_id
     ) latest
       ON latest.provider_id = t.provider_id
      AND latest.max_recorded_at = t.recorded_at`
  );

  const byProvider = new Map();
  for (const row of rows) {
    const util = toFiniteNumber(row?.gpu_util_pct);
    byProvider.set(Number(row?.provider_id), util != null ? util : null);
  }
  return byProvider;
}

function listTopDemandModels(limit = TOP_DEMAND_MODELS_LIMIT, lookbackDays = 7) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || TOP_DEMAND_MODELS_LIMIT));
  const safeLookback = Math.max(1, Math.min(30, Number(lookbackDays) || 7));
  return db.all(
    `SELECT model,
            COUNT(*) AS job_count,
            MAX(COALESCE(submitted_at, created_at)) AS last_seen_at
     FROM jobs
     WHERE model IS NOT NULL
       AND TRIM(model) <> ''
       AND COALESCE(capacity_class, 'on_demand') <> 'spot'
       AND datetime(COALESCE(submitted_at, created_at)) >= datetime('now', ?)
     GROUP BY model
     ORDER BY job_count DESC, last_seen_at DESC
     LIMIT ?`,
    `-${safeLookback} days`,
    safeLimit
  ).map((row) => ({
    model: String(row.model).trim(),
    job_count: Number(row.job_count || 0),
    last_seen_at: row.last_seen_at || null,
  }));
}

function isProviderEligibleForBucket(provider, bucket, nowMs) {
  if (!provider || Number(provider.is_paused) === 1) return { eligible: false };
  const liveStatus = getProviderLiveStatus(provider.last_heartbeat, nowMs);
  if (liveStatus === 'offline') return { eligible: false, live_status: 'offline' };

  const providerVramMb = resolveProviderVramMb(provider);
  if (providerVramMb < Number(bucket.vram_required_mb || 0)) {
    return { eligible: false, live_status: liveStatus };
  }

  const computeSet = parseSupportedComputeTypes(provider.supported_compute_types);
  if (computeSet && !computeSet.has(bucket.compute_type)) {
    return { eligible: false, live_status: liveStatus };
  }

  const modelPreloadStatus = String(provider.model_preload_status || '').toLowerCase();
  const preloadModel = String(provider.model_preload_model || '');
  const hasModelHints = bucket.models.size > 0;
  const modelMatch = !hasModelHints || bucket.models.has(preloadModel);
  const warmReady = modelMatch && (modelPreloadStatus === 'ready' || modelPreloadStatus === 'warming');

  return {
    eligible: true,
    live_status: liveStatus,
    warm_ready: warmReady,
  };
}

function selectQueueRows(actor) {
  const where = [`status = 'queued'`];
  const params = [];

  if (actor?.type === 'provider') {
    where.push('provider_id = ?');
    params.push(actor.id);
  } else if (actor?.type === 'renter') {
    where.push('renter_id = ?');
    params.push(actor.id);
  }

  return db.all(
    `SELECT id,
            provider_id,
            renter_id,
            created_at,
            submitted_at,
            model,
            priority,
            pricing_class,
            capacity_class,
            container_spec
     FROM jobs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at ASC`,
    ...params
  );
}

function calculateControlPlaneSignals({ actor = null, persist = false, maxBuckets = MAX_BUCKETS } = {}) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const queueRows = selectQueueRows(actor);
  const providers = loadProviderPool();
  const policyMap = getPolicyMap();
  const capacityPolicyMap = getCapacityPolicyMap();
  const coldStartMetrics = getGlobalColdStartMetrics();
  const coldStartP95Ms = coldStartMetrics.p95_ms;
  const coldStartP50Ms = coldStartMetrics.p50_ms;
  const latestUtilByProvider = loadLatestUtilizationByProvider();

  const grouped = new Map();
  for (const row of queueRows) {
    const containerSpec = parseJsonSafe(row.container_spec) || {};
    const computeType = normalizeComputeType(containerSpec.compute_type);
    const vramRequiredMb = Math.max(0, Number(containerSpec.vram_required_mb || 0));
    const pricingClass = normalizePricingClass(row.pricing_class || containerSpec.pricing_class);
    const capacityClass = normalizeCapacityClass(row.capacity_class || containerSpec.capacity_class);
    const modelHint = String(containerSpec.model_id || row.model || '').trim();
    const submittedAt = Date.parse(row.submitted_at || row.created_at || nowIso);
    const waitSeconds = Number.isFinite(submittedAt)
      ? Math.max(0, Math.round((nowMs - submittedAt) / 1000))
      : 0;

    const key = `${pricingClass}|${capacityClass}|${computeType}|${vramRequiredMb}`;
    const bucket = grouped.get(key) || {
      pricing_class: pricingClass,
      capacity_class: capacityClass,
      compute_type: computeType,
      vram_required_mb: vramRequiredMb,
      depth: 0,
      wait_seconds: [],
      priorities: [],
      models: new Set(),
    };

    bucket.depth += 1;
    bucket.wait_seconds.push(waitSeconds);
    bucket.priorities.push(Number(row.priority || 0));
    if (modelHint) bucket.models.add(modelHint);
    grouped.set(key, bucket);
  }

  const signals = [];
  for (const bucket of grouped.values()) {
    if (signals.length >= maxBuckets) break;

    const waitsSorted = bucket.wait_seconds
      .map((value) => Number(value || 0))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b);

    const avgQueueWaitSeconds = waitsSorted.length > 0
      ? Number((waitsSorted.reduce((sum, value) => sum + value, 0) / waitsSorted.length).toFixed(2))
      : 0;
    const p95QueueWaitSeconds = waitsSorted.length > 0
      ? Number(percentileFromSorted(waitsSorted, 95).toFixed(2))
      : 0;

    const policy = policyMap.get(bucket.pricing_class) || getDefaultPolicy(bucket.pricing_class);
    const capacityPolicy = capacityPolicyMap.get(bucket.capacity_class) || getDefaultCapacityPolicy(bucket.capacity_class);
    if (!capacityPolicy.enabled) continue;

    let providersOnline = 0;
    let providersDegraded = 0;
    let providersWarm = 0;
    let utilSum = 0;
    let utilCount = 0;
    for (const provider of providers) {
      const eligibility = isProviderEligibleForBucket(provider, bucket, nowMs);
      if (!eligibility.eligible) continue;
      if (eligibility.live_status === 'online') providersOnline += 1;
      if (eligibility.live_status === 'degraded') providersDegraded += 1;
      if (eligibility.warm_ready) providersWarm += 1;

      const util = latestUtilByProvider.get(Number(provider.id));
      if (Number.isFinite(util)) {
        utilSum += Number(util);
        utilCount += 1;
      }
    }
    const avgGpuUtilPct = utilCount > 0 ? Number((utilSum / utilCount).toFixed(2)) : null;

    const activeCapacity = providersOnline + providersDegraded;
    const targetQueueWaitSeconds = Number(policy.target_queue_wait_seconds || 0) * Number(capacityPolicy.queue_wait_multiplier || 1);
    const warmPoolBase = Math.ceil(bucket.depth / Math.max(1, policy.queue_per_warm_provider));
    const recommendedWarmPool = Math.max(
      Number(capacityPolicy.min_warm_floor || 0),
      Math.ceil(Math.max(policy.min_warm_providers, warmPoolBase) * Number(capacityPolicy.warm_pool_multiplier || 1))
    );

    const queueSloBreached = p95QueueWaitSeconds > targetQueueWaitSeconds;
    const targetColdStartP95Ms = Math.min(
      Number(policy.target_cold_start_ms || DEFAULT_COLD_START_P95_SLO_MS),
      DEFAULT_COLD_START_P95_SLO_MS
    );
    const targetColdStartP50Ms = Math.min(
      Number(policy.target_cold_start_p50_ms || DEFAULT_COLD_START_P50_SLO_MS),
      DEFAULT_COLD_START_P50_SLO_MS
    );
    const targetGpuUtilizationPct = Number(policy.target_gpu_utilization_pct || DEFAULT_GPU_UTILIZATION_SLO_PCT);

    const coldStartSloBreached = (
      (coldStartP95Ms != null && coldStartP95Ms > targetColdStartP95Ms)
      || (coldStartP50Ms != null && coldStartP50Ms > targetColdStartP50Ms)
    );
    const utilizationSloBreached = avgGpuUtilPct != null && avgGpuUtilPct > targetGpuUtilizationPct;
    const warmDeficit = Math.max(0, recommendedWarmPool - providersWarm);
    const capacityDeficit = Math.max(0, recommendedWarmPool - activeCapacity);

    let recommendedScaleDelta = 0;
    let recommendedAction = 'hold';
    const maxScaleStepForCapacityClass = Math.max(
      1,
      Math.round(Number(policy.max_scale_up_step || 1) * Number(capacityPolicy.max_scale_up_multiplier || 1))
    );
    if (bucket.depth > 0 && (capacityDeficit > 0 || queueSloBreached || coldStartSloBreached || utilizationSloBreached)) {
      recommendedScaleDelta = Math.max(capacityDeficit, 1);
      if (queueSloBreached) recommendedScaleDelta += 1;
      if (coldStartSloBreached && policy.prewarm_enabled && capacityPolicy.prewarm_enabled) recommendedScaleDelta += 1;
      if (utilizationSloBreached) recommendedScaleDelta += 1;
      recommendedScaleDelta = Math.min(maxScaleStepForCapacityClass, recommendedScaleDelta);
      recommendedAction = 'scale_up';
    } else if (bucket.depth === 0 && activeCapacity > policy.min_warm_providers + 1) {
      recommendedScaleDelta = -Math.min(
        maxScaleStepForCapacityClass,
        activeCapacity - policy.min_warm_providers
      );
      recommendedAction = 'scale_down';
    }

    const reason = [
      `depth=${bucket.depth}`,
      `capacity_class=${bucket.capacity_class}`,
      `queue_p95_s=${p95QueueWaitSeconds}`,
      `target_queue_wait_s=${targetQueueWaitSeconds}`,
      `warm_pool=${providersWarm}/${recommendedWarmPool}`,
      `active_capacity=${activeCapacity}`,
      `avg_gpu_util_pct=${avgGpuUtilPct == null ? 'n/a' : avgGpuUtilPct}`,
      `target_gpu_util_pct=${targetGpuUtilizationPct}`,
      `cold_start_p95_ms=${coldStartP95Ms == null ? 'n/a' : coldStartP95Ms}`,
      `cold_start_p50_ms=${coldStartP50Ms == null ? 'n/a' : coldStartP50Ms}`,
      queueSloBreached ? 'queue_slo_breached=1' : 'queue_slo_breached=0',
      coldStartSloBreached ? 'cold_start_slo_breached=1' : 'cold_start_slo_breached=0',
      utilizationSloBreached ? 'utilization_slo_breached=1' : 'utilization_slo_breached=0',
    ].join(' ');

    signals.push({
      pricing_class: bucket.pricing_class,
      capacity_class: bucket.capacity_class,
      compute_type: bucket.compute_type,
      vram_required_mb: bucket.vram_required_mb,
      queued_total: bucket.depth,
      active_total: activeCapacity,
      providers_online: providersOnline,
      providers_degraded: providersDegraded,
      providers_warm: providersWarm,
      avg_queue_wait_seconds: avgQueueWaitSeconds,
      p95_queue_wait_seconds: p95QueueWaitSeconds,
      avg_gpu_util_pct: avgGpuUtilPct,
      cold_start_p95_ms: coldStartP95Ms,
      cold_start_p50_ms: coldStartP50Ms,
      target_queue_wait_seconds: Number(targetQueueWaitSeconds),
      target_cold_start_ms: targetColdStartP95Ms,
      target_cold_start_p50_ms: targetColdStartP50Ms,
      target_gpu_utilization_pct: targetGpuUtilizationPct,
      queue_per_warm_provider: Number(policy.queue_per_warm_provider),
      min_warm_providers: Number(policy.min_warm_providers),
      recommended_warm_pool: recommendedWarmPool,
      warm_pool_deficit: warmDeficit,
      recommended_scale_delta: recommendedScaleDelta,
      recommended_action: recommendedAction,
      recommended_prewarm_count: (Number(policy.prewarm_enabled) && Number(capacityPolicy.prewarm_enabled)) ? warmDeficit : 0,
      queue_slo_breached: queueSloBreached,
      cold_start_slo_breached: coldStartSloBreached,
      utilization_slo_breached: utilizationSloBreached,
      reason,
      generated_at: nowIso,
    });
  }

  signals.sort((a, b) => {
    if (a.pricing_class !== b.pricing_class) {
      return PRICING_CLASS_ORDER.indexOf(a.pricing_class) - PRICING_CLASS_ORDER.indexOf(b.pricing_class);
    }
    if (a.capacity_class !== b.capacity_class) {
      return CAPACITY_CLASS_ORDER.indexOf(a.capacity_class) - CAPACITY_CLASS_ORDER.indexOf(b.capacity_class);
    }
    if (a.compute_type !== b.compute_type) return a.compute_type.localeCompare(b.compute_type);
    return Number(a.vram_required_mb) - Number(b.vram_required_mb);
  });

  const totals = signals.reduce(
    (acc, signal) => {
      acc.queued_total += Number(signal.queued_total || 0);
      acc.recommended_scale_up_total += Math.max(0, Number(signal.recommended_scale_delta || 0));
      acc.recommended_scale_down_total += Math.min(0, Number(signal.recommended_scale_delta || 0));
      if (signal.queue_slo_breached) acc.queue_slo_breaches += 1;
      if (signal.cold_start_slo_breached) acc.cold_start_slo_breaches += 1;
      if (signal.utilization_slo_breached) acc.utilization_slo_breaches += 1;
      return acc;
    },
    {
      queued_total: 0,
      recommended_scale_up_total: 0,
      recommended_scale_down_total: 0,
      queue_slo_breaches: 0,
      cold_start_slo_breaches: 0,
      utilization_slo_breaches: 0,
    }
  );

  const payload = {
    generated_at: nowIso,
    signal_count: signals.length,
    cold_start_sample_count_24h: coldStartMetrics.sample_count_24h,
    cold_start_p50_ms: coldStartMetrics.p50_ms,
    cold_start_p95_ms: coldStartMetrics.p95_ms,
    ...totals,
    signals,
  };

  if (persist && signals.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO control_plane_signals (
         pricing_class,
         capacity_class,
         compute_type,
         vram_required_mb,
         queued_total,
         active_total,
         providers_online,
         providers_degraded,
         providers_warm,
         avg_queue_wait_seconds,
         p95_queue_wait_seconds,
         avg_gpu_util_pct,
         cold_start_p95_ms,
         cold_start_p50_ms,
         recommended_warm_pool,
         recommended_scale_delta,
         recommended_action,
         reason,
         snapshot_json,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db._db.transaction((rows) => {
      for (const signal of rows) {
        stmt.run(
          signal.pricing_class,
          signal.capacity_class,
          signal.compute_type,
          signal.vram_required_mb,
          signal.queued_total,
          signal.active_total,
          signal.providers_online,
          signal.providers_degraded,
          signal.providers_warm,
          signal.avg_queue_wait_seconds,
          signal.p95_queue_wait_seconds,
          signal.avg_gpu_util_pct,
          signal.cold_start_p95_ms,
          signal.cold_start_p50_ms,
          signal.recommended_warm_pool,
          signal.recommended_scale_delta,
          signal.recommended_action,
          signal.reason,
          JSON.stringify(signal),
          nowIso
        );
      }
    });
    tx(signals);
  }

  return payload;
}

function runDemandDrivenPrewarm({
  topModelsLimit = TOP_DEMAND_MODELS_LIMIT,
  lookbackDays = 7,
  targetWarmProvidersPerModel = 2,
} = {}) {
  const demandModels = listTopDemandModels(topModelsLimit, lookbackDays);
  const normalizedTargetWarm = Math.max(1, Math.min(20, Number(targetWarmProvidersPerModel) || 2));
  const nowIso = new Date().toISOString();

  if (demandModels.length === 0) {
    return {
      generated_at: nowIso,
      top_models_considered: 0,
      requested_actions: 0,
      actions: [],
    };
  }

  const providers = db.all(
    `SELECT id,
            email,
            is_paused,
            approval_status,
            last_heartbeat,
            model_preload_status,
            model_preload_model,
            vram_gb,
            vram_mb,
            gpu_vram_mb,
            gpu_vram_mib
     FROM providers
     WHERE COALESCE(is_paused, 0) = 0`
  );

  const modelMinVramMap = new Map(
    db.all(
      `SELECT model_id, min_gpu_vram_gb
       FROM model_registry
       WHERE is_active = 1`
    ).map((row) => [String(row.model_id || '').trim(), Number(row.min_gpu_vram_gb || 0)])
  );

  const nowMs = Date.now();
  const actions = [];
  const updateStmt = db.prepare(
    `UPDATE providers
     SET model_preload_status = 'downloading',
         model_preload_model = ?,
         model_preload_requested_at = ?,
         model_preload_updated_at = ?,
         updated_at = ?
     WHERE id = ?`
  );

  const tx = db._db.transaction(() => {
    const reservedProviderIds = new Set();
    for (const demand of demandModels) {
      const model = String(demand.model || '').trim();
      if (!model) continue;

      const minVramMb = Math.max(0, Math.round(Number(modelMinVramMap.get(model) || 0) * 1024));
      const eligible = [];

      for (const provider of providers) {
        const liveStatus = getProviderLiveStatus(provider.last_heartbeat, nowMs);
        if (liveStatus !== 'online') continue;
        if (String(provider.approval_status || 'pending') !== 'approved') continue;

        const vramMb = resolveProviderVramMb(provider);
        if (minVramMb > 0 && vramMb > 0 && vramMb < minVramMb) continue;

        const preloadStatus = String(provider.model_preload_status || '').toLowerCase();
        const preloadModel = String(provider.model_preload_model || '').trim();
        const isBusyWithOtherModel = preloadStatus === 'downloading' && preloadModel && preloadModel !== model;
        if (isBusyWithOtherModel) continue;
        if (reservedProviderIds.has(Number(provider.id))) continue;

        eligible.push(provider);
      }

      const alreadyWarmish = eligible.filter((provider) => {
        const preloadModel = String(provider.model_preload_model || '').trim();
        const preloadStatus = String(provider.model_preload_status || '').toLowerCase();
        if (preloadModel !== model) return false;
        return preloadStatus === 'ready' || preloadStatus === 'warming' || preloadStatus === 'downloading';
      });

      const needed = Math.max(0, normalizedTargetWarm - alreadyWarmish.length);
      if (needed === 0) continue;

      const candidates = eligible
        .filter((provider) => {
          const preloadModel = String(provider.model_preload_model || '').trim();
          const preloadStatus = String(provider.model_preload_status || '').toLowerCase();
          if (!preloadModel) return true;
          if (preloadModel === model && preloadStatus === 'downloading') return false;
          return preloadModel !== model || preloadStatus === 'none' || preloadStatus === 'ready';
        })
        .sort((a, b) => Number(resolveProviderVramMb(b)) - Number(resolveProviderVramMb(a)));

      const selected = candidates.slice(0, needed);
      for (const provider of selected) {
        // 5 binds = 5 placeholders: model_preload_model, model_preload_requested_at,
        // model_preload_updated_at, updated_at, WHERE id. (Previously passed a 4th
        // nowIso → "Too many parameter values" crashed every prewarm cycle.)
        updateStmt.run(model, nowIso, nowIso, nowIso, provider.id);
        provider.model_preload_status = 'downloading';
        provider.model_preload_model = model;
        reservedProviderIds.add(Number(provider.id));
        actions.push({
          provider_id: Number(provider.id),
          provider_email: provider.email || null,
          model,
          action: 'preload_requested',
          reason: 'top_demand_model',
        });
      }
    }
  });
  tx();

  return {
    generated_at: nowIso,
    top_models_considered: demandModels.length,
    requested_actions: actions.length,
    target_warm_providers_per_model: normalizedTargetWarm,
    demand_models: demandModels,
    actions,
  };
}

function runControlPlaneCycle({
  persistSignals = true,
  runPrewarm = true,
  prewarmTopModels = TOP_DEMAND_MODELS_LIMIT,
  prewarmLookbackDays = 7,
  prewarmTargetWarmProvidersPerModel = 2,
} = {}) {
  const signals = calculateControlPlaneSignals({ persist: persistSignals });
  const prewarm = runPrewarm
    ? runDemandDrivenPrewarm({
        topModelsLimit: prewarmTopModels,
        lookbackDays: prewarmLookbackDays,
        targetWarmProvidersPerModel: prewarmTargetWarmProvidersPerModel,
      })
    : null;

  return {
    generated_at: new Date().toISOString(),
    signals,
    prewarm,
  };
}

module.exports = {
  PRICING_CLASS_ORDER,
  CAPACITY_CLASS_ORDER,
  normalizePricingClass,
  normalizeCapacityClass,
  listPolicies,
  updatePolicy,
  listCapacityPolicies,
  updateCapacityPolicy,
  getRecentSignals,
  calculateControlPlaneSignals,
  listTopDemandModels,
  runDemandDrivenPrewarm,
  runControlPlaneCycle,
};
