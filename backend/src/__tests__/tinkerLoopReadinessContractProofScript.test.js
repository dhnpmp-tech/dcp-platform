'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runTinkerLoopReadinessContractProof,
} = require('../../tests/tinker-loop-readiness-contract-proof');

describe('Tinker loop readiness contract proof script', () => {
  test('writes a CI-safe proof report for disabled Tinker-style loop gates', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinker-loop-proof-'));
    const report = await runTinkerLoopReadinessContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.readiness).toMatchObject({
      object: 'lora_readiness',
      version: 'dcp.lora_readiness.v1',
      current_mode: 'metadata_and_artifact_proof_only',
      endpoint: 'GET /api/lora/readiness',
    });
    expect(report.tinker_loop).toMatchObject({
      status: 'contract_only',
      available: false,
      api_available: false,
      compatibility_claim_allowed: false,
      tinker_api_compatible: false,
      safety: {
        runs_remote_gpu_loop: false,
        creates_training_job: false,
        writes_adapter_weights: false,
        bills_training_steps: false,
        claims_tinker_compatibility: false,
      },
    });
    expect(Object.keys(report.tinker_loop.primitives)).toEqual([
      'create_lora',
      'forward_backward',
      'optimizer_step',
      'save_weights',
      'sample',
      'evaluate',
    ]);
    for (const primitive of Object.values(report.tinker_loop.primitives)) {
      expect(primitive).toMatchObject({
        status: 'not_enabled',
        available: false,
        endpoint: null,
        mutates_training_state: false,
      });
      expect(primitive.requires_before_enablement).toEqual(expect.arrayContaining(['GPU-host proof']));
    }
    expect(report.claim_guards).toMatchObject({
      public_training_enabled: false,
      public_serving_enabled: false,
      tinker_compatible: false,
      tinker_style_loop_enabled: false,
      tinker_low_level_api_enabled: false,
    });
    expect(report.claims).toMatchObject({
      creates_tinker_session: false,
      runs_remote_training_loop: false,
      exposes_forward_backward_api: false,
      saves_adapter_weights: false,
      routes_adapter_traffic: false,
      bills_training_steps: false,
      claims_tinker_compatibility: false,
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'LoRA readiness remains the source contract',
      'Tinker loop is visible but not available',
      'low-level loop primitives have no enabled endpoint',
      'proof prerequisites name GPU, artifact, billing, and deployment gates',
      'claim guards stay false for Tinker and money mutations',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'tinker-loop-readiness-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'tinker-loop-readiness-contract-proof-latest.md'))).toBe(true);
  });
});
