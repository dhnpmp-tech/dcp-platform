const { verifyContracts } = require('../scripts/verify-pod-image-contracts');
const rootPackage = require('../../../package.json');
const backendPackage = require('../../package.json');

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

  test('LoRA pod image provider-host proof command stays wired', () => {
    expect(rootPackage.scripts['proof:lora-pod-image']).toBe(
      'npm --prefix backend run test:reliability:lora-pod-image-proof',
    );
    expect(backendPackage.scripts['test:reliability:lora-pod-image-proof']).toBe(
      'bash docker-templates/verify-lora-pod-image.sh',
    );
  });
});
