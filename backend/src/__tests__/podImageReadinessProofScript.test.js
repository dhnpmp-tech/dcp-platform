'use strict';

const fs = require('fs');
const path = require('path');
const {
  POD_IMAGE_READINESS_VERSION,
  buildPodImageReadiness,
} = require('../services/podImageReadiness');

const scriptPath = path.resolve(__dirname, '../../tests/pod-image-readiness-proof.js');

describe('pod image readiness proof script', () => {
  test('proof script references readiness route, roadmap gates, and false-claim guards', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');

    expect(source).toContain('/api/pods/images/readiness');
    expect(source).toContain('POD_IMAGE_CONTRACT_GATE');
    expect(source).toContain('LORA_PROVIDER_HOST_GATE');
    expect(source).toContain('claims_lora_pod_image_gpu_ready');
    expect(source).toContain('builds_image');
    expect(source).toContain('runs_docker');
  });

  test('builder exposes the expected contract version', () => {
    expect(buildPodImageReadiness().version).toBe(POD_IMAGE_READINESS_VERSION);
  });
});
