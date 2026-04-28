const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../db');
const { publicEndpointLimiter, modelDeployLimiter, modelCatalogLimiter } = require('../middleware/rateLimiter');
const { looksLikeProviderKey } = require('../middleware/auth');
const { GPU_RATE_TABLE, SAR_USD_RATE } = require('../config/pricing');

const PROVIDER_FRESHNESS_MS = 10 * 60 * 1000;
const DEFAULT_DEPLOY_DURATION_MINUTES = 60;
const DEPLOY_IMAGE = 'dcp/vllm-serve:latest';
const ARABIC_PORTFOLIO_FILE = process.env.DCP_ARABIC_PORTFOLIO_FILE
  || path.join(__dirname, '../../../infra/config/arabic-portfolio.json');
const TIER_RANK = {
  tier_a: 1,
  tier_b: 2,
  tier_c: 3,
};

// Competitor pricing (SAR/hr) by minimum VRAM tier. Derived from strategic brief data.
// DCP price is computed dynamically from the model's halala/min rate.
const COMPETITOR_PRICING_BY_VRAM_TIER = [
  { minVram: 80, vast_ai: 120.00, runpod: 160.00, aws: 480.00 },  // H100 class
  { minVram: 40, vast_ai: 36.00,  runpod: 48.00,  aws: 144.00 },  // A100/A40 class
  { minVram: 24, vast_ai: 10.00,  runpod: 14.00,  aws: 48.00  },  // RTX 4090 class
  { minVram: 16, vast_ai: 10.00,  runpod: 14.00,  aws: 36.00  },  // RTX 4080 class
  { minVram: 0,  vast_ai: 6.00,   runpod: 8.00,   aws: 24.00  },  // entry tier
];

// Arabic-capable model families and id fragments (case-insensitive)
const ARABIC_MODEL_PATTERNS = [
  'allam', 'jais', 'falcon-h1', 'falcon_h1', 'arabic',
  'bge-m3', 'bge_m3', 'reranker-v2-m3', 'reranker_v2_m3',
];

// Map model_id fragments to docker-template ids
const MODEL_TO_TEMPLATE_MAP = {
  'allam': 'arabic-llm',
  'jais': 'arabic-llm',
  'falcon-h1': 'arabic-llm',
  'qwen25': 'qwen25-7b',
  'qwen2.5': 'qwen25-7b',
  'llama-3-8b': 'llama3-8b',
  'llama-3.1-8b': 'llama3-8b',
  'mistral-7b': 'mistral-7b',
  'nemotron-mini': 'nemotron-nano',
  'nemotron-nano': 'nemotron-nano',
  'nemotron-70b': 'nemotron-super',
  'nemotron-super': 'nemotron-super',
  'bge-m3': 'arabic-embeddings',
  'bge-reranker': 'arabic-reranker',
  'stable-diffusion-xl': 'sdxl',
  'sdxl': 'sdxl',
};

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInt(value, { min = null, max = null } = {}) {
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

function toFixedNumber(value, digits = 2) {
  const num = toNumber(value);
  if (num === null) return null;
  const power = 10 ** digits;
  return Math.round(num * power) / power;
}

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const next = trim ? value.trim() : value;
  if (!next) return null;
  return next.slice(0, maxLen);
}

function loadArabicPortfolioIndex() {
  if (!fs.existsSync(ARABIC_PORTFOLIO_FILE)) return new Map();

  try {
    const parsed = JSON.parse(fs.readFileSync(ARABIC_PORTFOLIO_FILE, 'utf8'));
    const tiers = parsed && parsed.tiers && typeof parsed.tiers === 'object'
      ? parsed.tiers
      : {};
    const map = new Map();

    for (const [tierName, entries] of Object.entries(tiers)) {
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const repo = normalizeString(entry.repo, { maxLen: 300, trim: true });
        const id = normalizeString(entry.id, { maxLen: 200, trim: true });
        const keyRepo = repo ? repo.toLowerCase() : null;
        const keyId = id ? id.toLowerCase() : null;

        const payload = {
          tier: tierName,
          tier_rank: TIER_RANK[tierName] || 99,
          launch_priority: toInt(entry.launch_priority, { min: 1, max: 999 }) || null,
          prewarm_class: normalizeString(entry.prewarm_class, { maxLen: 20 }) || 'warm',
          container_profile: normalizeString(entry.container_profile, { maxLen: 50 }) || 'vllm',
          benchmark_profile: normalizeString(entry.benchmark_profile, { maxLen: 30 }) || null,
          target_p95_ms: toInt(entry.target_p95_ms, { min: 1, max: 600000 }) || null,
          target_cold_start_ms: toInt(entry.target_cold_start_ms, { min: 1, max: 600000 }) || null,
          min_vram_gb: toInt(entry.min_vram_gb, { min: 1, max: 1024 }) || null,
          source_id: id,
          source_repo: repo,
        };

        if (keyRepo) map.set(keyRepo, payload);
        if (keyId && !map.has(keyId)) map.set(keyId, payload);
      }
    }

    return map;
  } catch (_) {
    return new Map();
  }
}

function resolvePortfolioMeta(modelId, portfolioIndex) {
  const key = normalizeString(modelId, { maxLen: 300, trim: true });
  if (!key) return null;
  return portfolioIndex.get(key.toLowerCase()) || null;
}

