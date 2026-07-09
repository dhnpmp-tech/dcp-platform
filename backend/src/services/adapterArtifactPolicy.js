'use strict';

const ADAPTER_ARTIFACT_POLICY_VERSION = 'dcp.adapter_artifact_policy.v1';
const ADAPTER_ARTIFACT_FILENAME = 'adapter.safetensors';
const ADAPTER_MODEL_CARD_FILENAME = 'model-card.json';

class AdapterArtifactPolicyError extends Error {
  constructor(message, { code = 'adapter_artifact_policy_error', details = undefined } = {}) {
    super(message);
    this.name = 'AdapterArtifactPolicyError';
    this.code = code;
    this.details = details;
  }
}

function buildAdapterArtifactPolicyReadiness(now = new Date()) {
  return {
    object: 'adapter_artifact_policy_readiness',
    version: ADAPTER_ARTIFACT_POLICY_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'artifact_policy_contract_only',
    endpoints: {
      artifact_policy_readiness: 'GET /api/adapters/artifacts/readiness',
      lora_readiness: 'GET /api/lora/readiness',
      adapter_registry: 'GET/POST /api/adapters',
      lora_training_jobs: 'POST /api/lora/training-jobs',
      register_training_adapter: 'POST /api/lora/training-jobs/{training_job_id}/register-adapter',
      adapter_deployments: 'GET/POST /api/adapters/{adapter_id}/deployments',
      adapter_load_proof: 'POST /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof',
    },
    artifact_policy: {
      policy_available: true,
      metadata_registry_available: true,
      registry_metadata_create_enabled: true,
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      adapter_serving_enabled: false,
      route_traffic_enabled: false,
      requires_renter_scoped_key: true,
      required_prefix_template: 'adapters/renter-{renter_id}/{adapter_id}/',
      required_artifact_filename: ADAPTER_ARTIFACT_FILENAME,
      required_model_card_filename: ADAPTER_MODEL_CARD_FILENAME,
      checksum_required: true,
      sha256_digest_required: true,
      model_card_required: true,
      training_artifact_proof_required: true,
      vllm_load_proof_required: true,
    },
    denial_codes: [
      'adapter_artifact_upload_disabled',
      'adapter_artifact_storage_key_scope_invalid',
      'adapter_artifact_filename_invalid',
      'adapter_artifact_checksum_invalid',
      'adapter_model_card_storage_key_scope_invalid',
      'adapter_model_card_filename_invalid',
    ],
    claim_guards: {
      policy_contract_live: true,
      metadata_registry_available: true,
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      exposes_object_store_bucket: false,
      creates_training_job: false,
      runs_gpu_training: false,
      writes_adapter_artifact: false,
      writes_model_card_artifact: false,
      enables_adapter_serving: false,
      routes_adapter_traffic: false,
      bills_training: false,
      bills_adapter_inference: false,
      claims_tinker_compatibility: false,
    },
    next_actions: [
      'Run the LoRA GPU training artifact proof on a provider host.',
      'Record adapter.safetensors and model-card.json under the renter/adapter scoped key prefix.',
      'Keep adapter traffic disabled until vLLM load proof and billing smoke are approved.',
    ],
  };
}

