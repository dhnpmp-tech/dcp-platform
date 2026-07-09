const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { publicEndpointLimiter, templateDeployLimiter } = require('../middleware/rateLimiter');
const { getApiKeyFromReq } = require('../middleware/auth');
const pricingService = require('../services/pricingService');
const { GPU_RATE_TABLE } = require('../config/pricing');
const { stripImageOverride, validateImageOverride } = require('../middleware/imageValidation');
const { readInstantTierManifest, listInstantTierImageRefs, resolveTemplateImageRef } = require('../lib/instantTierManifest');

// Templates are stored as JSON files in /docker-templates at the repo root
const TEMPLATES_DIR = path.join(__dirname, '../../../docker-templates');
const TEMPLATE_CATALOG_CONTRACT = 'dcp.template_catalog.v1';
const TEMPLATE_CATALOG_VERSION = '2026-04-02';

// Collect all approved images across all templates (for daemon whitelist)
const APPROVED_IMAGES_EXTRA = [
  'dc1/general-worker:latest',
  'dc1/llm-worker:latest',
  'dc1/sd-worker:latest',
  'dc1/base-worker:latest',
  'pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime',
  'pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime',
  'nvcr.io/nvidia/pytorch:24.01-py3',
  'nvcr.io/nvidia/tensorflow:24.01-tf2-py3',
  'tensorflow/tensorflow:2.15.0-gpu',
];

function loadTemplates() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  try {
    return fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8')); }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
  } catch {
    return [];
  }
}

function getTemplatesDir() {
  const override = process.env.DCP_TEMPLATES_DIR;
  if (typeof override === 'string' && override.trim()) {
    return path.resolve(override.trim());
  }
  return TEMPLATES_DIR;
}

function getModelNameFromTemplate(template) {
  if (template && template.params && typeof template.params.model === 'string' && template.params.model.trim()) {
    return template.params.model.trim();
  }
  if (Array.isArray(template?.env_vars)) {
    const modelEnvVar = template.env_vars.find((item) => item && item.key === 'MODEL_ID' && typeof item.default === 'string' && item.default.trim());
    if (modelEnvVar) return modelEnvVar.default.trim();
  }
  return typeof template?.name === 'string' ? template.name.trim() : '';
}

function sanitizeWorkflowContract(template) {
  const contract = template && template.workflow_contract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return null;
  }

  const sanitized = {
    version: typeof contract.version === 'string' ? contract.version.trim() : '',
    mode: typeof contract.mode === 'string' ? contract.mode.trim() : '',
    workspace_mount: typeof contract.workspace_mount === 'string' ? contract.workspace_mount.trim() : '',
  };

  if (contract.dataset && typeof contract.dataset === 'object' && !Array.isArray(contract.dataset)) {
    sanitized.dataset = {
      required: contract.dataset.required === true,
      env_var: typeof contract.dataset.env_var === 'string' ? contract.dataset.env_var.trim() : '',
      default_path: typeof contract.dataset.default_path === 'string' ? contract.dataset.default_path.trim() : '',
      validation_endpoint: typeof contract.dataset.validation_endpoint === 'string' ? contract.dataset.validation_endpoint.trim() : '',
      raw_rows_stored: contract.dataset.raw_rows_stored === true,
    };
  }

  if (contract.adapter_artifact && typeof contract.adapter_artifact === 'object' && !Array.isArray(contract.adapter_artifact)) {
    sanitized.adapter_artifact = {
      output_dir: typeof contract.adapter_artifact.output_dir === 'string' ? contract.adapter_artifact.output_dir.trim() : '',
      required_files: Array.isArray(contract.adapter_artifact.required_files)
        ? contract.adapter_artifact.required_files.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
        : [],
      checksum_required: contract.adapter_artifact.checksum_required === true,
    };
  }

  if (contract.endpoint && typeof contract.endpoint === 'object' && !Array.isArray(contract.endpoint)) {
    sanitized.endpoint = {
      scope: typeof contract.endpoint.scope === 'string' ? contract.endpoint.scope.trim() : '',
      openai_base_url: typeof contract.endpoint.openai_base_url === 'string' ? contract.endpoint.openai_base_url.trim() : '',
      public_route_enabled: contract.endpoint.public_route_enabled === true,
      adapter_load_proof_required: contract.endpoint.adapter_load_proof_required === true,
    };
  }

  if (contract.claim_guards && typeof contract.claim_guards === 'object' && !Array.isArray(contract.claim_guards)) {
    sanitized.claim_guards = Object.fromEntries(
      Object.entries(contract.claim_guards)
        .filter(([, value]) => typeof value === 'boolean')
        .map(([key, value]) => [key, value])
    );
  }

  if (typeof contract.next_proof === 'string' && contract.next_proof.trim()) {
    sanitized.next_proof = contract.next_proof.trim();
  }

  return sanitized.version && sanitized.mode && sanitized.workspace_mount ? sanitized : null;
}