function buildReadiness(model) {
  const targetP95 = toInt(model.portfolio?.target_p95_ms, { min: 1, max: 600000 });
  const targetColdStart = toInt(model.portfolio?.target_cold_start_ms, { min: 1, max: 600000 });
  const currentP95 = toNumber(model.benchmark?.latency_ms?.p95);
  const currentColdStart = toNumber(model.benchmark?.cold_start_ms) || toNumber(model.estimated_cold_start_ms);

  const p95Ready = targetP95 != null && currentP95 != null ? currentP95 <= targetP95 : null;
  const coldStartReady = targetColdStart != null && currentColdStart != null ? currentColdStart <= targetColdStart : null;

  return {
    benchmark_profile: model.portfolio?.benchmark_profile || null,
    target_p95_ms: targetP95,
    target_cold_start_ms: targetColdStart,
    current_p95_ms: currentP95,
    current_cold_start_ms: currentColdStart,
    p95_ready: p95Ready,
    cold_start_ready: coldStartReady,
    launch_ready: [p95Ready, coldStartReady].every((value) => value === true),
  };
}

function parseUseCases(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function parseComputeTypes(raw) {
  if (!raw) return new Set(['inference', 'training', 'rendering']);
  if (Array.isArray(raw)) {
    return new Set(raw.map((value) => String(value).toLowerCase()));
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((value) => String(value).toLowerCase()));
    }
  } catch (_) {
    // ignore
  }
  return new Set(String(raw).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function resolveProviderVramMb(provider) {
  const candidates = [
    provider.vram_mb,
    provider.gpu_vram_mb,
    provider.gpu_vram_mib,
    provider.vram_gb != null ? Number(provider.vram_gb) * 1024 : null,
  ];

  for (const candidate of candidates) {
    const parsed = toInt(candidate, { min: 0, max: 1024 * 1024 });
    if (parsed != null) return parsed;
  }

  return 0;
}

function estimateColdStartMs(model) {
  const benchmarkColdStart = toInt(model.benchmark?.cold_start_ms, { min: 1, max: 10 * 60 * 1000 });
  if (benchmarkColdStart != null) return benchmarkColdStart;

  const minVram = toInt(model.min_gpu_vram_gb, { min: 1, max: 1024 }) || 8;
  return 3200 + (minVram * 280);
}

function inferArabicCapability(modelId, family) {
  const haystack = `${modelId || ''} ${family || ''}`.toLowerCase();
  return ARABIC_MODEL_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function inferTask(useCases, family) {
  if (Array.isArray(useCases) && useCases.length > 0) return useCases;
  const f = (family || '').toLowerCase();
  if (f.includes('embed') || f.includes('bge')) return ['embed'];
  if (f.includes('rerank')) return ['rerank'];
  if (f.includes('diffusion') || f.includes('sdxl')) return ['image'];
  return ['chat', 'instruct'];
}

function inferTemplateId(modelId) {
  if (!modelId) return null;
  const key = modelId.toLowerCase();
  for (const [fragment, templateId] of Object.entries(MODEL_TO_TEMPLATE_MAP)) {
    if (key.includes(fragment)) return templateId;
  }
  return null;
}

function inferPrefetchStatus(portfolio, availabilityStatus) {
  if (!portfolio) return 'unavailable';
  const prewarmClass = (portfolio.prewarm_class || '').toLowerCase();
  if (prewarmClass === 'hot') return 'available';
  if (prewarmClass === 'warm') return availabilityStatus === 'available' ? 'available' : 'pending';
  return 'unavailable';
}

// Replaced hardcoded COMPETITOR_PRICING_BY_VRAM_TIER with GPU_RATE_TABLE lookup (DCP-762).
function buildCompetitorPricing(minVramGb, dcpSarPerHour) {
  // Find GPU_RATE_TABLE entry with the closest min_vram_gb >= minVramGb
  const entry = GPU_RATE_TABLE
    .filter(e => e.models[0] !== 'default' && e.min_vram_gb >= minVramGb)
    .sort((a, b) => a.min_vram_gb - b.min_vram_gb)[0]
    || GPU_RATE_TABLE[GPU_RATE_TABLE.length - 1];

  const vastUsd = entry.competitor_prices.vast_ai;
  const vastSar = toFixedNumber(vastUsd * SAR_USD_RATE, 2);
  const savingsPct = vastSar > 0
    ? toFixedNumber(((vastSar - dcpSarPerHour) / vastSar) * 100, 0)
    : 0;

  return {
    competitor_prices: {
      vast_ai: vastSar,
      runpod: toFixedNumber(entry.competitor_prices.runpod * SAR_USD_RATE, 2),
      aws: toFixedNumber(entry.competitor_prices.aws * SAR_USD_RATE, 2),
      // USD values for display
      vast_ai_usd: vastUsd,
      runpod_usd: entry.competitor_prices.runpod,
      aws_usd: entry.competitor_prices.aws,
    },
    savings_pct: Math.max(0, savingsPct),
  };
}

function getRenterKey(req) {
  const header = normalizeString(req.headers['x-renter-key'], { maxLen: 128, trim: false });
  const query = normalizeString(req.query.key, { maxLen: 128, trim: false });
  return header || query || null;
}

function requireRenter(req, res, next) {
  const key = getRenterKey(req);
  if (!key) return res.status(401).json({ error: 'Renter API key required (?key= or x-renter-key)' });

  // H1 — reject provider-prefixed keys on a renter-only path.
  if (looksLikeProviderKey(key)) {
    return res.status(401).json({ error: 'Wrong key type: provider key cannot be used on renter endpoint', code: 'wrong_key_type' });
  }

  const renter = db.get(
    'SELECT id, api_key, balance_halala, status FROM renters WHERE api_key = ? AND status = ?',
    key,
    'active'
  );

  if (!renter) return res.status(403).json({ error: 'Invalid or inactive renter API key' });

  req.renter = renter;
  req.renterKey = key;
  return next();
}

function isFreshHeartbeat(heartbeatValue) {
  const heartbeatMs = heartbeatValue ? Date.parse(heartbeatValue) : NaN;
  if (!Number.isFinite(heartbeatMs)) return false;
  return (Date.now() - heartbeatMs) <= PROVIDER_FRESHNESS_MS;
}

function getModelRows() {
  return db.all(
    `SELECT
       m.model_id,
       m.display_name,
       m.family,
       m.vram_gb,
       m.quantization,
       m.context_window,
       m.use_cases,
       m.min_gpu_vram_gb,
       m.default_price_halala_per_min,
       m.is_active,
       m.updated_at,
       b.benchmark_suite,
       b.latency_p50_ms,
       b.latency_p95_ms,
       b.latency_p99_ms,
       b.arabic_mmlu_score,
       b.arabicaqa_score,
       b.cost_per_1k_tokens_halala,
       b.vram_required_gb,
       b.cold_start_ms,
       b.measured_at,
       b.notes_en,
       b.notes_ar,
       COUNT(p.id) AS providers_online,
       SUM(CASE WHEN p.model_preload_status = 'ready' AND p.model_preload_model = m.model_id THEN 1 ELSE 0 END) AS providers_warm,
       COALESCE(
         ROUND(AVG(COALESCE(p.price_per_min_halala, m.default_price_halala_per_min)) / 100.0, 2),
         ROUND(m.default_price_halala_per_min / 100.0, 2)
       ) AS avg_price_sar_per_min,
       MIN(COALESCE(p.price_per_min_halala, m.default_price_halala_per_min)) AS min_price_halala_per_min,
       MAX(COALESCE(p.price_per_min_halala, m.default_price_halala_per_min)) AS max_price_halala_per_min
     FROM model_registry m
     LEFT JOIN model_benchmark_profiles b ON b.model_id = m.model_id
     LEFT JOIN providers p
       ON p.status = 'online'
      AND COALESCE(p.is_paused, 0) = 0
      AND p.vllm_endpoint_url IS NOT NULL
      AND p.cached_models IS NOT NULL
      AND LOWER(p.cached_models) LIKE '%' || LOWER(m.model_id) || '%'
     WHERE m.is_active = 1
     GROUP BY m.id
     ORDER BY m.display_name ASC`
  );
}

function buildFreshProviderLookup() {
  const providers = db.all(
    `SELECT id, status, is_paused, last_heartbeat, supported_compute_types,
            vram_mb, gpu_vram_mb, gpu_vram_mib, vram_gb, price_per_min_halala,
            model_preload_status, model_preload_model
     FROM providers
     WHERE status = 'online' AND COALESCE(is_paused, 0) = 0`
  );

  return providers.filter((provider) => {
    if (!isFreshHeartbeat(provider.last_heartbeat)) return false;
    const computeTypes = parseComputeTypes(provider.supported_compute_types);
    return computeTypes.has('inference');
  });
}

function buildModelPayload(row, freshProviders, portfolioIndex) {
  const useCases = parseUseCases(row.use_cases);
  const minVramGb = toInt(row.min_gpu_vram_gb, { min: 1, max: 1024 }) || 1;
  const minVramMb = minVramGb * 1024;

  const capableFreshProviders = freshProviders.filter((provider) => resolveProviderVramMb(provider) >= minVramMb);
  const warmFreshProviders = capableFreshProviders.filter((provider) => {
    const status = String(provider.model_preload_status || '').toLowerCase();
    return status === 'ready' && String(provider.model_preload_model || '') === row.model_id;
  });

  const defaultPriceHalalaPerMin = toInt(row.default_price_halala_per_min, { min: 1, max: 100000 }) || 1;
  const fallbackMinHalala = toInt(row.min_price_halala_per_min, { min: 1, max: 100000 }) || defaultPriceHalalaPerMin;
  const fallbackMaxHalala = toInt(row.max_price_halala_per_min, { min: fallbackMinHalala, max: 100000 }) || fallbackMinHalala;

  const benchmark = {
    benchmark_suite: row.benchmark_suite || 'saudi-arabic-v1',
    measured_at: row.measured_at || null,
    latency_ms: {
      p50: toFixedNumber(row.latency_p50_ms, 1),
      p95: toFixedNumber(row.latency_p95_ms, 1),
      p99: toFixedNumber(row.latency_p99_ms, 1),
    },
    arabic_quality: {
      arabic_mmlu_score: toFixedNumber(row.arabic_mmlu_score, 1),
      arabicaqa_score: toFixedNumber(row.arabicaqa_score, 1),
    },
    cost_per_1k_tokens_halala: toNumber(row.cost_per_1k_tokens_halala),
    cost_per_1k_tokens_sar: toFixedNumber((toNumber(row.cost_per_1k_tokens_halala) || 0) / 100.0, 2),
    vram_required_gb: toNumber(row.vram_required_gb) || minVramGb,
    cold_start_ms: toNumber(row.cold_start_ms),
    notes_en: row.notes_en || null,
    notes_ar: row.notes_ar || null,
  };

  const avgPriceSar = toNumber(row.avg_price_sar_per_min);
  const portfolio = resolvePortfolioMeta(row.model_id, portfolioIndex);
  const availabilityStatus = capableFreshProviders.length > 0 ? 'available' : 'no_providers';

  const defaultSarPerHour = toFixedNumber((defaultPriceHalalaPerMin * 60) / 100.0, 2);
  const { competitor_prices, savings_pct } = buildCompetitorPricing(minVramGb, defaultSarPerHour);

  const payload = {
    model_id: row.model_id,
    display_name: row.display_name,
    family: row.family,
    arabic: inferArabicCapability(row.model_id, row.family),
    arabic_capability: inferArabicCapability(row.model_id, row.family),
    task: inferTask(useCases, row.family),
    vram_gb: toNumber(row.vram_gb) || minVramGb,
    quantization: row.quantization,
    context_window: toInt(row.context_window, { min: 1, max: 10 * 1024 * 1024 }) || 4096,
    use_cases: useCases,
    min_gpu_vram_gb: minVramGb,
    benchmark,
    availability: {
      providers_online: capableFreshProviders.length,
      providers_warm: warmFreshProviders.length,
      status: availabilityStatus,
    },
    pricing: {
      default_halala_per_min: defaultPriceHalalaPerMin,
      default_sar_per_min: toFixedNumber(defaultPriceHalalaPerMin / 100.0, 2),
      default_sar_per_hour: defaultSarPerHour,
      avg_sar_per_min: Number.isFinite(avgPriceSar) ? avgPriceSar : toFixedNumber(defaultPriceHalalaPerMin / 100.0, 2),
      min_halala_per_min: fallbackMinHalala,
      max_halala_per_min: fallbackMaxHalala,
      min_sar_per_min: toFixedNumber(fallbackMinHalala / 100.0, 2),
      max_sar_per_min: toFixedNumber(fallbackMaxHalala / 100.0, 2),
      competitor_prices,
      savings_pct,
    },
    template_id: inferTemplateId(row.model_id),
    prefetch_status: inferPrefetchStatus(portfolio, availabilityStatus),
    estimated_cold_start_ms: estimateColdStartMs({
      benchmark,
      min_gpu_vram_gb: minVramGb,
    }),
    portfolio: portfolio ? {
      tier: portfolio.tier,
      tier_rank: portfolio.tier_rank,
      launch_priority: portfolio.launch_priority,
      prewarm_class: portfolio.prewarm_class,
      container_profile: portfolio.container_profile,
      benchmark_profile: portfolio.benchmark_profile,
      target_p95_ms: portfolio.target_p95_ms,
      target_cold_start_ms: portfolio.target_cold_start_ms,
      min_vram_gb: portfolio.min_vram_gb,
      source_id: portfolio.source_id,
      source_repo: portfolio.source_repo,
    } : null,
    updated_at: row.updated_at || null,
  };

  return payload;
}

// In-memory catalog cache — avoids repeated DB reads and FS loads per request.
// TTL is 5 min so provider availability stays reasonably fresh.
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let _catalogCache = null;
let _catalogCacheAt = 0;

function invalidateCatalogCache() {
  _catalogCache = null;
  _catalogCacheAt = 0;
}

function getCatalogModels({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && _catalogCache && (now - _catalogCacheAt) < CATALOG_CACHE_TTL_MS) {
    return _catalogCache;
  }
  const rows = getModelRows();
  const freshProviders = buildFreshProviderLookup();
  const portfolioIndex = loadArabicPortfolioIndex();
  _catalogCache = rows.map((row) => buildModelPayload(row, freshProviders, portfolioIndex));
  _catalogCacheAt = now;
  return _catalogCache;
}

function parseCompareIds(req) {
  const raw = req.query.ids;
  if (!raw) return [];
  const joined = Array.isArray(raw) ? raw.join(',') : String(raw);
  return joined
    .split(',')
    .map((id) => normalizeString(id, { maxLen: 200 }))
    .filter(Boolean)
    .slice(0, 8);
}

function getModelById(modelId) {
  const models = getCatalogModels();
  return models.find((model) => model.model_id === modelId) || null;
}

function toLegacyListItem(model) {
  return {
    model_id: model.model_id,
    display_name: model.display_name,
    family: model.family,
    vram_gb: model.vram_gb,
    quantization: model.quantization,
    context_window: model.context_window,
    use_cases: model.use_cases,
    min_gpu_vram_gb: model.min_gpu_vram_gb,
    arabic_capability: model.arabic_capability || false,
    providers_online: model.availability.providers_online,
    avg_price_sar_per_min: model.pricing.avg_sar_per_min,
    status: model.availability.status,
    tier: model.portfolio?.tier || null,
    prewarm_class: model.portfolio?.prewarm_class || null,
    template_id: model.template_id || null,
    competitor_prices: model.pricing.competitor_prices || null,
    savings_pct: model.pricing.savings_pct || null,
    pricing_per_hour: model.pricing.default_sar_per_hour,
  };
}

function toBenchmarksEntry(model) {
  const readiness = buildReadiness(model);
  return {
    model_id: model.model_id,
    display_name: model.display_name,
    family: model.family,
    vram_required_gb: toNumber(model.benchmark.vram_required_gb),
    latency_ms: {
      p50: toFixedNumber(model.benchmark.latency_ms.p50, 1),
      p95: toFixedNumber(model.benchmark.latency_ms.p95, 1),
      p99: toFixedNumber(model.benchmark.latency_ms.p99, 1),
    },
    arabic_quality: {
      arabic_mmlu_score: toFixedNumber(model.benchmark.arabic_quality.arabic_mmlu_score, 1),
      arabicaqa_score: toFixedNumber(model.benchmark.arabic_quality.arabicaqa_score, 1),
    },
    cost_per_1k_tokens_halala: toNumber(model.benchmark.cost_per_1k_tokens_halala),
    cost_per_1k_tokens_sar: toFixedNumber(model.benchmark.cost_per_1k_tokens_sar, 2),
    cold_start_ms: toNumber(model.benchmark.cold_start_ms) || model.estimated_cold_start_ms,
    measured_at: model.benchmark.measured_at || null,
    tier: model.portfolio?.tier || null,
    launch_priority: model.portfolio?.launch_priority || null,
    prewarm_class: model.portfolio?.prewarm_class || null,
    benchmark_profile: readiness.benchmark_profile,
    target_p95_ms: readiness.target_p95_ms,
    target_cold_start_ms: readiness.target_cold_start_ms,
    launch_ready: readiness.launch_ready,
  };
}

function toCardEntry(model) {
  const p95 = toFixedNumber(model.benchmark.latency_ms.p95, 0);
  const mmlu = toFixedNumber(model.benchmark.arabic_quality.arabic_mmlu_score, 1);
  const costSar = toFixedNumber(model.benchmark.cost_per_1k_tokens_sar, 2);
  const coldStart = toFixedNumber(model.benchmark.cold_start_ms || model.estimated_cold_start_ms, 0);

  return {
    model_id: model.model_id,
    display_name: model.display_name,
    family: model.family,
    context_window: model.context_window,
    quantization: model.quantization,
    benchmark_suite: model.benchmark.benchmark_suite,
    measured_at: model.benchmark.measured_at || null,
    tier: model.portfolio?.tier || null,
    launch_priority: model.portfolio?.launch_priority || null,
    prewarm_class: model.portfolio?.prewarm_class || null,
    container_profile: model.portfolio?.container_profile || null,
    metrics: {
      vram_required_gb: toNumber(model.benchmark.vram_required_gb) || model.min_gpu_vram_gb,
      latency_ms: {
        p50: toFixedNumber(model.benchmark.latency_ms.p50, 1),
        p95: toFixedNumber(model.benchmark.latency_ms.p95, 1),
        p99: toFixedNumber(model.benchmark.latency_ms.p99, 1),
      },
      arabic_quality: {
        arabic_mmlu_score: toFixedNumber(model.benchmark.arabic_quality.arabic_mmlu_score, 1),
        arabicaqa_score: toFixedNumber(model.benchmark.arabic_quality.arabicaqa_score, 1),
      },
      cost_per_1k_tokens_halala: toNumber(model.benchmark.cost_per_1k_tokens_halala),
      cost_per_1k_tokens_sar: costSar,
      cold_start_ms: toNumber(model.benchmark.cold_start_ms) || model.estimated_cold_start_ms,
    },
    summary: {
      en: model.benchmark.notes_en
        || `P95 latency ${p95}ms, Arabic MMLU ${mmlu}%, cost ${costSar} SAR per 1K tokens, cold-start ${coldStart}ms.`,
      ar: model.benchmark.notes_ar
        || `زمن الاستجابة P95 حوالي ${p95} مللي ثانية، ودقة Arabic MMLU ${mmlu}%، والتكلفة ${costSar} ريال لكل 1000 رمز، وزمن التشغيل الأولي ${coldStart} مللي ثانية.`,
    },
    readiness: buildReadiness(model),
  };
}

function buildDeployEstimate(model, options = {}) {
  const requestedDuration = toInt(options.duration_minutes, { min: 1, max: 1440 }) || DEFAULT_DEPLOY_DURATION_MINUTES;
  const avgHalalaPerMin = Math.round((toNumber(model.pricing.avg_sar_per_min) || model.pricing.default_sar_per_min) * 100);
  const defaultHalalaPerMin = toInt(model.pricing.default_halala_per_min, { min: 1, max: 100000 }) || 1;
  const billableRate = Math.max(1, avgHalalaPerMin || defaultHalalaPerMin);

  const estimatedCostHalala = billableRate * requestedDuration;
  const estimatedCostSar = toFixedNumber(estimatedCostHalala / 100.0, 2);

  return {
    duration_minutes: requestedDuration,
    rate_halala_per_min: billableRate,
    estimated_cost_halala: estimatedCostHalala,
    estimated_cost_sar: estimatedCostSar,
    estimated_cold_start_ms: model.estimated_cold_start_ms,
    providers_online: model.availability.providers_online,
    providers_warm: model.availability.providers_warm,
  };
}

function buildDeploySubmitPayload(model, options = {}) {
  const durationMinutes = toInt(options.duration_minutes, { min: 1, max: 1440 }) || DEFAULT_DEPLOY_DURATION_MINUTES;
  const requestedModelLen = toInt(options.max_model_len, { min: 512, max: 32768 });
  const maxModelLen = requestedModelLen || Math.min(Math.max(model.context_window, 512), 32768);
  const dtype = ['float16', 'bfloat16', 'float32'].includes(String(options.dtype || '').toLowerCase())
    ? String(options.dtype).toLowerCase()
    : 'float16';
  const providerId = toInt(options.provider_id, { min: 1 });
  const prewarmRequested = options.prewarm_requested === true;

  const body = {
    job_type: 'vllm_serve',
    duration_minutes: durationMinutes,
    model: model.model_id,
    params: {
      model: model.model_id,
      max_model_len: maxModelLen,
      dtype,
    },
    container_spec: {
      image_type: 'vllm-serve',
      image: DEPLOY_IMAGE,
      model: model.model_id,
      prewarm_requested: prewarmRequested,
    },
    prewarm_requested: prewarmRequested,
  };

  if (providerId != null) {
    body.provider_id = providerId;
  }

  return body;
}

// applyQueryFilters — shared filter logic for list and catalog endpoints.
// Supported query params:
//   arabic_capable=true / arabic=true  — only models with Arabic capability
//   min_vram_gb=N / vram=N             — only models requiring <= N GB VRAM (renter GPU fits model)
//   category=llm|embedding|image|training  — filter by task type
//   tier=tier_a|tier_b|tier_c|instant  — filter by portfolio tier (instant maps to prewarm_class=hot)
//   include_unavailable=true           — include models with 0 online providers (default: hide)
function applyQueryFilters(models, query) {
  let result = models;

  // Default: hide models with no online providers so renters don't see
  // catalog entries they cannot actually rent. Set include_unavailable=true
  // (or available_only=false) to see the full registry.
  const includeUnavailable = String(query.include_unavailable || '').toLowerCase();
  const availableOnly = String(query.available_only || '').toLowerCase();
  const showAll = includeUnavailable === 'true' || includeUnavailable === '1'
    || availableOnly === 'false' || availableOnly === '0';
  if (!showAll) {
    result = result.filter((m) => Number(m.availability?.providers_online || 0) > 0);
  }

  // arabic=true is a short alias for arabic_capable=true
  const arabicFlag = String(query.arabic_capable || query.arabic || '').toLowerCase();
  if (arabicFlag === 'true' || arabicFlag === '1') {
    result = result.filter((m) => m.arabic || m.arabic_capability);
  }

  // vram=N / vram_min=N are short aliases for min_vram_gb=N
  const minVram = toInt(query.min_vram_gb ?? query.vram_min ?? query.vram, { min: 1, max: 1024 });
  if (minVram != null) {
    result = result.filter((m) => {
      const vramNeeded = toInt(m.min_gpu_vram_gb, { min: 1, max: 1024 }) || 1;
      return vramNeeded <= minVram;
    });
  }

  const category = normalizeString(query.category, { maxLen: 32 });
  if (category) {
    const cat = category.toLowerCase();
    const CATEGORY_TASK_MAP = {
      llm: ['chat', 'instruct'],
      embedding: ['embed'],
      image: ['image'],
      training: ['train'],
    };
    const allowedTasks = CATEGORY_TASK_MAP[cat];
    if (allowedTasks) {
      result = result.filter((m) => {
        const tasks = Array.isArray(m.task) ? m.task : [];
        return tasks.some((t) => allowedTasks.includes(String(t).toLowerCase()));
      });
    }
  }

  // tier=instant maps to prewarm_class=hot; tier_a/tier_b/tier_c match portfolio tier directly
  const tierFilter = normalizeString(query.tier, { maxLen: 32 });
  if (tierFilter) {
    const t = tierFilter.toLowerCase();
    if (t === 'instant') {
      result = result.filter((m) => m.portfolio?.prewarm_class === 'hot');
    } else if (t === 'tier_a' || t === 'tier_b' || t === 'tier_c') {
      result = result.filter((m) => m.portfolio?.tier === t);
    }
  }

  return result;
}

// GET /api/models
// Public model registry with live provider availability and averaged pricing.
// Query params: arabic_capable/arabic, min_vram_gb/vram, category, tier
router.get('/', modelCatalogLimiter, (req, res) => {
  try {
    const all = getCatalogModels();
    const filtered = applyQueryFilters(all, req.query || {});
    return res.json(filtered.map(toLegacyListItem));
  } catch (error) {
    console.error('Model registry error:', error);
    return res.status(500).json({ error: 'Failed to fetch model registry' });
  }
});

// GET /api/models/benchmarks
// Data feed for model benchmarking: latency, Arabic quality, cost/1K, VRAM, cold start.
router.get('/benchmarks', publicEndpointLimiter, (req, res) => {
  try {
    const models = getCatalogModels().map(toBenchmarksEntry);
    return res.json({
      benchmark_suite: 'saudi-arabic-v1',
      generated_at: new Date().toISOString(),
      models,
    });
  } catch (error) {
    console.error('Model benchmark feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch model benchmark feed' });
  }
});

// GET /api/models/cards
// Bilingual model cards enriched with benchmark metrics for renter UX.
router.get('/cards', publicEndpointLimiter, (req, res) => {
  try {
    const cards = getCatalogModels().map(toCardEntry);
    return res.json({
      generated_at: new Date().toISOString(),
      language: 'bilingual',
      cards,
    });
  } catch (error) {
    console.error('Model card feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch model cards' });
  }
});