function evaluateAdapterArtifactPolicy(input = {}) {
  const renterId = normalizeRenterId(input.renter_id ?? input.renterId);
  const adapterId = normalizeAdapterId(input.adapter_id ?? input.adapterId);
  const checksum = normalizeChecksum(input.checksum_sha256 ?? input.artifact_checksum_sha256);
  const artifactKey = normalizeStorageKey(input.storage_key ?? input.artifact_storage_key, 'artifact_storage_key');
  const modelCardKey = normalizeStorageKey(input.model_card_storage_key, 'model_card_storage_key');
  const expectedArtifactKey = buildAdapterArtifactStorageKey({ renter_id: renterId, adapter_id: adapterId });
  const expectedModelCardKey = buildAdapterModelCardStorageKey({ renter_id: renterId, adapter_id: adapterId });

  if (artifactKey !== expectedArtifactKey) {
    throw new AdapterArtifactPolicyError('adapter artifact storage key must be renter and adapter scoped', {
      code: artifactKey.endsWith(`/${ADAPTER_ARTIFACT_FILENAME}`)
        ? 'adapter_artifact_storage_key_scope_invalid'
        : 'adapter_artifact_filename_invalid',
      details: {
        expected_pattern: 'adapters/renter-{renter_id}/{adapter_id}/adapter.safetensors',
      },
    });
  }
  if (modelCardKey !== expectedModelCardKey) {
    throw new AdapterArtifactPolicyError('adapter model-card storage key must be renter and adapter scoped', {
      code: modelCardKey.endsWith(`/${ADAPTER_MODEL_CARD_FILENAME}`)
        ? 'adapter_model_card_storage_key_scope_invalid'
        : 'adapter_model_card_filename_invalid',
      details: {
        expected_pattern: 'adapters/renter-{renter_id}/{adapter_id}/model-card.json',
      },
    });
  }

  return {
    valid: true,
    version: ADAPTER_ARTIFACT_POLICY_VERSION,
    renter_id: renterId,
    adapter_id: adapterId,
    would_accept_if_artifact_upload_enabled: true,
    artifact_upload_endpoint_enabled: false,
    artifact_storage_write_enabled: false,
    adapter_serving_enabled: false,
    route_traffic_enabled: false,
    checksum_sha256: checksum,
    artifact_key_scope: 'renter_adapter_scoped',
    model_card_key_scope: 'renter_adapter_scoped',
    required_artifact_filename: ADAPTER_ARTIFACT_FILENAME,
    required_model_card_filename: ADAPTER_MODEL_CARD_FILENAME,
    denial_code_while_disabled: 'adapter_artifact_upload_disabled',
  };
}

function buildAdapterArtifactStorageKey(input = {}) {
  return `adapters/renter-${normalizeRenterId(input.renter_id ?? input.renterId)}/${normalizeAdapterId(input.adapter_id ?? input.adapterId)}/${ADAPTER_ARTIFACT_FILENAME}`;
}

function buildAdapterModelCardStorageKey(input = {}) {
  return `adapters/renter-${normalizeRenterId(input.renter_id ?? input.renterId)}/${normalizeAdapterId(input.adapter_id ?? input.adapterId)}/${ADAPTER_MODEL_CARD_FILENAME}`;
}

function normalizeRenterId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AdapterArtifactPolicyError('renter_id must be a positive integer', {
      code: 'invalid_adapter_artifact_renter_id',
      details: { field: 'renter_id' },
    });
  }
  return n;
}

function normalizeAdapterId(value) {
  const id = String(value || '').trim();
  if (!/^adpt_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    throw new AdapterArtifactPolicyError('adapter_id must be a valid adapter registry id', {
      code: 'invalid_adapter_artifact_adapter_id',
      details: { field: 'adapter_id' },
    });
  }
  return id;
}

function normalizeChecksum(value) {
  const checksum = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new AdapterArtifactPolicyError('checksum_sha256 must be a 64-character SHA-256 hex digest', {
      code: 'adapter_artifact_checksum_invalid',
      details: { field: 'checksum_sha256' },
    });
  }
  return checksum;
}

function normalizeStorageKey(value, fieldName) {
  if (typeof value !== 'string') {
    throw new AdapterArtifactPolicyError(`${fieldName} is required`, {
      code: fieldName === 'model_card_storage_key'
        ? 'adapter_model_card_storage_key_scope_invalid'
        : 'adapter_artifact_storage_key_scope_invalid',
      details: { field: fieldName },
    });
  }
  const key = value.trim().replace(/^\/+/, '');
  if (!key || key.length > 512 || key.includes('\0')) {
    throw new AdapterArtifactPolicyError(`${fieldName} is invalid`, {
      code: fieldName === 'model_card_storage_key'
        ? 'adapter_model_card_storage_key_scope_invalid'
        : 'adapter_artifact_storage_key_scope_invalid',
      details: { field: fieldName },
    });
  }
  const segments = key.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new AdapterArtifactPolicyError(`${fieldName} must be a relative object key without dot segments`, {
      code: fieldName === 'model_card_storage_key'
        ? 'adapter_model_card_storage_key_scope_invalid'
        : 'adapter_artifact_storage_key_scope_invalid',
      details: { field: fieldName },
    });
  }
  return key;
}

module.exports = {
  ADAPTER_ARTIFACT_POLICY_VERSION,
  ADAPTER_ARTIFACT_FILENAME,
  ADAPTER_MODEL_CARD_FILENAME,
  AdapterArtifactPolicyError,
  buildAdapterArtifactPolicyReadiness,
  evaluateAdapterArtifactPolicy,
  buildAdapterArtifactStorageKey,
  buildAdapterModelCardStorageKey,
};
