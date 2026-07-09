'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runPromptCacheSettlementReadinessProof,
} = require('../../tests/prompt-cache-settlement-readiness-proof');

describe('prompt cache settlement readiness proof script', () => {
  test('writes a CI-safe proof report for gated settlement discount readiness', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-cache-settlement-proof-'));
    const report = runPromptCacheSettlementReadinessProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.readiness).toMatchObject({
      endpoints: {
        settlement_readiness: 'GET /v1/prompt-cache/settlement/readiness',
        prompt_cache_readiness: 'GET /v1/prompt-cache/readiness',
        live_settlement_proof: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
      },
      policy: {
        cached_input_discounts_enabled: false,
        provider_kv_cache_control_enabled: false,
        settlement_discounts_enabled: false,
        settlement_mutations_enabled: false,
        discount_policy: {
          status: 'policy_pending',
          discount_bps_live: 0,
        },
      },
      claim_guards: {
        readiness_contract_live: true,
        mutates_balance: false,
        records_usage_event: false,
        dispatches_inference: false,
        stores_raw_prompt: false,
        claims_tinker_compatibility: false,
      },
    });
    expect(report.eligible_when_enabled).toMatchObject({
      would_discount_if_enabled: true,
      discount_enabled: false,
      settlement_discount_enabled: false,
      discountable: false,
      denial_code_while_disabled: 'prompt_cache_discount_disabled',
      blockers: [],
    });
    expect(report.missing_provider_hit).toMatchObject({
      would_discount_if_enabled: false,
      denial_code_while_disabled: 'prompt_cache_provider_hit_required',
      checks: {
        live_provider_cache_hit_evidence: false,
      },
    });
    expect(report.discount_math_mismatch).toMatchObject({
      would_discount_if_enabled: false,
      denial_code_while_disabled: 'prompt_cache_discount_math_mismatch',
      checks: {
        discount_math_matches_cost: false,
      },
    });
    expect(report.claims).toMatchObject({
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
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'prompt-cache settlement readiness is public and policy-only',
      'complete provider-hit evidence remains non-discountable until policy enablement',
      'provider cache-hit evidence is required before future discounts',
      'discount settlement math must reconcile before enablement',
      'proof performs no inference usage or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-settlement-readiness-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-settlement-readiness-proof-latest.md'))).toBe(true);
  });
});
