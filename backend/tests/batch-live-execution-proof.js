#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ensureInferenceSmokePrincipal } = require('./ensure-inference-smoke-principal');
const {
  BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  buildBatchLiveAcceptanceContract,
  buildEmptyBatchLiveAcceptanceEvidence,
  findMissingBatchLiveAcceptanceEvidence,
} = require('../src/services/batchLiveAcceptanceContract');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'batch-live-execution-proof';
const CONTRACT = 'dcp.batch_live_execution_proof.v1';

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
    LIVE_PROOF_NOT_ENABLED: 'Set DCP_BATCH_LIVE_PROOF_ALLOW=1 only when you intend to run live batch readiness and future execution checks.',
    SMOKE_PRINCIPAL_FAILED: 'Ensure the deterministic smoke principal exists, has the requested minimum balance, and can mint an inference-scoped key.',
    READINESS_REQUEST_FAILED: 'Check renter auth and GET /api/batches/readiness before attempting any batch execution smoke.',
    READINESS_CONTRACT_FAILED: 'Keep batch execution and discount claims gated until the readiness contract is explicit and internally consistent.',
    BATCH_EXECUTION_NOT_ENABLED: 'Keep batch execution, result-download, settlement, discount, and model batch capability claims blocked; finish the named readiness blockers first.',
    BATCH_LIVE_ACCEPTANCE_EVIDENCE_MISSING: 'Keep public batch execution, result downloads, discounts, settlement, and model capability claims blocked until the live report proves every required evidence step.',
    BATCH_LIVE_FLOW_NOT_IMPLEMENTED: 'Add create/poll/download/settlement proof steps before allowing readiness to claim public live batch execution.',
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
  const features = readiness.features && typeof readiness.features === 'object' ? readiness.features : {};
  const resultDownloads = features.result_downloads && typeof features.result_downloads === 'object' ? features.result_downloads : {};
  const workerExecution = features.worker_execution && typeof features.worker_execution === 'object' ? features.worker_execution : {};
  const settlement = features.settlement && typeof features.settlement === 'object' ? features.settlement : {};
  const discounts = features.discounts && typeof features.discounts === 'object' ? features.discounts : {};
  const modelCapabilityFlag = features.model_capability_flag && typeof features.model_capability_flag === 'object' ? features.model_capability_flag : {};
  const claims = readiness.claims && typeof readiness.claims === 'object' ? readiness.claims : {};
  return {
    object: readiness.object || null,
    version: readiness.version || null,
    current_mode: readiness.current_mode || null,
    request_creation_enabled: readiness.request_creation_enabled ?? null,
    public_execution_enabled: readiness.public_execution_enabled ?? null,
    supported_urls: Array.isArray(readiness.supported_urls) ? [...readiness.supported_urls] : [],
    limits: readiness.limits && typeof readiness.limits === 'object' ? readiness.limits : {},
    features: {
      result_downloads: {
        status: resultDownloads.status || null,
        configured: resultDownloads.configured ?? null,
        enabled_for_completed_results: resultDownloads.enabled_for_completed_results ?? null,
      },
      worker_execution: {
        status: workerExecution.status || null,
        env_flag_enabled: workerExecution.env_flag_enabled ?? null,
        public_enabled: workerExecution.public_enabled ?? null,
      },
      settlement: {
        status: settlement.status || null,
        env_flag_enabled: settlement.env_flag_enabled ?? null,
        public_enabled: settlement.public_enabled ?? null,
      },
      discounts: {
        status: discounts.status || null,
        enabled: discounts.enabled ?? null,
      },
      model_capability_flag: {
        status: modelCapabilityFlag.status || null,
        enabled: modelCapabilityFlag.enabled ?? null,
      },
    },
    claims: {
      batch_execution_live: claims.batch_execution_live ?? null,
      batch_discount_live: claims.batch_discount_live ?? null,
      model_batch_capability_live: claims.model_batch_capability_live ?? null,
      result_downloads_depend_on_completed_result_proof: claims.result_downloads_depend_on_completed_result_proof ?? null,
    },
    next: readiness.next || null,
  };
}

