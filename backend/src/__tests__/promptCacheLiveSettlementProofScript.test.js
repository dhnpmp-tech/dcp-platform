'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PROMPT_CACHE_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  CONTRACT,
  buildUrl,
  findMissingPromptCacheLiveAcceptanceEvidence,
  redactSecret,
  runPromptCacheLiveSettlementProof,
} = require('../../tests/prompt-cache-live-settlement-proof');

function jsonResponse(body, { status = 200, requestId = 'req-test' } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
  });
}

function chatBody({ id, status, cacheKey, cachedInputTokens }) {
  return {
    id,
    object: 'chat.completion',
    model: 'allam-2-7b',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'DCP_PROMPT_CACHE_LIVE_OK' },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 80,
      completion_tokens: 8,
      total_tokens: 88,
      prompt_cache: {
        version: 'dcp.prompt_cache.v1',
        status,
        eligible: true,
        cache_key: cacheKey,
        cached_input_tokens: cachedInputTokens,
        billable_input_tokens: 80,
        discount_applied: false,
        discount_bps: 0,
      },
      pricing: {
        currency: 'USD',
        cached_input_tokens: cachedInputTokens,
        billable_input_tokens: 80,
        prompt_cache_discount_applied: false,
        prompt_cache_discount_bps: 0,
        prompt_cache: {
          status,
          eligible: true,
          cached_input_tokens: cachedInputTokens,
          billable_input_tokens: 80,
          discount_applied: false,
          discount_bps: 0,
        },
      },
    },
  };
}

