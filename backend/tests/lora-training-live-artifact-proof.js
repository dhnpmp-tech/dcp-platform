#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ensureInferenceSmokePrincipal } = require('./ensure-inference-smoke-principal');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'lora-training-live-artifact-proof';
const CONTRACT = 'dcp.lora_training_live_artifact_proof.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function redactSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  return secret.length <= 12 ? `${secret.slice(0, 4)}...` : `${secret.slice(0, 8)}...${secret.slice(-4)}`;
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || process.env.DCP_API_BASE_URL || process.env.DCP_BASE_URL || process.env.DCP_API_BASE || 'https://api.dcp.sa')
    .replace(/\/+$/, '');
}

function buildUrl(baseUrl, route) {
  const normalized = normalizeBaseUrl(baseUrl);
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  if (normalized.endsWith('/api') && cleanRoute.startsWith('/api/')) {
    return `${normalized}${cleanRoute.slice(4)}`;
  }
  if (normalized.endsWith('/api') && cleanRoute.startsWith('/v1/')) {
    return `${normalized.slice(0, -4)}${cleanRoute}`;
  }
  return `${normalized}${cleanRoute}`;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 120000, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(baseUrl, route, options = {}) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(buildUrl(baseUrl, route), {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
  }, options.timeoutMs || 120000, options.fetchImpl || fetch);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    text,
    json: parseJson(text),
    headers: {
      'content-type': response.headers.get('content-type'),
      'x-request-id': response.headers.get('x-request-id'),
    },
  };
}

function classifyFailure(code, message, details = {}) {
  const actions = {
    LIVE_PROOF_NOT_ENABLED: 'Set DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 only when you intend to run live LoRA training artifact readiness checks.',
    SMOKE_PRINCIPAL_FAILED: 'Ensure the deterministic smoke principal exists and can authenticate against LoRA readiness routes.',
    READINESS_REQUEST_FAILED: 'Check renter auth and GET /api/lora/readiness before attempting any GPU-host training proof.',
    READINESS_CONTRACT_FAILED: 'Keep LoRA training claims gated until the readiness contract is explicit and internally consistent.',
    LORA_GPU_TRAINING_NOT_ENABLED: 'Keep public training, artifact, model-card, benchmark, and Tinker claims blocked; finish the named GPU-host artifact blockers first.',
    LORA_LIVE_FLOW_NOT_IMPLEMENTED: 'Add create/training/log/artifact/model-card proof steps before allowing readiness to claim live LoRA training artifacts.',
  };
  return {
    code,
    severity: 'blocking',
    message,
    action: actions[code] || 'Inspect the proof report and backend/provider logs.',
    details,
  };
}

function summarizeReadiness(body) {
  const readiness = body && body.readiness && typeof body.readiness === 'object'
    ? body.readiness
    : body && typeof body === 'object'
      ? body
      : {};
  const datasetValidation = readiness.dataset_validation && typeof readiness.dataset_validation === 'object' ? readiness.dataset_validation : {};
  const trainingJobs = readiness.training_jobs && typeof readiness.training_jobs === 'object' ? readiness.training_jobs : {};
  const modelCards = readiness.model_cards && typeof readiness.model_cards === 'object' ? readiness.model_cards : {};
  const adapterRegistry = readiness.adapter_registry && typeof readiness.adapter_registry === 'object' ? readiness.adapter_registry : {};
  const adapterDeployments = readiness.adapter_deployments && typeof readiness.adapter_deployments === 'object' ? readiness.adapter_deployments : {};
  const claimGuards = readiness.claim_guards && typeof readiness.claim_guards === 'object' ? readiness.claim_guards : {};
  return {
    object: readiness.object || null,
    version: readiness.version || null,
    current_mode: readiness.current_mode || null,
    dataset_validation: {
      status: datasetValidation.status || null,
      available: datasetValidation.available ?? null,
      raw_dataset_persistence: datasetValidation.raw_dataset_persistence ?? null,
      raw_dataset_not_embedded: datasetValidation.raw_dataset_not_embedded ?? null,
    },
    training_jobs: {
      status: trainingJobs.status || null,
      api_available: trainingJobs.api_available ?? null,
      public_training_enabled: trainingJobs.public_training_enabled ?? null,
      worker_execution_enabled: trainingJobs.worker_execution_enabled ?? null,
      gpu_host_proof_required: trainingJobs.gpu_host_proof_required ?? null,
      next: trainingJobs.next || null,
    },
    model_cards: {
      status: modelCards.status || null,
      api_available: modelCards.api_available ?? null,
      manifest_version: modelCards.manifest_version || null,
      model_card_artifact_writer_enabled: modelCards.model_card_artifact_writer_enabled ?? null,
      next: modelCards.next || null,
    },
    adapter_registry: {
      status: adapterRegistry.status || null,
      api_available: adapterRegistry.api_available ?? null,
      serving_enabled: adapterRegistry.serving_enabled ?? null,
      route_traffic: adapterRegistry.route_traffic ?? null,
      checksum_required: adapterRegistry.checksum_required ?? null,
    },
    adapter_deployments: {
      status: adapterDeployments.status || null,
      api_available: adapterDeployments.api_available ?? null,
      serving_enabled: adapterDeployments.serving_enabled ?? null,
      route_traffic: adapterDeployments.route_traffic ?? null,
      load_proof_required: adapterDeployments.load_proof_required ?? null,
    },
    claim_guards: {
      public_training_enabled: claimGuards.public_training_enabled ?? null,
      public_serving_enabled: claimGuards.public_serving_enabled ?? null,
      route_traffic: claimGuards.route_traffic ?? null,
      quality_claims: claimGuards.quality_claims ?? null,
      tinker_compatible: claimGuards.tinker_compatible ?? null,
      discounts_enabled: claimGuards.discounts_enabled ?? null,
    },
  };
}

