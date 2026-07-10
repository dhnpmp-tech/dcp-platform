'use strict';

const BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION = 'dcp.batch_live_acceptance_evidence.v1';
const BATCH_LIVE_ACCEPTANCE_GATE = 'batch_live_execution_discount_smoke';
const BATCH_LIVE_ACCEPTANCE_COMMAND = 'DCP_BATCH_LIVE_PROOF_ALLOW=1 npm run proof:batch-live-execution';

const BATCH_LIVE_ACCEPTANCE_REQUIRED_EVIDENCE = Object.freeze([
  Object.freeze({
    id: 'readiness_live_claims_verified',
    label: 'Readiness claims are true',
    description: 'Authenticated readiness must explicitly claim public batch execution, discounts, result downloads, settlement, and model batch capability are live.',
    required_fields: Object.freeze([
      'public_execution_enabled',
      'features.result_downloads.enabled_for_completed_results',
      'features.worker_execution.public_enabled',
      'features.settlement.public_enabled',
      'features.discounts.enabled',
      'features.model_capability_flag.enabled',
      'claims.batch_execution_live',
      'claims.batch_discount_live',
      'claims.model_batch_capability_live',
    ]),
  }),
  Object.freeze({
    id: 'batch_create_verified',
    label: 'Batch create accepted',
    description: 'The runner must create a renter-authenticated batch with idempotency proof, request count, normalized input bytes, and input checksum.',
    required_fields: Object.freeze([
      'batch_id',
      'idempotency_key',
      'request_count',
      'input_checksum_sha256',
      'input_normalized_bytes',
    ]),
  }),
  Object.freeze({
    id: 'batch_poll_completed',
    label: 'Batch reaches completed state',
    description: 'The runner must poll the created batch until a terminal completed state with completed and failed line counts is observed.',
    required_fields: Object.freeze([
      'status=completed',
      'completed_count',
      'failed_count',
      'completed_at',
    ]),
  }),
  Object.freeze({
    id: 'result_manifest_verified',
    label: 'Result manifest has checksum proof',
    description: 'The result manifest must expose a storage key, SHA-256 checksum, normalized byte count, and availability flag after completion.',
    required_fields: Object.freeze([
      'result_storage_key',
      'result_checksum_sha256',
      'result_normalized_bytes',
      'results_available',
    ]),
  }),
  Object.freeze({
    id: 'result_download_verified',
    label: 'Result download checksum matches manifest',
    description: 'The runner must download the completed result through the configured result path or signed URL and verify the body checksum matches the manifest.',
    required_fields: Object.freeze([
      'download_url_or_storage_key',
      'download_status',
      'download_checksum_sha256',
      'manifest_checksum_sha256',
    ]),
  }),
  Object.freeze({
    id: 'line_execution_proof_verified',
    label: 'Per-line execution proof exists',
    description: 'Every batch line must have status, provider/request trace, token totals, cost, response checksum or error, and no raw prompt or response body in proof artifacts.',
    required_fields: Object.freeze([
      'custom_id',
      'status',
      'provider_id',
      'request_id',
      'provider_response_id_or_error',
      'usage.total_tokens',
      'cost_halala',
      'response_checksum_sha256_or_error_code',
    ]),
  }),
  Object.freeze({
    id: 'discounted_settlement_proof_verified',
    label: 'Discounted settlement is proven',
    description: 'The runner must prove minimum-balance preflight, no partial billing, approved batch discount policy, settlement request ids, and final renter debit/payment state.',
    required_fields: Object.freeze([
      'minimum_balance_preflight',
      'discount_policy_id',
      'discount_rate',
      'settlement_request_id',
      'settlement_status=settled',
      'renter_balance_after',
    ]),
  }),
  Object.freeze({
    id: 'model_capability_flag_verified',
    label: 'Model capability flag follows proof',
    description: 'The runner must verify model catalog batch capability is only true after execution and discounted settlement evidence passed.',
    required_fields: Object.freeze([
      '/v1/models.data[].feature_readiness.batch',
      'capability_contract',
      'claim_guard_after_settlement',
    ]),
  }),
]);

function cloneRequiredEvidence() {
  return BATCH_LIVE_ACCEPTANCE_REQUIRED_EVIDENCE.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    required_fields: [...item.required_fields],
  }));
}

function buildEmptyBatchLiveAcceptanceEvidence() {
  return BATCH_LIVE_ACCEPTANCE_REQUIRED_EVIDENCE.reduce((acc, item) => {
    acc[item.id] = false;
    return acc;
  }, {});
}

function buildBatchLiveAcceptanceContract() {
  return {
    contract: BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
    gate: BATCH_LIVE_ACCEPTANCE_GATE,
    command: BATCH_LIVE_ACCEPTANCE_COMMAND,
    pass_condition: 'A PASS report must prove every required_evidence id in one redacted live run before batch execution, discounts, downloads, settlement, or model batch capability claims can be enabled.',
    required_evidence: cloneRequiredEvidence(),
    claim_unlocks: {
      batch_execution_live: [
        'readiness_live_claims_verified',
        'batch_create_verified',
        'batch_poll_completed',
        'result_manifest_verified',
        'result_download_verified',
        'line_execution_proof_verified',
      ],
      batch_discount_live: [
        'discounted_settlement_proof_verified',
      ],
      model_batch_capability_live: [
        'model_capability_flag_verified',
      ],
    },
  };
}

function findMissingBatchLiveAcceptanceEvidence(input = {}) {
  const evidence = input.acceptance_evidence && typeof input.acceptance_evidence === 'object'
    ? input.acceptance_evidence
    : input;
  return BATCH_LIVE_ACCEPTANCE_REQUIRED_EVIDENCE
    .filter((item) => evidence[item.id] !== true)
    .map((item) => item.id);
}

module.exports = {
  BATCH_LIVE_ACCEPTANCE_COMMAND,
  BATCH_LIVE_ACCEPTANCE_CONTRACT_VERSION,
  BATCH_LIVE_ACCEPTANCE_GATE,
  BATCH_LIVE_ACCEPTANCE_REQUIRED_EVIDENCE,
  buildBatchLiveAcceptanceContract,
  buildEmptyBatchLiveAcceptanceEvidence,
  findMissingBatchLiveAcceptanceEvidence,
};
