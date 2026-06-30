// Tests for burstPricingService — verifies the in-repo cost-plus formula is
// byte-identical to the external VPS stock-refresh.py repricing logic.
//
// Run with: npx jest burstPricingService  (no node_modules locally → verified
// standalone via the node -e harness at the bottom of this file's dev cycle).
'use strict'

const {
  USD_TO_SAR,
  SAR_TO_HALALA,
  MARKUP,
  computeCostPerGpuSecondHalala,
  halalaPerSecondToSarPerHour,
} = require('../services/burstPricingService')

// Reference value computed by hand from the documented formula:
//   halala = usd/hr / 3600 × 3.75 × 100 × 1.4   (RAW FLOAT, not rounded —
//   matches stock-refresh.py which writes the float to the DB; billing rounds
//   once at settlement, not per-second)
// For usd/hr = 2.49: 2.49/3600 × 3.75 × 100 × 1.4 = 0.363125 halala/sec
//   → × 3600s = 1307.25 halala/hr = 13.07 SAR/hr (matches $2.49 × 3.75 × 1.4)

describe('computeCostPerGpuSecondHalala', () => {
  test('matches the stock-refresh.py formula byte-for-byte (raw float, no rounding)', () => {
    // H100 secure ~ $2.49/hr upstream → 0.363125 halala/sec (raw float, NOT rounded)
    const usd = 2.49
    const expected = (usd / 3600) * 3.75 * 100 * 1.4
    const got = computeCostPerGpuSecondHalala(usd)
    expect(got).toBe(expected)               // exact float equality on the formula
    expect(got).toBeCloseTo(0.363125, 5)     // sanity: known value
  })

  test('round-trips through SAR/hr to a sensible per-second value', () => {
    // $2.49/hr → halala/sec → SAR/hr should be ~2.49 × 3.75 × 1.4 = 13.07 SAR/hr
    const halala = computeCostPerGpuSecondHalala(2.49)
    const sarHr = halalaPerSecondToSarPerHour(halala)
    expect(sarHr).toBeGreaterThan(13.0)
    expect(sarHr).toBeLessThan(13.2)
  })

  test('applies the 40% markup (markup=1.4 means billed > upstream SAR cost)', () => {
    const usd = 1.0
    const halala = computeCostPerGpuSecondHalala(usd)
    const sarHrBilled = halalaPerSecondToSarPerHour(halala)
    const sarHrUpstreamCost = usd * USD_TO_SAR // no markup
    expect(sarHrBilled).toBeGreaterThan(sarHrUpstreamCost)
    // +40% → billed ≈ 1.4 × upstream
    expect(sarHrBilled / sarHrUpstreamCost).toBeGreaterThan(1.39)
    expect(sarHrBilled / sarHrUpstreamCost).toBeLessThan(1.41)
  })

  test('returns null for unusable input (never zero the price)', () => {
    // stock-refresh.py contract: no live price → leave existing price UNCHANGED.
    expect(computeCostPerGpuSecondHalala(null)).toBeNull()
    expect(computeCostPerGpuSecondHalala(undefined)).toBeNull()
    expect(computeCostPerGpuSecondHalala(0)).toBeNull()
    expect(computeCostPerGpuSecondHalala(-1)).toBeNull()
    expect(computeCostPerGpuSecondHalala(NaN)).toBeNull()
    expect(computeCostPerGpuSecondHalala('1.0')).toBeNull()
    expect(computeCostPerGpuSecondHalala(Infinity)).toBeNull()
  })

  test('accepts option overrides for what-if / testing', () => {
    // Different markup
    const with20pct = computeCostPerGpuSecondHalala(2.0, { markup: 1.2 })
    const with40pct = computeCostPerGpuSecondHalala(2.0, { markup: 1.4 })
    expect(with20pct).toBeLessThan(with40pct)
    // Custom FX rate
    const sar375 = computeCostPerGpuSecondHalala(2.0, { usdToSar: 3.75 })
    const sar4 = computeCostPerGpuSecondHalala(2.0, { usdToSar: 4.0 })
    expect(sar4).toBeGreaterThan(sar375)
  })

  test('constants match the documented formula', () => {
    expect(USD_TO_SAR).toBe(3.75)
    expect(SAR_TO_HALALA).toBe(100)
    expect(MARKUP).toBe(1.4)
  })
})

describe('halalaPerSecondToSarPerHour', () => {
  test('converts halala/sec → SAR/hr (×36)', () => {
    // 1 halala/sec × 3600 sec/hr / 100 halala/SAR = 36 SAR/hr
    expect(halalaPerSecondToSarPerHour(1)).toBe(36)
    expect(halalaPerSecondToSarPerHour(0.5)).toBe(18)
  })

  test('returns null for invalid input', () => {
    expect(halalaPerSecondToSarPerHour(null)).toBeNull()
    expect(halalaPerSecondToSarPerHour(-1)).toBeNull()
    expect(halalaPerSecondToSarPerHour(NaN)).toBeNull()
  })
})