function findReadinessBlockers(readiness) {
  const blockers = [];
  if (readiness.object !== 'lora_readiness') blockers.push('readiness.object');
  if (readiness.version !== 'dcp.lora_readiness.v1') blockers.push('readiness.version');
  if (readiness.dataset_validation.available !== true) blockers.push('dataset_validation.available');
  if (readiness.training_jobs.api_available !== true) blockers.push('training_jobs.api_available');
  if (readiness.training_jobs.worker_execution_enabled !== true) blockers.push('training_jobs.worker_execution_enabled');
  if (readiness.training_jobs.gpu_host_proof_required !== false) blockers.push('training_jobs.gpu_host_proof_required');
  if (readiness.model_cards.model_card_artifact_writer_enabled !== true) blockers.push('model_cards.model_card_artifact_writer_enabled');
  if (readiness.adapter_registry.checksum_required !== true) blockers.push('adapter_registry.checksum_required');
  if (readiness.claim_guards.quality_claims !== false) blockers.push('claim_guards.quality_claims');
  if (readiness.claim_guards.tinker_compatible !== false) blockers.push('claim_guards.tinker_compatible');
  return blockers;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# LoRA Training Live Artifact Proof');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- base_url: \`${report.base_url}\``);
  lines.push(`- command: \`${report.command}\``);
  lines.push(`- smoke_principal: renter_id=\`${report.principal.renter_id || ''}\` key_hint=\`${report.principal.key_hint || ''}\``);
  lines.push('');
  lines.push('## Probe Summary');
  lines.push('');
  lines.push('| step | status | elapsed_ms | request_id | notes |');
  lines.push('|---|---:|---:|---|---|');
  for (const [step, probe] of Object.entries(report.probes)) {
    lines.push(`| ${step} | ${probe.status ?? ''} | ${probe.elapsed_ms ?? ''} | ${probe.request_id || ''} | ${String(probe.notes || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Readiness Summary');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.readiness, null, 2));
  lines.push('```');
  lines.push('');
  if (report.failure) {
    lines.push('## Failure Classification');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- action: ${report.failure.action}`);
    if (Array.isArray(report.failure.details?.blockers)) {
      lines.push(`- blockers: ${report.failure.details.blockers.join(', ')}`);
    }
    lines.push('');
  }
  lines.push('## Scope');
  lines.push('');
  lines.push('This runner is opt-in and refuses by default. In the current blocked mode it');
  lines.push('checks the live renter-authenticated LoRA readiness contract and stops before');
  lines.push('creating a training job, launching GPU work, writing adapter artifacts,');
  lines.push('writing model-card artifacts, registering public serving, billing training,');
  lines.push('or making quality/Tinker claims. A future PASS must include training logs,');
  lines.push('adapter artifact checksum, and model-card manifest evidence from a GPU host.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir = OUTPUT_DIR_DEFAULT, transcript = []) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const logPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.log`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  const latestLogPath = path.join(outputDir, `${PROOF_PREFIX}-latest.log`);
  report.artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    log: path.relative(REPO_ROOT, logPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
    latest_log: path.relative(REPO_ROOT, latestLogPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.writeFileSync(logPath, `${transcript.join('\n')}\n`);
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  fs.copyFileSync(logPath, latestLogPath);
  return report.artifacts;
}

async function runLoraTrainingLiveArtifactProof(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const outputDir = path.resolve(options.outputDir || process.env.DCP_LORA_TRAINING_LIVE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const fetchImpl = options.fetchImpl || fetch;
  const ensurePrincipal = options.ensurePrincipal || ensureInferenceSmokePrincipal;
  const transcript = [];
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'BLOCKED',
    base_url: baseUrl,
    command: 'DCP_LORA_TRAINING_LIVE_PROOF_ALLOW=1 npm run proof:lora-training-live-artifact',
    claims: {
      runs_gpu_training: false,
      writes_adapter_artifact: false,
      writes_model_card_artifact: false,
      enables_public_training: false,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      proves_tinker_compatibility: false,
      bills_training: false,
      creates_training_job_in_blocked_mode: false,
    },
    principal: {},
    readiness: {},
    probes: {},
    training: {
      attempted_job_creation: false,
      attempted_gpu_execution: false,
      attempted_artifact_write: false,
      attempted_model_card_write: false,
      attempted_adapter_registration: false,
    },
    failure: null,
    artifacts: {},
  };
  const log = (line) => transcript.push(`${new Date().toISOString()} ${line}`);

  try {
    if (process.env.DCP_LORA_TRAINING_LIVE_PROOF_ALLOW !== '1' && options.allowLive !== true) {
      throw Object.assign(new Error('Live LoRA training artifact proof is disabled by default'), {
        code: 'LIVE_PROOF_NOT_ENABLED',
      });
    }

    let principal;
    try {
      principal = await ensurePrincipal({ baseUrl });
    } catch (error) {
      throw Object.assign(new Error(error.message || 'Failed to create smoke principal'), {
        code: 'SMOKE_PRINCIPAL_FAILED',
        details: error.details || null,
      });
    }
    report.principal = {
      renter_id: principal.renterId,
      renter_email: principal.renterEmail,
      key_hint: redactSecret(principal.inferenceKey),
      scoped_key_id: principal.inferenceKeyId,
      scoped_key_label: principal.inferenceKeyLabel,
      scoped_key_expires_at: principal.inferenceKeyExpiresAt,
      balance_halala: principal.balanceHalala,
    };
    log(`principal renter_id=${principal.renterId} key_hint=${report.principal.key_hint}`);

    const headers = {
      authorization: `Bearer ${principal.inferenceKey}`,
      'x-renter-key': principal.inferenceKey,
    };
    const readinessRes = await requestJson(baseUrl, '/api/lora/readiness', {
      headers,
      fetchImpl,
      timeoutMs: Number.parseInt(process.env.DCP_LORA_TRAINING_LIVE_PROOF_TIMEOUT_MS || '120000', 10),
    });
    report.probes.readiness = {
      status: readinessRes.status,
      elapsed_ms: readinessRes.elapsed_ms,
      request_id: readinessRes.headers['x-request-id'] || null,
      response_hash: sha256(readinessRes.text),
      notes: readinessRes.json?.current_mode || readinessRes.text.slice(0, 180),
    };
    report.readiness = summarizeReadiness(readinessRes.json);

    if (!readinessRes.ok) {
      throw Object.assign(new Error(`LoRA readiness request failed with HTTP ${readinessRes.status}`), {
        code: 'READINESS_REQUEST_FAILED',
        details: report.probes.readiness,
      });
    }
    if (report.readiness.object !== 'lora_readiness'
      || report.readiness.version !== 'dcp.lora_readiness.v1'
      || report.readiness.dataset_validation.available !== true
      || report.readiness.training_jobs.api_available !== true) {
      throw Object.assign(new Error('LoRA readiness contract is not internally consistent enough for live artifact proof'), {
        code: 'READINESS_CONTRACT_FAILED',
        details: report.readiness,
      });
    }

    const blockers = findReadinessBlockers(report.readiness);
    if (blockers.length > 0) {
      throw Object.assign(new Error('LoRA GPU training artifact proof is not enabled by readiness'), {
        code: 'LORA_GPU_TRAINING_NOT_ENABLED',
        details: {
          blockers,
          current_mode: report.readiness.current_mode,
          next: report.readiness.training_jobs.next,
        },
      });
    }

    throw Object.assign(new Error('Readiness claims live LoRA training artifacts, but create/training/artifact/model-card proof steps are not implemented in this runner yet'), {
      code: 'LORA_LIVE_FLOW_NOT_IMPLEMENTED',
      details: {
        readiness: report.readiness,
      },
    });
  } catch (error) {
    report.failure = classifyFailure(error.code || 'LORA_TRAINING_LIVE_ARTIFACT_PROOF_FAILED', error.message, error.details || null);
    if (error.code && !['LIVE_PROOF_NOT_ENABLED', 'LORA_GPU_TRAINING_NOT_ENABLED'].includes(error.code)) {
      report.verdict = 'FAIL';
    }
    return {
      report,
      exitCode: ['LIVE_PROOF_NOT_ENABLED', 'LORA_GPU_TRAINING_NOT_ENABLED'].includes(error.code) ? 2 : 1,
      transcript,
    };
  } finally {
    writeReport(report, outputDir, transcript);
  }
}

async function main() {
  const { report, exitCode } = await runLoraTrainingLiveArtifactProof();
  process.stdout.write(`${JSON.stringify({
    verdict: report.verdict,
    failure: report.failure ? report.failure.code : null,
    readiness_mode: report.readiness.current_mode || null,
    artifacts: report.artifacts,
  }, null, 2)}\n`);
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      verdict: 'error',
      code: error.code || 'LORA_TRAINING_LIVE_ARTIFACT_PROOF_ERROR',
      message: error.message,
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  buildUrl,
  classifyFailure,
  findReadinessBlockers,
  normalizeBaseUrl,
  redactSecret,
  runLoraTrainingLiveArtifactProof,
  summarizeReadiness,
  writeReport,
};
