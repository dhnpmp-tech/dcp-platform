const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  runAdapterDeploymentContractProof,
} = require('../../tests/adapter-deployment-contract-proof');

describe('adapter deployment contract proof script', () => {
  test('writes a CI-safe proof report for non-routing until load proof', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-deployment-proof-'));
    const report = runAdapterDeploymentContractProof({ outputDir });

    expect(report.verdict).toBe('PASS');
    expect(report.contract).toBe(CONTRACT);
    expect(report.claims).toMatchObject({
      routes_production_traffic: false,
      verifies_real_vllm_load: false,
      bills_adapter_inference: false,
    });
    expect(report.deployments.pending_public_request).toMatchObject({
      status: 'pending',
      route_traffic: false,
      serving_load_proof: null,
    });
    expect(report.deployments.mismatched_load_proof).toMatchObject({
      status: 'degraded',
      route_traffic: false,
      failure_reason: 'serving_load_proof_mismatch',
    });
    expect(report.deployments.checksum_mismatch_load_proof).toMatchObject({
      status: 'degraded',
      route_traffic: false,
      failure_reason: 'serving_load_proof_mismatch',
    });
    expect(report.deployments.matching_load_proof).toMatchObject({
      status: 'running',
      route_traffic: true,
      failure_reason: null,
      serving_load_proof: {
        deployment_id: 'adpl_contract01',
        adapter_id: 'adpt_contractproof',
        base_model: 'meta-llama/Llama-3.1-8B-Instruct',
        mode: 'single_adapter_live_merge',
        endpoint_id: 'adapter-proof-endpoint',
        artifact_checksum_sha256: 'a'.repeat(64),
      },
    });
    expect(report.deployments.renter_stopped_intent).toMatchObject({
      status: 'stopped',
      route_traffic: false,
      failure_reason: null,
      stopped_at: expect.any(String),
      serving_load_proof: {
        deployment_id: 'adpl_contract01',
        adapter_id: 'adpt_contractproof',
      },
    });
    expect(report.invariants.map((item) => item.name)).toEqual([
      'public deployment request cannot attach load proof',
      'mismatched load proof cannot route traffic',
      'artifact checksum mismatch cannot route traffic',
      'matching load proof is required before route traffic',
      'renter deployment list exposes verified running record',
      'renter stop disables route traffic without load-proof privileges',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'adapter-deployment-contract-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'adapter-deployment-contract-proof-latest.md'))).toBe(true);
  });
});
