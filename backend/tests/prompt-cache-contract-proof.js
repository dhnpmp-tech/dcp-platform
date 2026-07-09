#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const {
  PROMPT_CACHE_ACCOUNTING_VERSION,
  attachPromptCacheUsage,
  buildPromptCacheReadiness,
  computePromptCacheAccounting,
  ensurePromptCacheAccountingSchema,
  hasPromptCacheMeasurement,
  recordPromptCacheMeasurement,
  __test,
} = require('../src/services/promptCacheAccounting');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'prompt-cache-contract-proof';
const CONTRACT = 'dcp.prompt_cache_contract_proof.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function makeDb() {
  const db = new Database(':memory:');
  ensurePromptCacheAccountingSchema(db);
  return db;
}

function sampleMessages() {
  return [
    { role: 'system', content: 'You are a Saudi Arabic support assistant.' },
    { role: 'developer', content: 'Answer with concise citations.' },
    { role: 'user', content: 'What is my bill?' },
  ];
}

function summarizeAccounting(accounting) {
  return {
    version: accounting.version,
    eligible: accounting.eligible,
    status: accounting.status,
    cache_key: accounting.cache_key,
    cache_key_sha256: accounting.cache_key_sha256,
    session_id_hash: accounting.session_id_hash,
    static_prefix_source: accounting.static_prefix_source,
    static_prefix_message_count: accounting.static_prefix_message_count,
    static_prefix_tokens_estimate: accounting.static_prefix_tokens_estimate,
    input_tokens: accounting.input_tokens,
    cached_input_tokens: accounting.cached_input_tokens,
    billable_input_tokens: accounting.billable_input_tokens,
    discount_applied: accounting.discount_applied,
    discount_bps: accounting.discount_bps,
  };
}