describe('prompt cache live settlement proof script', () => {
  test('refuses live traffic by default and writes a redacted report', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-cache-live-blocked-'));
    const fetchImpl = jest.fn();
    const ensurePrincipal = jest.fn();

    const { report, exitCode } = await runPromptCacheLiveSettlementProof({
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test',
      model: 'allam-2-7b',
    });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('FAIL');
    expect(report.contract).toBe(CONTRACT);
    expect(report.acceptance_contract).toMatchObject({
      contract: PROMPT_CACHE_LIVE_ACCEPTANCE_CONTRACT_VERSION,
      gate: 'prompt_cache_provider_discount_smoke',
      command: 'DCP_PROMPT_CACHE_LIVE_PROOF_ALLOW=1 npm run proof:prompt-cache-live-settlement',
    });
    expect(report.acceptance_contract.required_evidence.map((item) => item.id)).toEqual([
      'readiness_measurement_mode_verified',
      'funded_smoke_principal_verified',
      'first_measurement_request_verified',
      'second_hit_measurement_verified',
      'no_discount_guard_verified',
      'redacted_artifact_verified',
    ]);
    expect(report.acceptance_contract.future_discount_required_evidence.map((item) => item.id)).toEqual([
      'provider_kv_cache_control_verified',
      'discount_policy_approved',
      'discounted_settlement_proof_verified',
      'model_pricing_flag_verified',
    ]);
    expect(report.failure).toMatchObject({
      code: 'LIVE_PROOF_NOT_ENABLED',
      severity: 'blocking',
    });
    expect(report.claims).toMatchObject({
      prompt_cache_discount_enabled: false,
      provider_kv_cache_control: false,
      settlement_discount_enabled: false,
      changes_billing_or_settlement: false,
      proves_tinker_compatibility: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ensurePrincipal).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-live-settlement-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-live-settlement-proof-latest.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'prompt-cache-live-settlement-proof-latest.log'))).toBe(true);
  });

  test('proves live hit metadata without discounts when dependencies are injected', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-cache-live-pass-'));
    const cacheKey = 'pc_test_cache_key';
    const fixtureCredential = ['fixture', 'prompt', 'cache', 'value'].join('-');
    const calls = [];
    const fetchImpl = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).endsWith('/v1/prompt-cache/readiness')) {
        return jsonResponse({
          object: 'prompt_cache_readiness',
          version: 'dcp.prompt_cache.v1',
          current_mode: 'measurement_only_no_discount',
          billing: {
            discounts_enabled: false,
            settlement_discount_enabled: false,
          },
          claims: {
            prompt_cache_discount: false,
            provider_kv_cache_control: false,
            tinker_compatible: false,
          },
        }, { requestId: 'req-readiness' });
      }
      if (String(url).endsWith('/v1/chat/completions') && calls.filter((call) => String(call.url).endsWith('/v1/chat/completions')).length === 1) {
        return jsonResponse(chatBody({
          id: 'chatcmpl-first',
          status: 'miss_measured',
          cacheKey,
          cachedInputTokens: 0,
        }), { requestId: 'req-first' });
      }
      return jsonResponse(chatBody({
        id: 'chatcmpl-second',
        status: 'hit_measured_no_discount',
        cacheKey,
        cachedInputTokens: 16,
      }), { requestId: 'req-second' });
    });
    const ensurePrincipal = jest.fn(async () => ({
      renterId: 7,
      renterEmail: 'proof@example.test',
      balanceHalala: 10000,
      inferenceKey: fixtureCredential,
      inferenceKeyId: 'key_123',
      inferenceKeyLabel: 'proof-key',
      inferenceKeyExpiresAt: '2026-07-09T04:00:00.000Z',
    }));

    const { report, exitCode } = await runPromptCacheLiveSettlementProof({
      allowLive: true,
      outputDir,
      fetchImpl,
      ensurePrincipal,
      baseUrl: 'https://api.example.test/api',
      model: 'allam-2-7b',
      sessionId: 'session-proof',
      maxTokens: 12,
    });

    expect(exitCode).toBe(0);
    expect(report.verdict).toBe('PASS');
    expect(report.base_url).toBe('https://api.example.test/api');
    expect(report.principal).toMatchObject({
      renter_id: 7,
      key_hint: 'fixture-...alue',
    });
    expect(JSON.stringify(report)).not.toContain(fixtureCredential);
    expect(report.readiness).toMatchObject({
      current_mode: 'measurement_only_no_discount',
      discounts_enabled: false,
      settlement_discount_enabled: false,
      provider_kv_cache_control: false,
      prompt_cache_discount: false,
    });
    expect(report.prompt_cache).toMatchObject({
      cache_keys_match: true,
      live_hit_measured: true,
      no_discount_verified: true,
      first: {
        prompt_cache: {
          status: 'miss_measured',
          cached_input_tokens: 0,
          billable_input_tokens: 80,
          discount_applied: false,
          discount_bps: 0,
        },
      },
      second: {
        prompt_cache: {
          status: 'hit_measured_no_discount',
          cached_input_tokens: 16,
          billable_input_tokens: 80,
          discount_applied: false,
          discount_bps: 0,
        },
      },
    });
    expect(report.acceptance_evidence).toMatchObject({
      readiness_measurement_mode_verified: true,
      funded_smoke_principal_verified: true,
      first_measurement_request_verified: true,
      second_hit_measurement_verified: true,
      no_discount_guard_verified: true,
      redacted_artifact_verified: true,
    });
    expect(report.claims).toMatchObject({
      prompt_cache_discount_enabled: false,
      provider_kv_cache_control: false,
      settlement_discount_enabled: false,
      changes_billing_or_settlement: false,
    });
    expect(report.acceptance_contract.claim_unlocks.prompt_cache_discount).toEqual([
      'provider_kv_cache_control_verified',
      'discount_policy_approved',
      'discounted_settlement_proof_verified',
      'model_pricing_flag_verified',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(ensurePrincipal).toHaveBeenCalledWith({ baseUrl: 'https://api.example.test/api' });
    expect(calls[1].options.headers.authorization).toBe(`Bearer ${fixtureCredential}`);
    expect(JSON.parse(calls[1].options.body)).toMatchObject({
      model: 'allam-2-7b',
      routing_policy: 'balanced',
      prompt_cache: { session_id: 'session-proof' },
      max_tokens: 12,
    });
  });

  test('normalizes API base URLs without leaking key hints', () => {
    expect(buildUrl('https://api.dcp.sa/api', '/v1/chat/completions')).toBe('https://api.dcp.sa/v1/chat/completions');
    expect(buildUrl('https://api.dcp.sa/api', '/api/health')).toBe('https://api.dcp.sa/api/health');
    expect(redactSecret('short')).toBe('shor...');
    expect(redactSecret(['fixture', 'prompt', 'cache', 'value'].join('-'))).toBe('fixture-...alue');
    expect(findMissingPromptCacheLiveAcceptanceEvidence({
      readiness_measurement_mode_verified: true,
      funded_smoke_principal_verified: true,
    })).toEqual([
      'first_measurement_request_verified',
      'second_hit_measurement_verified',
      'no_discount_guard_verified',
      'redacted_artifact_verified',
    ]);
  });
});