function readTemplateCatalogContract() {
  const templatesDir = getTemplatesDir();
  if (!fs.existsSync(templatesDir)) {
    return { templates: [], errors: [`Template directory not found: ${templatesDir}`] };
  }

  let files = [];
  try {
    files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.json')).sort();
  } catch (error) {
    return { templates: [], errors: [`Failed to read template directory: ${error.message}`] };
  }

  if (files.length === 0) {
    return { templates: [], errors: [`No template JSON files found in ${templatesDir}`] };
  }

  const errors = [];
  const templates = [];

  for (const file of files) {
    const fullPath = path.join(templatesDir, file);
    let parsed;

    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error) {
      errors.push(`${file}: invalid JSON (${error.message})`);
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push(`${file}: template root must be a JSON object`);
      continue;
    }

    if (typeof parsed.id !== 'string' || !parsed.id.trim()) {
      errors.push(`${file}: missing required string field "id"`);
    }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
      errors.push(`${file}: missing required string field "name"`);
    }
    if (!Number.isFinite(parsed.min_vram_gb) || Number(parsed.min_vram_gb) <= 0) {
      errors.push(`${file}: missing or invalid numeric field "min_vram_gb"`);
    }
    if (typeof parsed.job_type !== 'string' || !parsed.job_type.trim()) {
      errors.push(`${file}: missing required string field "job_type"`);
    }
    if (!parsed.params || typeof parsed.params !== 'object' || Array.isArray(parsed.params)) {
      errors.push(`${file}: missing required object field "params"`);
    }

    const modelName = getModelNameFromTemplate(parsed);
    if (!modelName) {
      errors.push(`${file}: unable to derive non-empty model name (params.model or env_vars.MODEL_ID.default)`);
    }

    if (errors.some((msg) => msg.startsWith(`${file}:`))) continue;

    const workflowContract = sanitizeWorkflowContract(parsed);
    templates.push({
      id: parsed.id.trim(),
      model_name: modelName,
      min_vram_gb: Number(parsed.min_vram_gb),
      tier_hint: {
        tier: typeof parsed.tier === 'string' && parsed.tier.trim() ? parsed.tier.trim() : 'standard',
        notes: typeof parsed.tier_notes === 'string' ? parsed.tier_notes.trim() : '',
      },
      deploy_defaults: {
        duration_minutes: Number.isFinite(parsed.default_duration_minutes) && Number(parsed.default_duration_minutes) > 0
          ? Number(parsed.default_duration_minutes)
          : 60,
        pricing_class: typeof parsed.default_pricing_class === 'string' && parsed.default_pricing_class.trim()
          ? parsed.default_pricing_class.trim()
          : 'standard',
        job_type: parsed.job_type.trim(),
        params: parsed.params,
      },
      ...(workflowContract ? { workflow_contract: workflowContract } : {}),
      sort_order: Number.isFinite(parsed.sort_order) ? Number(parsed.sort_order) : 99,
    });
  }

  const sorted = templates
    .sort((a, b) => (a.sort_order - b.sort_order) || a.id.localeCompare(b.id))
    .map(({ sort_order, ...template }) => template);

  return { templates: sorted, errors };
}

