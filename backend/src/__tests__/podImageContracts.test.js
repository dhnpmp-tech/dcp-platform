const { verifyContracts } = require('../scripts/verify-pod-image-contracts');

describe('pod image contracts', () => {
  test('pre-baked pod image aliases, Dockerfiles, examples, and smoke scripts stay wired', () => {
    const result = verifyContracts();
    expect(result.errors).toEqual([]);
    expect(result.manifest.contract).toBe('dcp.pod_image_contracts.v1');
    expect(result.manifest.images.map((image) => image.alias).sort()).toEqual([
      'cuda',
      'lora',
      'pytorch',
      'ubuntu',
      'vllm',
    ]);
  });
});
