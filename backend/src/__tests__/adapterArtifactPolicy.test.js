'use strict';

const express = require('express');
const request = require('supertest');
const {
  ADAPTER_ARTIFACT_POLICY_VERSION,
  buildAdapterArtifactPolicyReadiness,
  buildAdapterArtifactStorageKey,
  buildAdapterModelCardStorageKey,
  evaluateAdapterArtifactPolicy,
} = require('../services/adapterArtifactPolicy');
const { buildLoraReadiness } = require('../routes/lora');
const { createAdaptersRouter } = require('../routes/adapters');

function captureCode(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
}

function buildApp() {
  const app = express();
  app.use('/api/adapters', createAdaptersRouter({
    db: {
      exec: () => {},
      prepare: () => {
        throw new Error('protected adapter registry route should not be reached');
      },
    },
    requireRenter: (_req, res) => res.status(401).json({ error: 'Renter API key required' }),
  }));
  return app;
}

describe('adapter artifact policy', () => {
  test('builds a public artifact policy readiness contract without upload or serving claims', () => {
    const readiness = buildAdapterArtifactPolicyReadiness(new Date('2026-07-09T06:15:00.000Z'));

    expect(readiness).toMatchObject({
      object: 'adapter_artifact_policy_readiness',
      version: ADAPTER_ARTIFACT_POLICY_VERSION,
      current_mode: 'artifact_policy_contract_only',
      endpoints: {
        artifact_policy_readiness: 'GET /api/adapters/artifacts/readiness',
        lora_readiness: 'GET /api/lora/readiness',
        adapter_registry: 'GET/POST /api/adapters',
      },
      artifact_policy: {
        policy_available: true,
        metadata_registry_available: true,
        registry_metadata_create_enabled: true,
        artifact_upload_endpoint_enabled: false,
        artifact_storage_write_enabled: false,
        adapter_serving_enabled: false,
        route_traffic_enabled: false,
        required_prefix_template: 'adapters/renter-{renter_id}/{adapter_id}/',
        required_artifact_filename: 'adapter.safetensors',
        required_model_card_filename: 'model-card.json',
        checksum_required: true,
        model_card_required: true,
      },
      claim_guards: {
        policy_contract_live: true,
        metadata_registry_available: true,
        artifact_upload_endpoint_enabled: false,
        artifact_storage_write_enabled: false,
        writes_adapter_artifact: false,
        writes_model_card_artifact: false,
        enables_adapter_serving: false,
        routes_adapter_traffic: false,
      },
    });
  });

  test('evaluates scoped artifact and model-card keys without exposing storage keys', () => {
    const result = evaluateAdapterArtifactPolicy({
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/adapter.safetensors',
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/model-card.json',
      checksum_sha256: 'a'.repeat(64),
    });

    expect(result).toMatchObject({
      valid: true,
      version: ADAPTER_ARTIFACT_POLICY_VERSION,
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      would_accept_if_artifact_upload_enabled: true,
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      adapter_serving_enabled: false,
      route_traffic_enabled: false,
      checksum_sha256: 'a'.repeat(64),
      artifact_key_scope: 'renter_adapter_scoped',
      model_card_key_scope: 'renter_adapter_scoped',
      denial_code_while_disabled: 'adapter_artifact_upload_disabled',
    });
    expect(JSON.stringify(result)).not.toContain('adapters/renter-42/adpt_policy001');
    expect(JSON.stringify(result)).not.toContain('"storage_key":');
  });

  test('rejects unscoped keys, wrong filenames, and invalid checksums before artifact upload exists', () => {
    const base = {
      renter_id: 42,
      adapter_id: 'adpt_policy001',
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/adapter.safetensors',
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/model-card.json',
      checksum_sha256: 'a'.repeat(64),
    };

    expect(captureCode(() => evaluateAdapterArtifactPolicy({
      ...base,
      artifact_storage_key: 'adapters/renter-41/adpt_policy001/adapter.safetensors',
    }))).toBe('adapter_artifact_storage_key_scope_invalid');
    expect(captureCode(() => evaluateAdapterArtifactPolicy({
      ...base,
      artifact_storage_key: 'adapters/renter-42/adpt_policy001/weights.bin',
    }))).toBe('adapter_artifact_filename_invalid');
    expect(captureCode(() => evaluateAdapterArtifactPolicy({
      ...base,
      model_card_storage_key: 'adapters/renter-42/adpt_other001/model-card.json',
    }))).toBe('adapter_model_card_storage_key_scope_invalid');
    expect(captureCode(() => evaluateAdapterArtifactPolicy({
      ...base,
      model_card_storage_key: 'adapters/renter-42/adpt_policy001/card.json',
    }))).toBe('adapter_model_card_filename_invalid');
    expect(captureCode(() => evaluateAdapterArtifactPolicy({
      ...base,
      checksum_sha256: 'not-a-sha',
    }))).toBe('adapter_artifact_checksum_invalid');
  });

  test('builds canonical artifact and model-card keys matching the worker convention', () => {
    expect(buildAdapterArtifactStorageKey({
      renter_id: 7,
      adapter_id: 'adpt_scope001',
    })).toBe('adapters/renter-7/adpt_scope001/adapter.safetensors');
    expect(buildAdapterModelCardStorageKey({
      renter_id: 7,
      adapter_id: 'adpt_scope001',
    })).toBe('adapters/renter-7/adpt_scope001/model-card.json');
  });

  test('links LoRA readiness to adapter artifact policy without enabling writes', () => {
    const readiness = buildLoraReadiness(new Date('2026-07-09T06:15:00.000Z'));

    expect(readiness.endpoints.adapter_artifact_policy).toBe('GET /api/adapters/artifacts/readiness');
    expect(readiness.adapter_registry).toMatchObject({
      artifact_policy_version: ADAPTER_ARTIFACT_POLICY_VERSION,
      artifact_policy_endpoint: 'GET /api/adapters/artifacts/readiness',
      registry_contract_proof: {
        status: 'ci_safe',
        command: 'npm run proof:adapter-registry-contract',
      },
      artifact_upload_endpoint_enabled: false,
      artifact_storage_write_enabled: false,
      model_card_required: true,
      serving_enabled: false,
      route_traffic: false,
    });
  });

  test('exposes adapter artifact policy readiness through a public read-only route', async () => {
    const res = await request(buildApp()).get('/api/adapters/artifacts/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: 'adapter_artifact_policy_readiness',
      version: ADAPTER_ARTIFACT_POLICY_VERSION,
      current_mode: 'artifact_policy_contract_only',
      artifact_policy: {
        artifact_upload_endpoint_enabled: false,
        artifact_storage_write_enabled: false,
        adapter_serving_enabled: false,
      },
      claim_guards: {
        writes_adapter_artifact: false,
        enables_adapter_serving: false,
        routes_adapter_traffic: false,
      },
    });
  });
});
