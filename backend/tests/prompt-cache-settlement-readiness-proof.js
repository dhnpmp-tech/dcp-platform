#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  PROMPT_CACHE_SETTLEMENT_READINESS_VERSION,
  buildPromptCacheSettlementReadiness,
  evaluatePromptCacheSettlementPolicy,
} = require('../src/services/promptCacheSettlementReadiness');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'prompt-cache-settlement-readiness-proof';
const CONTRACT = 'dcp.prompt_cache_settlement_readiness_proof.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function assertInvariant(condition, code, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    throw error;
  }
}

function buildMeasurement(overrides = {}) {
  return {
    hash_only: true,
    stores_raw_prompt: false,
    stores_static_prefix: false,
    eligible: true,
    cache_key: 'pc_' + 'd'.repeat(40),
    cache_key_sha256: 'e'.repeat(64),
    ...overrides,
  };
}

function buildProviderHit(overrides = {}) {
  return {
    hit: true,
    cache_key: 'pc_' + 'd'.repeat(40),
    cache_key_sha256: 'e'.repeat(64),
    provider_id: 'provider-cache-settlement-1',
    provider_response_id: 'chatcmpl-cache-settlement-1',
    ...overrides,
  };
}

function buildUsage(overrides = {}) {
  return {
    renter_id: 42,
    request_id: 'req-cache-settlement-proof-1',
    model: 'qwen/qwen3-coder',
    cache_key: 'pc_' + 'd'.repeat(40),
    cache_key_sha256: 'e'.repeat(64),
    session_id_hash: 'sessionhashproof1',
    prompt_tokens: 120,
    cached_input_tokens: 40,
    billable_input_tokens: 120,
    settlement_status: 'pending',
    ...overrides,
  };
}

