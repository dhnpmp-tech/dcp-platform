// Pod billing math — the prepaid contract: launch debits a full-duration
// quote; stop settles actual usage against it, clamped at the quote.
const {
  computePodStopSettlement,
  computePodQuoteHalala,
  validatePodImage,
} = require('../src/routes/pods');

describe('computePodQuoteHalala', () => {
  test('quotes duration × rate × gpuCount, ceiled', () => {
    // 60 min at the default interactive_pod rate (2 halala/min => 2/60 per gpu-second)
    expect(computePodQuoteHalala({ durationSeconds: 3600, ratePerGpuSecond: 2 / 60, gpuCount: 1 })).toBe(120);
    expect(computePodQuoteHalala({ durationSeconds: 3600, ratePerGpuSecond: 2 / 60, gpuCount: 2 })).toBe(240);
    // sub-halala fractions round UP (never undercharge the quote)
    expect(computePodQuoteHalala({ durationSeconds: 30, ratePerGpuSecond: 2 / 60, gpuCount: 1 })).toBe(1);
  });

  test('never negative', () => {
    expect(computePodQuoteHalala({ durationSeconds: 0, ratePerGpuSecond: 2 / 60, gpuCount: 1 })).toBe(0);
  });
});

describe('computePodStopSettlement', () => {
  const HOUR_QUOTE = 120; // 60 min × 2 halala/min

  test('early stop refunds unused time, provider earns 75% of actual', () => {
    // stopped after 10 of 60 minutes
    const s = computePodStopSettlement({
      costHalala: HOUR_QUOTE,
      startedAtMs: 0,
      nowMs: 10 * 60 * 1000,
      ratePerGpuSecond: 2 / 60,
      gpuCount: 1,
    });
    expect(s.actualCostHalala).toBe(20);
    expect(s.providerEarnedHalala).toBe(15);
    expect(s.dc1FeeHalala).toBe(5);
    expect(s.refundHalala).toBe(100);
    expect(s.actualCostHalala + s.refundHalala).toBe(HOUR_QUOTE); // money conserved
  });

  test('charge is clamped at the prepaid quote (late stop never charges extra)', () => {
    const s = computePodStopSettlement({
      costHalala: HOUR_QUOTE,
      startedAtMs: 0,
      nowMs: 3 * 60 * 60 * 1000, // 3h elapsed on a 1h quote (clock skew / late teardown)
      ratePerGpuSecond: 2 / 60,
      gpuCount: 1,
    });
    expect(s.actualCostHalala).toBe(HOUR_QUOTE);
    expect(s.refundHalala).toBe(0);
  });

  test('instant stop charges the ceiling of one second slice, refunds the rest', () => {
    const s = computePodStopSettlement({
      costHalala: HOUR_QUOTE,
      startedAtMs: 0,
      nowMs: 1000,
      ratePerGpuSecond: 2 / 60,
      gpuCount: 1,
    });
    expect(s.actualCostHalala).toBe(1);
    expect(s.refundHalala).toBe(HOUR_QUOTE - 1);
  });

  test('provider share + fee always reconstruct the charge exactly', () => {
    for (const minutes of [1, 7, 33, 59]) {
      const s = computePodStopSettlement({
        costHalala: HOUR_QUOTE,
        startedAtMs: 0,
        nowMs: minutes * 60 * 1000,
        ratePerGpuSecond: 2 / 60,
        gpuCount: 1,
      });
      expect(s.providerEarnedHalala + s.dc1FeeHalala).toBe(s.actualCostHalala);
      expect(s.providerEarnedHalala).toBe(Math.floor(s.actualCostHalala * 0.75));
    }
  });

  test('zero/garbage prepaid never produces negative money', () => {
    const s = computePodStopSettlement({
      costHalala: null,
      startedAtMs: 0,
      nowMs: 60_000,
      ratePerGpuSecond: 2 / 60,
      gpuCount: 1,
    });
    expect(s.actualCostHalala).toBe(0);
    expect(s.refundHalala).toBe(0);
    expect(s.providerEarnedHalala).toBe(0);
  });
});

describe('validatePodImage', () => {
  test('maps LoRA alias to the pre-baked fat pod image without SSH bootstrap', () => {
    expect(validatePodImage('lora')).toEqual({
      image: 'dcp-compute:lora',
      bootstrap: false,
    });
  });

  test('treats literal dcp-compute LoRA tags as pre-baked images', () => {
    expect(validatePodImage('dcp-compute:lora')).toEqual({
      image: 'dcp-compute:lora',
      bootstrap: false,
    });
  });
});