function assertInvariant(condition, code, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    throw error;
  }
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Prompt Cache Contract Proof');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- command: \`${report.command}\``);
  lines.push('');
  lines.push('## Invariants');
  lines.push('');
  lines.push('| invariant | passed | notes |');
  lines.push('|---|---:|---|');
  for (const item of report.invariants) {
    lines.push(`| ${item.name} | ${item.passed ? 'yes' : 'no'} | ${String(item.notes || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Proof Summary');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    readiness: report.readiness,
    key_scope: report.key_scope,
    measurement: report.measurement,
    usage: report.usage,
    non_eligible: report.non_eligible,
    claims: report.claims,
  }, null, 2));
  lines.push('```');
  lines.push('');
  if (report.failure) {
    lines.push('## Failure');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- message: ${report.failure.message}`);
    lines.push('');
  }
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe and uses an in-memory database. It proves');
  lines.push('measurement-only prompt-cache accounting, hash-only persistence, prior-hit');
  lines.push('detection, response usage fields, and no-discount billing guards. It does not');
  lines.push('prove provider KV-cache control, discounted settlement, live provider cache');
  lines.push('hits, or Tinker training compatibility.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir = OUTPUT_DIR_DEFAULT) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  report.artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  return report.artifacts;
}

function runPromptCacheContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_PROMPT_CACHE_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    accounting_version: PROMPT_CACHE_ACCOUNTING_VERSION,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:prompt-cache-contract',
    mode: 'ci_safe_in_memory',
    claims: {
      applies_prompt_cache_discount: false,
      controls_provider_kv_cache: false,
      stores_raw_prompt_or_prefix: false,
      changes_settlement_amount: false,
      proves_tinker_compatibility: false,
    },
    invariants: [],
    readiness: {},
    key_scope: {},
    measurement: {},
    usage: {},
    non_eligible: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  const db = makeDb();
  try {
    const readiness = buildPromptCacheReadiness(new Date('2026-07-09T00:00:00.000Z'));
    report.readiness = {
      object: readiness.object,
      version: readiness.version,
      current_mode: readiness.current_mode,
      hash_only: readiness.measurement.hash_only,
      stores_raw_prompt: readiness.measurement.stores_raw_prompt,
      stores_static_prefix: readiness.measurement.stores_static_prefix,
      discounts_enabled: readiness.billing.discounts_enabled,
      settlement_discount_enabled: readiness.billing.settlement_discount_enabled,
      live_acceptance: readiness.live_acceptance,
      claims: readiness.claims,
    };
    record(
      'readiness is measurement-only with discounts and provider cache control gated',
      readiness.current_mode === 'measurement_only_no_discount'
        && readiness.measurement.hash_only === true
        && readiness.measurement.stores_raw_prompt === false
        && readiness.measurement.stores_static_prefix === false
        && readiness.billing.discounts_enabled === false
        && readiness.billing.settlement_discount_enabled === false
        && readiness.claims.prompt_cache_discount === false
        && readiness.claims.provider_kv_cache_control === false
        && readiness.claims.tinker_compatible === false,
      'Readiness exposes measured prompt-cache metadata without discount, provider KV-cache, or Tinker claims.',
    );
    record(
      'readiness names the blocked live provider discount smoke gate',
      readiness.live_acceptance?.provider_discount_smoke?.status === 'blocked_external'
        && readiness.live_acceptance.provider_discount_smoke.command === 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement'
        && readiness.live_acceptance.provider_discount_smoke.live_acceptance_gate === 'prompt_cache_provider_discount_smoke'
        && readiness.live_acceptance.provider_discount_smoke.blocked_on.includes('provider cache-hit evidence')
        && readiness.live_acceptance.provider_discount_smoke.verifies.includes('settlement discount policy remains disabled'),
      'The opt-in live proof command is discoverable while discounts and provider KV-cache control remain gated.',
    );

    const miss = computePromptCacheAccounting({
      model: 'qwen/qwen3-coder',
      sessionId: 'session-a',
      promptTokens: 120,
      messages: sampleMessages(),
    });
    const reordered = computePromptCacheAccounting({
      model: 'qwen/qwen3-coder',
      sessionId: 'session-a',
      promptTokens: 120,
      messages: [
        { content: 'You are a Saudi Arabic support assistant.', role: 'system' },
        { content: 'Answer with concise citations.', role: 'developer' },
        { content: 'What is my bill?', role: 'user' },
      ],
    });
    const differentSession = computePromptCacheAccounting({
      model: 'qwen/qwen3-coder',
      sessionId: 'session-b',
      promptTokens: 120,
      messages: sampleMessages(),
    });
    const differentModel = computePromptCacheAccounting({
      model: 'mistral',
      sessionId: 'session-a',
      promptTokens: 120,
      messages: sampleMessages(),
    });
    report.key_scope = {
      miss: summarizeAccounting(miss),
      reordered_same_key: reordered.cache_key,
      different_session_key: differentSession.cache_key,
      different_model_key: differentModel.cache_key,
    };
    record(
      'cache key is stable for equivalent prefixes and scoped by session and model',
      miss.eligible === true
        && miss.status === 'miss_measured'
        && miss.cache_key === reordered.cache_key
        && miss.cache_key !== differentSession.cache_key
        && miss.cache_key !== differentModel.cache_key
        && miss.session_id_hash !== differentSession.session_id_hash,
      'Stable prefix normalization preserves equivalent messages while model/session scope prevents cross-tenant-style reuse.',
    );

    const beforeRecord = hasPromptCacheMeasurement(db, 1, miss.cache_key);
    const recorded = recordPromptCacheMeasurement(db, 1, miss, {
      model: 'qwen/qwen3-coder',
      requestId: 'req-prompt-cache-proof-1',
      providerResponseId: 'chatcmpl-prompt-cache-proof-1',
    });
    const afterRecord = hasPromptCacheMeasurement(db, 1, miss.cache_key);
    const hit = computePromptCacheAccounting({
      model: 'qwen/qwen3-coder',
      sessionId: 'session-a',
      promptTokens: 120,
      messages: sampleMessages(),
      priorCacheKeys: new Set([miss.cache_key]),
    });
    const row = db.prepare('SELECT * FROM prompt_cache_measurements WHERE cache_key = ?').get(miss.cache_key);
    const rowJson = JSON.stringify(row);
    report.measurement = {
      before_record: beforeRecord,
      recorded,
      after_record: afterRecord,
      hit: summarizeAccounting(hit),
      row: {
        renter_id: row.renter_id,
        model_id: row.model_id,
        status: row.status,
        static_prefix_source: row.static_prefix_source,
        static_prefix_message_count: row.static_prefix_message_count,
        static_prefix_tokens_estimate: row.static_prefix_tokens_estimate,
        input_tokens: row.input_tokens,
        cached_input_tokens: row.cached_input_tokens,
        billable_input_tokens: row.billable_input_tokens,
        discount_applied: row.discount_applied,
        discount_bps: row.discount_bps,
        request_id: row.request_id,
        provider_response_id: row.provider_response_id,
      },
    };
    record(
      'hash-only measurement detects future hits without storing raw prefix',
      beforeRecord === false
        && recorded.recorded === true
        && afterRecord === true
        && hit.status === 'hit_measured_no_discount'
        && hit.cached_input_tokens > 0
        && hit.billable_input_tokens === hit.input_tokens
        && row.discount_applied === 0
        && row.discount_bps === 0
        && !rowJson.includes('Saudi Arabic support assistant')
        && !rowJson.includes('Answer with concise citations'),
      'Measurement rows store cache hashes and counters only; measured hits do not reduce billable tokens.',
    );

    const usage = attachPromptCacheUsage({
      prompt_tokens: 120,
      completion_tokens: 20,
      total_tokens: 140,
      pricing: {
        currency: 'USD',
        usd_total: '0.000140',
      },
    }, hit);
    report.usage = usage;
    record(
      'usage fields expose cached input counters without changing token totals or pricing discount',
      usage.prompt_tokens === 120
        && usage.completion_tokens === 20
        && usage.total_tokens === 140
        && usage.prompt_cache.cached_input_tokens === hit.cached_input_tokens
        && usage.prompt_cache.billable_input_tokens === 120
        && usage.prompt_cache.discount_applied === false
        && usage.pricing.cached_input_tokens === hit.cached_input_tokens
        && usage.pricing.billable_input_tokens === 120
        && usage.pricing.prompt_cache_discount_applied === false
        && usage.pricing.prompt_cache_discount_bps === 0,
      'Response metadata is additive and leaves settlement/pricing discount math disabled.',
    );

    const legacy = computePromptCacheAccounting({
      model: 'legacy',
      prompt: 'Tell me something.',
      promptTokens: 20,
    });
    const legacyRecord = recordPromptCacheMeasurement(db, 1, legacy, {
      model: 'legacy',
      requestId: 'req-legacy',
    });
    const normalizedImageContent = __test.normalizeContent([
      { type: 'text', text: 'Look at this image.' },
      { type: 'image_url', image_url: { url: 'https://example.com/private.png' } },
    ]);
    report.non_eligible = {
      legacy: summarizeAccounting(legacy),
      legacy_record: legacyRecord,
      normalized_image_content: normalizedImageContent,
    };
    record(
      'non-eligible prompts are not recorded and image URLs are hash-normalized',
      legacy.eligible === false
        && legacy.cache_key === null
        && legacy.billable_input_tokens === 20
        && legacyRecord.recorded === false
        && legacyRecord.reason === 'not_eligible'
        && normalizedImageContent[1].image_url_hash
        && JSON.stringify(normalizedImageContent).includes('private.png') === false,
      'Legacy prompts need explicit static prefixes, and multimodal URL material is hashed before cache-key materialization.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'prompt_cache_contract_failed',
      message: error.message,
      details: error.details || null,
    };
    report.verdict = 'FAIL';
  } finally {
    writeReport(report, outputDir);
    db.close();
  }

  return report;
}

function main() {
  const report = runPromptCacheContractProof();
  console.log(`Prompt cache contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? `${report.failure.code}: ${report.failure.message}` : 'proof failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runPromptCacheContractProof,
  writeReport,
  summarizeAccounting,
};