// GET /api/models/catalog
// Managed model catalog payload used by comparison/deploy UX.
// Query params: arabic_capable, min_vram_gb, category
router.get('/catalog', publicEndpointLimiter, (req, res) => {
  try {
    const all = getCatalogModels();
    const models = applyQueryFilters(all, req.query || {});
    return res.json({
      generated_at: new Date().toISOString(),
      total_models: models.length,
      models,
    });
  } catch (error) {
    console.error('Model catalog feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch model catalog feed' });
  }
});

// GET /api/models/portfolio-readiness
// Tier-grouped launch readiness feed focused on prewarm-critical Tier A.
router.get('/portfolio-readiness', publicEndpointLimiter, (req, res) => {
  try {
    const models = getCatalogModels()
      .filter((model) => model.portfolio && ['tier_a', 'tier_b'].includes(model.portfolio.tier))
      .sort((a, b) => {
        const tierA = toInt(a.portfolio?.tier_rank, { min: 1, max: 99 }) || 99;
        const tierB = toInt(b.portfolio?.tier_rank, { min: 1, max: 99 }) || 99;
        if (tierA !== tierB) return tierA - tierB;

        const priA = toInt(a.portfolio?.launch_priority, { min: 1, max: 999 }) || 999;
        const priB = toInt(b.portfolio?.launch_priority, { min: 1, max: 999 }) || 999;
        return priA - priB;
      });

    const tierA = models
      .filter((model) => model.portfolio?.tier === 'tier_a')
      .map((model) => ({
        model_id: model.model_id,
        display_name: model.display_name,
        portfolio: model.portfolio,
        benchmark: toBenchmarksEntry(model),
        readiness: buildReadiness(model),
      }));

    const tierB = models
      .filter((model) => model.portfolio?.tier === 'tier_b')
      .map((model) => ({
        model_id: model.model_id,
        display_name: model.display_name,
        portfolio: model.portfolio,
        benchmark: toBenchmarksEntry(model),
        readiness: buildReadiness(model),
      }));

    const readyCount = [...tierA, ...tierB].filter((entry) => entry.readiness.launch_ready).length;
    const prewarmCriticalReady = tierA.filter((entry) => entry.readiness.launch_ready).length;

    return res.json({
      generated_at: new Date().toISOString(),
      benchmark_suite: 'saudi-arabic-v1',
      totals: {
        tier_a: tierA.length,
        tier_b: tierB.length,
        ready: readyCount,
        prewarm_critical_ready: prewarmCriticalReady,
      },
      tiers: {
        tier_a: tierA,
        tier_b: tierB,
      },
    });
  } catch (error) {
    console.error('Model portfolio readiness feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch model portfolio readiness feed' });
  }
});

