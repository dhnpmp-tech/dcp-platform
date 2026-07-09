'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runModelCatalogParityProof,
} = require('../../tests/model-catalog-parity-proof');

describe('model catalog parity proof script', () => {
  test('writes a CI-safe proof report for model catalog parity', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-catalog-parity-proof-'));
    const report = runModelCatalogParityProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      changes_model_catalog_semantics: false,
      changes_provider_selection: false,
      changes_request_routing: false,
      changes_pricing_or_billing: false,
      changes_settlement: false,
      enables_prompt_cache_discount: false,
      enables_batch_execution: false,
      enables_lora_serving: false,
      enables_dedicated_deployment_routing: false,
    });
    expect(report.surfaces).toEqual({
      v1_models: 'GET /v1/models',
      legacy_models: 'GET /api/models',
      managed_catalog: 'GET /api/models/catalog',
    });
    expect(report.jest).toMatchObject({
      success: true,
      num_failed_tests: 0,
    });
    expect(report.jest.num_passed_tests).toBeGreaterThanOrEqual(1);
    expect(report.invariants.map((item) => item.name)).toEqual([
      'targeted model catalog parity test passes',
      'all three model catalog surfaces are covered',
      'pricing, provider count, capabilities, readiness, and metadata parity are enforced',
      'proof is read-only and does not enable product behavior',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'model-catalog-parity-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'model-catalog-parity-proof-latest.md'))).toBe(true);
  });
});