// Category -> tag mappings for the ?category= filter
const CATEGORY_TAG_MAP = {
  llm:       ['llm', 'inference', 'chat', 'instruct', 'arabic'],
  embedding: ['embedding', 'embed', 'rag'],
  image:     ['image', 'diffusion', 'sdxl', 'stable-diffusion'],
  notebook:  ['notebook', 'jupyter', 'python', 'scientific'],
  training:  ['training', 'finetune', 'lora', 'qlora'],
};

// GET /api/templates -- list all templates (optionally filter by tag or category)
router.get('/', publicEndpointLimiter, (req, res) => {
  const templates = loadTemplates();
  const { tag, category } = req.query;

  let filtered = templates;
  if (tag) {
    filtered = filtered.filter(t => Array.isArray(t.tags) && t.tags.includes(tag));
  }
  if (category) {
    const catKey = String(category).toLowerCase();
    const catTags = CATEGORY_TAG_MAP[catKey];
    if (catTags) {
      filtered = filtered.filter(t =>
        t.category === catKey ||
        (Array.isArray(t.tags) && catTags.some(ct => t.tags.includes(ct)))
      );
    }
  }

  // Strip approved_images from list response; attach floor pricing per template (DCP-762)
  const safe = filtered.map(({ approved_images: _ai, ...t }) => ({
    ...t, pricing: buildTemplatePricing(t),
  }));
  res.json({ templates: safe, count: safe.length });
});

// GET /api/templates/whitelist -- approved Docker image list for daemon validation
router.get('/whitelist', publicEndpointLimiter, (req, res) => {
  const templates = loadTemplates();
  const instantManifest = readInstantTierManifest();
  const fromTemplates = templates.flatMap(t => t.approved_images || []);
  const fromImages = templates.map(t => t.image).filter(i => i && i !== 'custom');
  const fromManifest = listInstantTierImageRefs(instantManifest);
  let approvedFromDb = [];
  try {
    approvedFromDb = db.all(
      `SELECT image_ref, resolved_digest
         FROM approved_container_images
        WHERE is_active = 1
        ORDER BY approved_at DESC`
    ).flatMap((row) => {
      const refs = [];
      if (row.image_ref) refs.push(row.image_ref);
      if (row.image_ref && row.resolved_digest) refs.push(`${String(row.image_ref).split('@')[0]}@${row.resolved_digest}`);
      return refs;
    });
  } catch (_) {
    approvedFromDb = [];
  }

  const all = [...new Set([...APPROVED_IMAGES_EXTRA, ...fromImages, ...fromTemplates, ...fromManifest, ...approvedFromDb])];
  res.json({ approved_images: all });
});

// Bundle definitions — pre-composed multi-model stacks.
// VRAM totals: arabic-rag needs BGE-M3(~8GB) + BGE-reranker(~3GB) + ALLaM-7B(~16GB) = ~27GB
// RTX 4090 (24GB) is the minimum; 32GB+ recommended for stable simultaneous loading.
const TEMPLATE_BUNDLES = [
  {
    id: 'arabic-rag',
    name: 'Arabic RAG Pipeline',
    description: 'One-click Arabic document Q&A: BGE-M3 embeddings + BGE reranker + ALLaM 7B. ' +
                 'PDPL-compliant, in-Kingdom inference for government, legal, and fintech use cases.',
    components: ['arabic-embeddings', 'arabic-reranker', 'allam-7b'],
    component_ports: { embed: 8001, rerank: 8002, generate: 8003 },
    vram_required_gb: 52,
    vram_recommended_gb: 80,
    price_per_hour_usd: 1.20,
    price_per_hour_sar: parseFloat((1.20 * (parseFloat(process.env.SAR_USD_RATE || '3.75'))).toFixed(2)),
    use_cases: ['government', 'legal', 'fintech', 'document-qa', 'enterprise-search'],
    pdpl_compliant: true,
    languages: ['ar', 'en'],
    llm_options: ['allam-7b-instruct', 'jais-13b-chat'],
    tags: ['rag', 'arabic', 'enterprise', 'pdpl'],
    deploy_endpoint: '/api/templates/arabic-rag/deploy',
  },
];