// GET /api/models/compare?ids=id1,id2,id3
// Fetches comparable model payloads in one call for side-by-side UI.
router.get('/compare', publicEndpointLimiter, (req, res) => {
  try {
    const ids = parseCompareIds(req);
    if (ids.length < 2) {
      return res.status(400).json({ error: 'Provide at least two model ids via ids=comma,separated,list' });
    }

    const models = getCatalogModels();
    const selected = ids
      .map((id) => models.find((model) => model.model_id === id))
      .filter(Boolean);

    if (selected.length === 0) {
      return res.status(404).json({ error: 'No matching models found for compare request' });
    }

    const ranking = [...selected].sort((a, b) => {
      const qualityA = toNumber(a.benchmark.arabic_quality.arabic_mmlu_score) || 0;
      const qualityB = toNumber(b.benchmark.arabic_quality.arabic_mmlu_score) || 0;
      if (qualityA !== qualityB) return qualityB - qualityA;
      return (toNumber(a.pricing.avg_sar_per_min) || 0) - (toNumber(b.pricing.avg_sar_per_min) || 0);
    });

    return res.json({
      generated_at: new Date().toISOString(),
      requested_ids: ids,
      models: selected,
      ranking: ranking.map((model, index) => ({
        rank: index + 1,
        model_id: model.model_id,
        display_name: model.display_name,
        arabic_mmlu_score: toFixedNumber(model.benchmark.arabic_quality.arabic_mmlu_score, 1),
        avg_price_sar_per_min: toFixedNumber(model.pricing.avg_sar_per_min, 2),
        estimated_cold_start_ms: model.estimated_cold_start_ms,
      })),
    });
  } catch (error) {
    console.error('Model compare error:', error);
    return res.status(500).json({ error: 'Failed to compare models' });
  }
});