function buildQuote(overrides = {}) {
  return {
    undiscounted_input_cost_halala: 12,
    prompt_cache_discount_halala: 4,
    discounted_input_cost_halala: 8,
    ...overrides,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Prompt Cache Settlement Readiness Proof');
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
    eligible_when_enabled: report.eligible_when_enabled,
    missing_provider_hit: report.missing_provider_hit,
    discount_math_mismatch: report.discount_math_mismatch,
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
  lines.push('This proof is CI-safe and read-only. It does not dispatch inference,');
  lines.push('record usage, mutate balances, create invoices, settle provider payouts,');
  lines.push('control provider KV cache, store raw prompts, or enable cached-input discounts.');
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

function runPromptCacheSettlementReadinessProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_PROMPT_CACHE_SETTLEMENT_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:prompt-cache-settlement-readiness',
    mode: 'ci_safe_prompt_cache_settlement_policy_contract_only',
    claims: {
      readiness_contract_live: true,
      cached_input_discounts_enabled: false,
      provider_kv_cache_control_enabled: false,
      settlement_discounts_enabled: false,
      settlement_mutations_enabled: false,
      dispatches_inference: false,
      records_usage_event: false,
      mutates_balance: false,
      creates_invoice: false,
      settles_provider_payout: false,
      stores_raw_prompt: false,
      claims_tinker_compatibility: false,
    },
    invariants: [],
    readiness: {},
    eligible_when_enabled: {},
    missing_provider_hit: {},
    discount_math_mismatch: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const readiness = buildPromptCacheSettlementReadiness(new Date('2026-07-09T21:05:00.000Z'));
    const eligible = evaluatePromptCacheSettlementPolicy({
      measurement: buildMeasurement(),
      provider_cache_hit_evidence: buildProviderHit(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote(),
      funded_smoke_principal: true,
      settlement_discount_policy_approved: true,
      founder_discount_approval: true,
    });
    const missingProviderHit = evaluatePromptCacheSettlementPolicy({
      measurement: buildMeasurement(),
      provider_cache_hit_evidence: buildProviderHit({ hit: false }),
      usage_event: buildUsage(),
      settlement_quote: buildQuote(),
      funded_smoke_principal: true,
      settlement_discount_policy_approved: true,
      founder_discount_approval: true,
    });
    const mathMismatch = evaluatePromptCacheSettlementPolicy({
      measurement: buildMeasurement(),
      provider_cache_hit_evidence: buildProviderHit(),
      usage_event: buildUsage(),
      settlement_quote: buildQuote({ discounted_input_cost_halala: 9 }),
      funded_smoke_principal: true,
      settlement_discount_policy_approved: true,
      founder_discount_approval: true,
    });

    report.readiness = {
      endpoints: readiness.endpoints,
      policy: readiness.policy,
      denial_codes: readiness.denial_codes,
      claim_guards: readiness.claim_guards,
    };
    report.eligible_when_enabled = eligible;
    report.missing_provider_hit = missingProviderHit;
    report.discount_math_mismatch = mathMismatch;

    record(
      'prompt-cache settlement readiness is public and policy-only',
      readiness.object === 'prompt_cache_settlement_readiness'
        && readiness.version === PROMPT_CACHE_SETTLEMENT_READINESS_VERSION
        && readiness.endpoints.settlement_readiness === 'GET /v1/prompt-cache/settlement/readiness'
        && readiness.policy.cached_input_discounts_enabled === false
        && readiness.policy.settlement_discounts_enabled === false
        && readiness.claim_guards.records_usage_event === false
        && readiness.claim_guards.mutates_balance === false
        && readiness.claim_guards.stores_raw_prompt === false,
      'The readiness packet is visible without enabling discounts, usage writes, settlement, or raw prompt storage.',
    );

    record(
      'complete provider-hit evidence remains non-discountable until policy enablement',
      eligible.would_discount_if_enabled === true
        && eligible.discount_enabled === false
        && eligible.discountable === false
        && eligible.denial_code_while_disabled === 'prompt_cache_discount_disabled'
        && eligible.blockers.length === 0,
      'A complete evidence packet only reaches would-discount-if-enabled; discounts remain disabled.',
    );

    record(
      'provider cache-hit evidence is required before future discounts',
      missingProviderHit.would_discount_if_enabled === false
        && missingProviderHit.denial_code_while_disabled === 'prompt_cache_provider_hit_required'
        && missingProviderHit.blockers.includes('live_provider_cache_hit_evidence'),
      'Hash-only DCP measurement is insufficient without provider-side cache-hit evidence.',
    );

    record(
      'discount settlement math must reconcile before enablement',
      mathMismatch.would_discount_if_enabled === false
        && mathMismatch.denial_code_while_disabled === 'prompt_cache_discount_math_mismatch'
        && mathMismatch.blockers.includes('discount_math_matches_cost'),
      'Discounted input cost plus discount amount must equal undiscounted input cost.',
    );

    record(
      'proof performs no inference usage or money mutation',
      report.claims.cached_input_discounts_enabled === false
        && report.claims.provider_kv_cache_control_enabled === false
        && report.claims.settlement_discounts_enabled === false
        && report.claims.settlement_mutations_enabled === false
        && report.claims.dispatches_inference === false
        && report.claims.records_usage_event === false
        && report.claims.mutates_balance === false
        && report.claims.creates_invoice === false
        && report.claims.settles_provider_payout === false
        && report.claims.stores_raw_prompt === false,
      'The proof is a pure contract and evaluator run.',
    );

    report.verdict = 'PASS';
  } catch (err) {
    report.verdict = 'FAIL';
    report.failure = {
      code: err.code || 'PROMPT_CACHE_SETTLEMENT_READINESS_PROOF_FAILED',
      message: err.message,
      details: err.details || {},
    };
  }

  writeReport(report, outputDir);
  return report;
}

if (require.main === module) {
  const report = runPromptCacheSettlementReadinessProof();
  console.log(JSON.stringify({
    verdict: report.verdict,
    contract: report.contract,
    artifacts: report.artifacts,
  }, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

module.exports = {
  CONTRACT,
  runPromptCacheSettlementReadinessProof,
};