// GET /api/templates/bundles -- list pre-composed multi-model stacks
router.get('/bundles', publicEndpointLimiter, (req, res) => {
  const { SAR_USD_RATE } = require('../config/pricing');
  // Recompute SAR prices at current rate
  const bundles = TEMPLATE_BUNDLES.map(b => ({
    ...b,
    price_per_hour_sar: parseFloat((b.price_per_hour_usd * SAR_USD_RATE).toFixed(2)),
  }));
  return res.json({ bundles, count: bundles.length });
});

// GET /api/templates/catalog -- strict renter-facing template catalog contract
router.get('/catalog', publicEndpointLimiter, (req, res) => {
  const { templates, errors } = readTemplateCatalogContract();
  if (errors.length > 0) {
    return res.status(500).json({
      error: 'Template catalog contract validation failed',
      contract: TEMPLATE_CATALOG_CONTRACT,
      details: errors,
    });
  }

  return res.json({
    contract: TEMPLATE_CATALOG_CONTRACT,
    version: TEMPLATE_CATALOG_VERSION,
    templates,
    count: templates.length,
  });
});

// GET /api/templates/:id -- single template with full detail
router.get('/:id', publicEndpointLimiter, (req, res) => {
  const templates = loadTemplates();
  const template = templates.find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  // Strip approved_images from direct response too -- daemon uses /whitelist
  const { approved_images: _ai, ...safe } = template;
  res.json({ ...safe, pricing: buildTemplatePricing(safe) });
});

// Pricing sourced from config/pricing.js via pricingService (DCP-762).
function calcDeployCostHalala(jobType, durationMinutes, pricingClass, gpuModel) {
  return pricingService.calculateCostHalala(gpuModel || null, durationMinutes, pricingClass, jobType);
}

// Build pricing display block for a template using its min_vram_gb (DCP-762).
function buildTemplatePricing(template) {
  const minVram = template.min_vram_gb || 0;
  // Find best-fit GPU tier: smallest entry whose min_vram_gb >= template min
  const entry = GPU_RATE_TABLE
    .filter(e => e.models[0] !== 'default' && e.min_vram_gb >= minVram)
    .sort((a, b) => a.min_vram_gb - b.min_vram_gb)[0]
    || GPU_RATE_TABLE[GPU_RATE_TABLE.length - 1];
  const gpuKey = entry.models[0] === 'default' ? null : entry.models[0];
  const rate = pricingService.getRate(gpuKey);
  return {
    price_per_hour_usd: rate.rate_per_hour_usd,
    price_per_hour_sar: rate.rate_per_hour_sar,
    gpu_tier: rate.tier,
    gpu_display_name: rate.display_name,
    competitor_prices: rate.competitor_prices,
    savings_pct: rate.savings_pct,
  };
}

// Find best idle provider matching minVramGb. Returns provider row or null.
function findAvailableProvider(minVramGb) {
  const minVramMib = (minVramGb || 0) * 1024;
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  return db.get(
    `SELECT p.id, p.name, p.gpu_model, p.vram_gb, p.gpu_vram_mib,
            COUNT(CASE WHEN j.status IN ('assigned', 'pulling', 'running', 'pending') THEN 1 END) AS active_jobs
     FROM providers p
     LEFT JOIN jobs j ON j.provider_id = p.id
     WHERE p.status IN ('active', 'online')
       AND p.last_heartbeat >= ?
       AND COALESCE(p.gpu_vram_mib, p.vram_gb * 1024, 0) >= ?
     GROUP BY p.id, p.name, p.gpu_model, p.vram_gb, p.gpu_vram_mib
     ORDER BY active_jobs ASC, p.last_heartbeat DESC
     LIMIT 1`,
    tenMinAgo,
    minVramMib
  );
}