function findReadinessBlockers(readiness) {
  const blockers = [];
  if (readiness.object !== 'batch_inference_readiness') blockers.push('readiness.object');
  if (readiness.version !== 'dcp.batch_inference_readiness.v1') blockers.push('readiness.version');
  if (readiness.request_creation_enabled !== true) blockers.push('readiness.request_creation_enabled');
  if (readiness.public_execution_enabled !== true) blockers.push('readiness.public_execution_enabled');
  if (readiness.features.result_downloads.enabled_for_completed_results !== true) blockers.push('features.result_downloads.enabled_for_completed_results');
  if (readiness.features.worker_execution.public_enabled !== true) blockers.push('features.worker_execution.public_enabled');
  if (readiness.features.settlement.public_enabled !== true) blockers.push('features.settlement.public_enabled');
  if (readiness.features.discounts.enabled !== true) blockers.push('features.discounts.enabled');
  if (readiness.features.model_capability_flag.enabled !== true) blockers.push('features.model_capability_flag.enabled');
  if (readiness.claims.batch_execution_live !== true) blockers.push('claims.batch_execution_live');
  if (readiness.claims.batch_discount_live !== true) blockers.push('claims.batch_discount_live');
  if (readiness.claims.model_batch_capability_live !== true) blockers.push('claims.model_batch_capability_live');
  return blockers;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Batch Live Execution Proof');
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
  lines.push('## Acceptance Evidence');
  lines.push('');
  lines.push(`- contract: \`${report.acceptance_contract.contract}\``);
  lines.push(`- gate: \`${report.acceptance_contract.gate}\``);
  lines.push(`- pass_condition: ${report.acceptance_contract.pass_condition}`);
  lines.push('');
  lines.push('| evidence | proven | required fields |');
  lines.push('|---|---:|---|');
  for (const item of report.acceptance_contract.required_evidence) {
    const proven = report.acceptance_evidence[item.id] === true ? 'yes' : 'no';
    lines.push(`| ${item.id} | ${proven} | ${item.required_fields.join(', ')} |`);
  }
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
  lines.push('checks the live renter-authenticated batch readiness contract and stops before');
  lines.push('creating a batch, running paid provider execution, writing result objects,');
  lines.push('changing settlement, enabling discounts, or flipping model batch capability');
  lines.push('claims. A future PASS must include create/poll/download/settlement evidence.');
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

async function runBatchLiveExecutionProof(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const outputDir = path.resolve(options.outputDir || process.env.DCP_BATCH_LIVE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const fetchImpl = options.fetchImpl || fetch;
  const ensurePrincipal = options.ensurePrincipal || ensureInferenceSmokePrincipal;
  const transcript = [];
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'BLOCKED',
    base_url: baseUrl,
    command: 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution',
    claims: {
      batch_execution_live: false,
      batch_discount_enabled: false,
      model_batch_capability_enabled: false,
      changes_billing_or_settlement: false,
      creates_batch_in_blocked_mode: false,
      proves_tinker_compatibility: false,
    },
    principal: {},
    readiness: {},
    acceptance_contract: buildBatchLiveAcceptanceContract(),
    acceptance_evidence: buildEmptyBatchLiveAcceptanceEvidence(),
    probes: {},
    batch: {
      attempted_creation: false,
      attempted_execution: false,
      attempted_download: false,
      attempted_settlement: false,
    },
    failure: null,
    artifacts: {},
  };
  const log = (line) => transcript.push(`${new Date().toISOString()} ${line}`);

  try {
    if (process.env.DCP_BATCH_LIVE_PROOF_ALLOW !== '1' && options.allowLive !== true) {
      throw Object.assign(new Error('Live batch execution proof is disabled by default'), {
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
    const readinessRes = await requestJson(baseUrl, '/api/batches/readiness', {
      headers,
      fetchImpl,
      timeoutMs: Number.parseInt(process.env.DCP_BATCH_LIVE_PROOF_TIMEOUT_MS || '120000', 10),
    });
    report.probes.readiness = {
      status: readinessRes.status,
      elapsed_ms: readinessRes.elapsed_ms,
      request_id: readinessRes.headers['x-request-id'] || null,
      response_hash: sha256(readinessRes.text),
      notes: readinessRes.json?.readiness?.current_mode || readinessRes.text.slice(0, 180),
    };
    report.readiness = summarizeReadiness(readinessRes.json);

    if (!readinessRes.ok) {
      throw Object.assign(new Error(`Batch readiness request failed with HTTP ${readinessRes.status}`), {
        code: 'READINESS_REQUEST_FAILED',
        details: report.probes.readiness,
      });
    }
    if (report.readiness.object !== 'batch_inference_readiness'
      || report.readiness.version !== 'dcp.batch_inference_readiness.v1'
      || report.readiness.request_creation_enabled !== true) {
      throw Object.assign(new Error('Batch readiness contract is not internally consistent enough for live proof'), {
        code: 'READINESS_CONTRACT_FAILED',
        details: report.readiness,
      });
    }

    const blockers = findReadinessBlockers(report.readiness);
    if (blockers.length > 0) {
      throw Object.assign(new Error('Batch live execution and discounted settlement are not enabled by readiness'), {
        code: 'BATCH_EXECUTION_NOT_ENABLED',
        details: {
          blockers,
          current_mode: report.readiness.current_mode,
          next: report.readiness.next,
        },
      });
    }

    report.acceptance_evidence.readiness_live_claims_verified = true;
    const missingEvidence = findMissingBatchLiveAcceptanceEvidence(report);
    if (missingEvidence.length > 0) {
      throw Object.assign(new Error('Readiness claims live batch execution, but the live proof artifact is missing required create/poll/download/settlement evidence'), {
        code: 'BATCH_LIVE_ACCEPTANCE_EVIDENCE_MISSING',
        details: {
          missing_evidence: missingEvidence,
          acceptance_contract: report.acceptance_contract.contract,
          gate: report.acceptance_contract.gate,
          required_evidence: report.acceptance_contract.required_evidence,
        },
      });
    }

    throw Object.assign(new Error('Readiness claims live batch execution, but create/poll/download/settlement proof steps are not implemented in this runner yet'), {
      code: 'BATCH_LIVE_FLOW_NOT_IMPLEMENTED',
      details: {
        readiness: report.readiness,
      },
    });
  } catch (error) {
    report.failure = classifyFailure(error.code || 'BATCH_LIVE_PROOF_FAILED', error.message, error.details || null);
    if (error.code && !['LIVE_PROOF_NOT_ENABLED', 'BATCH_EXECUTION_NOT_ENABLED'].includes(error.code)) {
      report.verdict = 'FAIL';
    }
    return {
      report,
      exitCode: ['LIVE_PROOF_NOT_ENABLED', 'BATCH_EXECUTION_NOT_ENABLED'].includes(error.code) ? 2 : 1,
      transcript,
    };
  } finally {
    writeReport(report, outputDir, transcript);
  }
}

async function main() {
  const { report, exitCode } = await runBatchLiveExecutionProof();
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
      code: error.code || 'BATCH_LIVE_PROOF_ERROR',
      message: error.message,
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  buildUrl,
  classifyFailure,
  findMissingBatchLiveAcceptanceEvidence,
  findReadinessBlockers,
  normalizeBaseUrl,
  redactSecret,
  runBatchLiveExecutionProof,
  summarizeReadiness,
  writeReport,
};
