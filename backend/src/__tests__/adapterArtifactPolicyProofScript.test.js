'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterArtifactPolicyProof,
} = require('../../tests/adapter-artifact-policy-proof');

describe('adapter artifact policy proof script', () => {
  test('writes a CI-safe adapter artifact policy report without upload or serving side effects', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-artifact-policy-proof-'));
    const report = runAdapterArtifactPolicyProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
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
      bills_training_or_inference: false,
      claims_tinker_compatibility: false,
    });
    expect(report.artifact_policy_readiness).toMatchObject({
      endpoints: {
        artifact_policy_readiness: 'GET /api/adapters/artifacts/readiness',
        lora_readiness: 'GET /api/lora/readiness',
      },
      artifact_policy: {
        policy_available: true,
        artifact_upload_endpoint_enabled: false,
        artifact_storage_write_enabled: false,
        required_artifact_filename: 'adapter.safetensors',
        required_model_card_filename: 'model-card.json',
        checksum_required: true,
        model_card_required: true,
      },
      claim_guards: {
        policy_contract_live: true,
        writes_adapter_artifact: false,
        routes_adapter_traffic: false,
      },
    });
    expect(report.valid_policy).toMatchObject({
      valid: true,
      would_accept_if_artifact_upload_enabled: true,
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      adapter_serving_enabled: false,
      route_traffic_enabled: false,
      artifact_key_scope: 'renter_adapter_scoped',
      model_card_key_scope: 'renter_adapter_scoped',
      denial_code_while_disabled: 'adapter_artifact_upload_disabled',
    });
    expect(JSON.stringify(report.valid_policy)).not.toContain('adapters/renter-42/adpt_policy001');
    expect(JSON.stringify(report.valid_policy)).not.toContain('"storage_key":');
    expect(report.invalid_cases).toMatchObject({
      wrong_tenant_key: { rejected: true, code: 'adapter_artifact_storage_key_scope_invalid' },
      wrong_artifact_filename: { rejected: true, code: 'adapter_artifact_filename_invalid' },
      wrong_model_card_scope: { rejected: true, code: 'adapter_model_card_storage_key_scope_invalid' },
      invalid_checksum: { rejected: true, code: 'adapter_artifact_checksum_invalid' },
    });
    expect(report.linked_contracts).toMatchObject({
      lora_readiness: {
        endpoint: 'GET /api/adapters/artifacts/readiness',
        artifact_upload_endpoint_enabled: false,
        artifact_storage_write_enabled: false,
      },
      worker_key_convention: {
        adapter_artifact_key_matches_worker: true,
        model_card_key_matches_worker: true,
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'adapter artifact readiness is public and policy-only',
      'scoped adapter and model-card keys validate without exposing object keys',
      'unscoped artifact filename model card and checksum cases are rejected',
      'lora readiness and worker key builders link to artifact policy',
      'proof performs no artifact upload gpu serving route or money mutation',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-artifact-policy-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-artifact-policy-proof-latest.md'))).toBe(true);
  });
});