function getTemplateCapacitySnapshot(minVramGb) {
  const minVramMib = (minVramGb || 0) * 1024;
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = db.all(
    `SELECT p.id, p.name, p.gpu_model, p.vram_gb, p.gpu_vram_mib,
            COUNT(CASE WHEN j.status IN ('assigned', 'pulling', 'running', 'pending') THEN 1 END) AS active_jobs
     FROM providers p
     LEFT JOIN jobs j ON j.provider_id = p.id
     WHERE p.status IN ('active', 'online')
       AND p.last_heartbeat >= ?
       AND COALESCE(p.gpu_vram_mib, p.vram_gb * 1024, 0) >= ?
     GROUP BY p.id, p.name, p.gpu_model, p.vram_gb, p.gpu_vram_mib
     ORDER BY active_jobs ASC, p.last_heartbeat DESC`,
    tenMinAgo,
    minVramMib
  );

  const capableCount = Array.isArray(rows) ? rows.length : 0;
  const idleCount = Array.isArray(rows) ? rows.filter((row) => Number(row.active_jobs || 0) === 0).length : 0;
  const selectedProvider = capableCount > 0 ? rows[0] : null;

  return {
    required_vram_gb: minVramGb || 0,
    provider_heartbeat_stale_ms: 10 * 60 * 1000,
    capable_provider_count: capableCount,
    idle_provider_count: idleCount,
    // INVISIBILITY: a renter sees only that a GPU TYPE is available with N
    // idle slots — never the host id or machine name of the selected node.
    selected_provider: selectedProvider
      ? {
          gpu_model: selectedProvider.gpu_model,
          vram_gb: selectedProvider.vram_gb,
          active_jobs: Number(selectedProvider.active_jobs || 0),
        }
      : null,
  };
}

// GET /api/templates/:id/deploy/check -- non-mutating deploy capacity check
router.get('/:id/deploy/check', publicEndpointLimiter, (req, res) => {
  const templates = loadTemplates();
  const template = templates.find((entry) => entry.id === req.params.id);
  if (!template) {
    return res.status(404).json({ error: `Template '${req.params.id}' not found` });
  }

  const snapshot = getTemplateCapacitySnapshot(template.min_vram_gb || 0);
  return res.json({
    template: { id: template.id, name: template.name },
    checked_at: new Date().toISOString(),
    ...snapshot,
  });
});