// GET /api/models/bundles/arabic-rag
// Returns the complete Arabic RAG bundle config: BGE-M3 + reranker + ALLaM/JAIS.
// Used by the one-click Arabic RAG template to resolve all required model components.
router.get('/bundles/arabic-rag', publicEndpointLimiter, (req, res) => {
  try {
    const models = getCatalogModels();
    const findModel = (...candidates) => {
      for (const id of candidates) {
        const match = models.find((m) => m.model_id === id);
        if (match) return match;
      }
      return null;
    };

    const embedder = findModel('bge-m3-embedding', 'bge-m3', 'BAAI/bge-m3');
    const reranker = findModel('reranker-v2-m3', 'bge-reranker-v2-m3', 'BAAI/bge-reranker-v2-m3');
    const llm = findModel('allam-7b-instruct', 'jais-13b-chat', 'qwen25-7b-instruct', 'llama-3-8b-instruct');

    const bundle = {
      bundle_id: 'arabic-rag',
      display_name: 'Arabic RAG-as-a-Service',
      description: 'Complete Arabic retrieval-augmented generation pipeline. PDPL-compliant, in-Kingdom processing.',
      template_id: 'arabic-rag-complete',
      components: {
        embedder: embedder ? {
          model_id: embedder.model_id,
          display_name: embedder.display_name,
          role: 'embedder',
          hf_repo: 'BAAI/bge-m3',
          task: ['embed'],
          min_vram_gb: embedder.min_gpu_vram_gb,
          status: embedder.availability.status,
          prefetch_status: embedder.prefetch_status,
        } : { model_id: 'bge-m3-embedding', role: 'embedder', hf_repo: 'BAAI/bge-m3', status: 'no_providers' },
        reranker: reranker ? {
          model_id: reranker.model_id,
          display_name: reranker.display_name,
          role: 'reranker',
          hf_repo: 'BAAI/bge-reranker-v2-m3',
          task: ['rerank'],
          min_vram_gb: reranker.min_gpu_vram_gb,
          status: reranker.availability.status,
          prefetch_status: reranker.prefetch_status,
        } : { model_id: 'reranker-v2-m3', role: 'reranker', hf_repo: 'BAAI/bge-reranker-v2-m3', status: 'no_providers' },
        llm: llm ? {
          model_id: llm.model_id,
          display_name: llm.display_name,
          role: 'generator',
          task: llm.task,
          arabic: llm.arabic,
          min_vram_gb: llm.min_gpu_vram_gb,
          status: llm.availability.status,
          prefetch_status: llm.prefetch_status,
          pricing: llm.pricing,
        } : { model_id: 'allam-7b-instruct', role: 'generator', status: 'no_providers' },
      },
      use_cases: ['arabic-rag', 'document-processing', 'enterprise-search', 'pdpl-compliant'],
      total_min_vram_gb: (embedder?.min_gpu_vram_gb || 8) + (reranker?.min_gpu_vram_gb || 8) + (llm?.min_gpu_vram_gb || 16),
      ready: [embedder, reranker, llm].every((m) => m?.availability?.status === 'available'),
    };

    return res.json({ generated_at: new Date().toISOString(), bundle });
  } catch (error) {
    console.error('Arabic RAG bundle error:', error);
    return res.status(500).json({ error: 'Failed to fetch Arabic RAG bundle' });
  }
});

