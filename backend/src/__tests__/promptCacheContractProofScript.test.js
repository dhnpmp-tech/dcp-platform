'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runPromptCacheContractProof,
} = require('../../tests/prompt-cache-contract-proof');

describe('prompt cache contract proof script', () => {
  test('writes a CI-safe proof report for measurement-only prompt-cache gates', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-cache-proof-'));
    const report = runPromptCacheContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      applies_prompt_cache_discount: false,
      controls_provider_kv_cache: false,
      stores_raw_prompt_or_prefix: false,
      changes_settlement_amount: false,
      proves_tinker_compatibility: false,
    });
    expect(report.readiness).toMatchObject({
      current_mode: 'measurement_only_no_discount',
      hash_only: true,
      stores_raw_prompt: false,
      stores_static_prefix: false,
      discounts_enabled: false,
      settlement_discount_enabled: false,
      live_acceptance: {
        provider_discount_smoke: {
          status: 'blocked_external',
          command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
          live_acceptance_gate: 'prompt_cache_provider_discount_smoke',
        },
      },
      claims: {
        prompt_cache_discount: false,
        provider_kv_cache_control: false,
        tinker_compatible: false,
      },
    });
    expect(report.key_scope).toMatchObject({
      miss: {
        eligible: true,
        status: 'miss_measured',
        discount_applied: false,
        discount_bps: 0,
      },
    });
    expect(report.key_scope.miss.cache_key).toBe(report.key_scope.reordered_same_key);
    expect(report.key_scope.miss.cache_key).not.toBe(report.key_scope.different_session_key);
    expect(report.key_scope.miss.cache_key).not.toBe(report.key_scope.different_model_key);
    expect(report.measurement).toMatchObject({
      before_record: false,
      after_record: true,
      hit: {
        status: 'hit_measured_no_discount',
        billable_input_tokens: 120,
        discount_applied: false,
        discount_bps: 0,
      },
      row: {
        renter_id: 1,
        model_id: 'qwen/qwen3-coder',
        discount_applied: 0,
        discount_bps: 0,
      },
    });
    expect(report.measurement.hit.cached_input_tokens).toBeGreaterThan(0);
    expect(JSON.stringify(report.measurement.row)).not.toContain('Saudi Arabic support assistant');
    expect(report.usage).toMatchObject({
      prompt_tokens: 120,
      completion_tokens: 20,
      total_tokens: 140,
      prompt_cache: {
        billable_input_tokens: 120,
        discount_applied: false,
        discount_bps: 0,
      },
      pricing: {
        billable_input_tokens: 120,
        prompt_cache_discount_applied: false,
        prompt_cache_discount_bps: 0,
      },
    });
    expect(report.non_eligible).toMatchObject({
      legacy: {
        eligible: false,
        cache_key: null,
        billable_input_tokens: 20,
      },
      legacy_record: {
        recorded: false,
        reason: 'not_eligible',
      },
    });
    expect(JSON.stringify(report.non_eligible.normalized_image_content)).not.toContain('private.png');
    expect(report.invariants.map((item) => item.name)).toEqual([
      'readiness is measurement-only with discounts and provider cache control gated',
      'readiness names the blocked live provider discount smoke gate',
      'cache key is stable for equivalent prefixes and scoped by session and model',
      'hash-only measurement detects future hits without storing raw prefix',
      'usage fields expose cached input counters without changing token totals or pricing discount',
      'non-eligible prompts are not recorded and image URLs are hash-normalized',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-contract-proof-latest.md'))).toBe(true);
  });
});