// POST /api/templates/:id/deploy -- one-click deploy; requires renter auth
// Body: { duration_minutes?, pricing_class?, params? }
// Returns 201: { jobId, status, estimatedStart, gpuTier, totalCost, template, provider, message }
// Errors: 401 no auth | 403 invalid key | 402 insufficient balance | 404 not found | 503 no GPU
router.post('/:id/deploy', templateDeployLimiter, (req, res) => {
  try {
    // 1. Authenticate renter
    const key = getApiKeyFromReq(req, {
      headerName: 'x-renter-key',
      queryNames: ['renter_key', 'key'],
    });
    if (!key) {
      return res.status(401).json({
        error: 'Renter API key required (x-renter-key header or renter_key query)',
      });
    }
    const renter = db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
    if (!renter) {
      return res.status(403).json({ error: 'Invalid or inactive renter API key' });
    }

    // 2. Validate template
    const templates = loadTemplates();
    const template = templates.find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ error: `Template '${req.params.id}' not found` });
    }

    // 3. Parse and validate request body
    const rawDuration = req.body.duration_minutes;
    const duration_minutes = rawDuration !== undefined ? Number(rawDuration) : 60;
    if (!Number.isFinite(duration_minutes) || duration_minutes <= 0 || duration_minutes > 1440) {
      return res.status(400).json({ error: 'duration_minutes must be between 1 and 1440' });
    }
    const { PRICING_CLASS_MULTIPLIERS } = require('../config/pricing');
    const pricing_class = PRICING_CLASS_MULTIPLIERS[req.body.pricing_class] !== undefined
      ? req.body.pricing_class
      : 'standard';
    const rawParams = (req.body.params && typeof req.body.params === 'object') ? req.body.params : {};

    // DCP-SEC-011: Validate image_override if caller supplies one in params.
    // image_override in extraParams bypasses the template's approved image and the
    // registry whitelist — reject 422 and log the attempt before any further processing.
    if (rawParams.image_override !== undefined) {
      const result = validateImageOverride(rawParams.image_override);
      if (!result.valid) {
        console.warn(
          `[SEC-011] image_override injection attempt blocked — renter=${renter.id} image=${rawParams.image_override}`
        );
        return res.status(422).json({
          error: result.reason,
          code: 'IMAGE_OVERRIDE_NOT_ALLOWED',
        });
      }
    }

    // Strip image_override from extraParams regardless — the container image is
    // always sourced from the validated template definition, never from caller params.
    const extraParams = stripImageOverride(rawParams);

    // DCP-SEC-001 (mirror): Reject Jupyter deployments with missing or weak NOTEBOOK_TOKEN.
    // The one-click deploy path is separate from POST /api/jobs/submit — the same guard
    // must be applied here to prevent an unauthenticated Jupyter server on the GPU.
    if (template.id === 'jupyter-gpu') {
      const notebookToken = extraParams.NOTEBOOK_TOKEN;
      const WEAK_TOKENS = new Set(['dc1jupyter', '', 'jupyter', 'password', 'token']);
      if (!notebookToken || WEAK_TOKENS.has(String(notebookToken).trim())) {
        return res.status(400).json({
          error: 'NOTEBOOK_TOKEN must be a unique, non-default value for Jupyter deployments. Pass params.NOTEBOOK_TOKEN with a random UUID or strong secret.',
          code: 'WEAK_NOTEBOOK_TOKEN',
        });
      }
    }

    // 4. Calculate estimated cost using template's min_vram_gb for tier selection (DCP-762)
    // gpuModel resolved after provider lookup in step 6; recalculated then for snapshot accuracy.
    const cost_halala = calcDeployCostHalala(template.job_type, duration_minutes, pricing_class, null);

    // 5. Balance checks
    if (renter.balance_halala <= 0) {
      return res.status(402).json({
        error: 'Balance is zero. Please top up your wallet before deploying.',
        balance_halala: renter.balance_halala,
        required_halala: cost_halala,
      });
    }
    if (renter.balance_halala < cost_halala) {
      return res.status(402).json({
        error: 'Insufficient balance',
        balance_halala: renter.balance_halala,
        required_halala: cost_halala,
        shortfall_halala: cost_halala - renter.balance_halala,
        message: `Top up at least ${Math.ceil((cost_halala - renter.balance_halala) / 100)} SAR to deploy this template. POST /api/renters/topup`,
      });
    }

    // 6. Find an available GPU provider matching template VRAM requirements
    const provider = findAvailableProvider(template.min_vram_gb || 0);
    if (!provider) {
      const snapshot = getTemplateCapacitySnapshot(template.min_vram_gb || 0);
      return res.status(503).json({
        error: 'No GPU provider currently available for this template',
        required_vram_gb: template.min_vram_gb || 0,
        capable_provider_count: snapshot.capable_provider_count,
        idle_provider_count: snapshot.idle_provider_count,
        hint: 'Retry shortly or use POST /api/jobs/submit with queued fallback.',
      });
    }

    // 7. Create job record (deduct balance atomically)
    const now = new Date().toISOString();
    const job_id = 'job-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const resolvedTemplateImage = (template.image && template.image !== 'custom')
      ? resolveTemplateImageRef(template.id, template.image)
      : undefined;
    const containerSpec = JSON.stringify({
      image_override: resolvedTemplateImage,
      pricing_class,
    });
    const taskSpec = JSON.stringify({
      job_type: template.job_type,
      template_id: template.id,
      params: { ...((template.params) || {}), ...extraParams },
    });
    const gpuReqs = template.min_vram_gb ? JSON.stringify({ min_vram_gb: template.min_vram_gb }) : null;
    const timeoutSec = 1800;
    const timeoutAt = new Date(Date.now() + timeoutSec * 1000).toISOString();

    // Build rate snapshot using provider's actual gpu_model (DCP-762)
    const gpuRateSnapshot = pricingService.estimateCost(
      provider.gpu_model || null, duration_minutes * 60, pricing_class, template.job_type
    ).gpu_rate_snapshot;
    const gpuRateSnapshotJson = gpuRateSnapshot ? JSON.stringify(gpuRateSnapshot) : null;

    const JOB_COLS = new Set((db.all("PRAGMA table_info('jobs')") || []).map(r => r.name));
    const hasTemplateId = JOB_COLS.has('template_id');
    const hasGpuRateSnapshot = JOB_COLS.has('gpu_rate_snapshot');

    const insertSql = hasTemplateId
      ? `INSERT INTO jobs
           (job_id, provider_id, renter_id, job_type, status, submitted_at,
            duration_minutes, cost_halala, gpu_requirements, container_spec, task_spec,
            max_duration_seconds, timeout_at, created_at, priority, pricing_class,
            prewarm_requested, workspace_volume_name, checkpoint_enabled, template_id
            ${hasGpuRateSnapshot ? ', gpu_rate_snapshot' : ''})
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${hasGpuRateSnapshot ? ',?' : ''})`
      : `INSERT INTO jobs
           (job_id, provider_id, renter_id, job_type, status, submitted_at,
            duration_minutes, cost_halala, gpu_requirements, container_spec, task_spec,
            max_duration_seconds, timeout_at, created_at, priority, pricing_class,
            prewarm_requested, workspace_volume_name, checkpoint_enabled
            ${hasGpuRateSnapshot ? ', gpu_rate_snapshot' : ''})
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${hasGpuRateSnapshot ? ',?' : ''})`;

    const insertVals = [
      job_id, provider.id, renter.id, template.job_type, 'pending', now,
      duration_minutes, cost_halala, gpuReqs, containerSpec, taskSpec,
      timeoutSec, timeoutAt, now, 2, pricing_class,
      0, `dcp-job-${job_id}`, 0,
      ...(hasTemplateId ? [template.id] : []),
      ...(hasGpuRateSnapshot ? [gpuRateSnapshotJson] : []),
    ];

    const doInsert = () => {
      db.prepare('UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ? WHERE id = ?')
        .run(cost_halala, now, renter.id);
      const result = db.prepare(insertSql).run(insertVals);
      db.prepare('UPDATE renters SET total_jobs = total_jobs + 1, updated_at = ? WHERE id = ?')
        .run(now, renter.id);
      return result.lastInsertRowid;
    };

    if (typeof db._db?.transaction === 'function') {
      db._db.transaction(doInsert)();
    } else {
      doInsert();
    }

    // 8. Build response
    const gpuTier = provider.gpu_model
      || (Math.round((provider.gpu_vram_mib || (provider.vram_gb || 0) * 1024) / 1024) + 'GB GPU');
    const estimatedStart = new Date(Date.now() + 30 * 1000).toISOString();

    return res.status(201).json({
      jobId: job_id,
      status: 'pending',
      estimatedStart,
      gpuTier,
      totalCost: {
        halala: cost_halala,
        sar: (cost_halala / 100).toFixed(2),
      },
      template: { id: template.id, name: template.name },
      // INVISIBILITY: surface GPU TYPE only — never the provider id / machine name.
      provider: { gpu_model: provider.gpu_model || gpuTier },
      message: `Job created and assigned to a ${gpuTier}. Expected start in ~30 seconds.`,
    });
  } catch (err) {
    console.error('[templates/deploy] error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