// GET /api/models/:model_id/deploy/estimate
// Returns deployment estimate payload for the selected model.
router.get(/^\/([a-zA-Z0-9._/-]+)\/deploy\/estimate$/, publicEndpointLimiter, (req, res) => {
  try {
    const modelId = normalizeString(req.params[0], { maxLen: 200, trim: false });
    const model = modelId ? getModelById(modelId) : null;
    if (!model) return res.status(404).json({ error: 'Model not found or inactive' });

    const estimate = buildDeployEstimate(model, req.query || {});
    return res.json({
      model_id: model.model_id,
      display_name: model.display_name,
      availability: model.availability,
      estimate,
    });
  } catch (error) {
    console.error('Deploy estimate error:', error);
    return res.status(500).json({ error: 'Failed to build deploy estimate' });
  }
});

// POST /api/models/:model_id/deploy
// Authenticated deploy handoff endpoint for managed catalog UX.
router.post(/^\/([a-zA-Z0-9._/-]+)\/deploy$/, modelDeployLimiter, requireRenter, (req, res) => {
  try {
    const modelId = normalizeString(req.params[0], { maxLen: 200, trim: false });
    const model = modelId ? getModelById(modelId) : null;
    if (!model) return res.status(404).json({ error: 'Model not found or inactive' });

    const deployBody = req.body && typeof req.body === 'object' ? req.body : {};
    const submitBody = buildDeploySubmitPayload(model, deployBody);
    const estimate = buildDeployEstimate(model, deployBody);

    const providerId = toInt(submitBody.provider_id, { min: 1 });
    if (providerId != null) {
      const provider = db.get(
        `SELECT id, status, is_paused, last_heartbeat, vram_mb, gpu_vram_mb, gpu_vram_mib, vram_gb
         FROM providers
         WHERE id = ?`,
        providerId
      );
      if (!provider) return res.status(404).json({ error: 'Requested provider_id does not exist' });
      if (provider.status !== 'online' || Number(provider.is_paused || 0) === 1 || !isFreshHeartbeat(provider.last_heartbeat)) {
        return res.status(409).json({ error: 'Requested provider is not currently available for deploy' });
      }
      const providerVramMb = resolveProviderVramMb(provider);
      if (providerVramMb < (model.min_gpu_vram_gb * 1024)) {
        return res.status(409).json({ error: 'Requested provider does not meet model VRAM requirement' });
      }
    }

    return res.json({
      status: 'ready',
      model: {
        model_id: model.model_id,
        display_name: model.display_name,
        min_gpu_vram_gb: model.min_gpu_vram_gb,
      },
      renter_id: req.renter.id,
      deploy_mode: 'vllm_serve',
      availability: model.availability,
      estimate,
      submit: {
        endpoint: '/api/jobs/submit',
        method: 'POST',
        auth: 'x-renter-key',
        body: submitBody,
      },
      notes: [
        'Submit payload to /api/jobs/submit to create the actual serving job.',
        'Use /api/jobs/queue/status and /api/jobs/:id logs endpoints to track launch progress.',
      ],
    });
  } catch (error) {
    console.error('Model deploy handoff error:', error);
    return res.status(500).json({ error: 'Failed to prepare model deploy handoff' });
  }
});

// GET /api/models/:model_id
// Single-model detail payload for managed catalog consumers.
router.get(/^\/([a-zA-Z0-9._/-]+)$/, publicEndpointLimiter, (req, res) => {
  try {
    const modelId = normalizeString(req.params[0], { maxLen: 200, trim: false });
    const model = modelId ? getModelById(modelId) : null;
    if (!model) return res.status(404).json({ error: 'Model not found or inactive' });

    return res.json(model);
  } catch (error) {
    console.error('Model detail error:', error);
    return res.status(500).json({ error: 'Failed to fetch model details' });
  }
});

router.invalidateCatalogCache = invalidateCatalogCache;
module.exports = router;
