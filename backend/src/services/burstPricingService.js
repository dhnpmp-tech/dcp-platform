// Burst pricing service — the audited, in-repo port of the cost-plus repricing
// that the external VPS script /root/dcp-burst/stock-refresh.py applies every
// few minutes to providers.cost_per_gpu_second_halala for is_burst rows.
//
// WHY this exists in the repo (not just on the VPS):
//   The cost-plus formula that turns a live RunPod Secure Cloud USD/hr price
//   into the per-GPU-second halala a renter is actually billed used to live
//   ONLY in an untracked, unaudited VPS cron script. Any drift between that
//   script and the backend's expectations would silently misprice every burst
//   GPU. This module is the canonical, tested source of the formula; the VPS
//   script is the runtime that writes it to the DB.
//
// Invisibility rule: never name the upstream broker (RunPod) or the markup to
// renters. The displayed price is just "DCP SAR/hr". This module never returns
// a broker name either — it is a pure numeric transform.
//
// Formula (kept byte-identical to stock-refresh.py):
//   halala_per_gpu_second = usd_per_hour / 3600
//                          × USD_TO_SAR            (3.75)
//                          × SAR_TO_HALALA         (100)
//                          × MARKUP                (1.40)
//
// `usd_per_hour / 3600` is USD-per-second. × 3.75 → SAR-per-second. × 100 →
// halala-per-second. × 1.40 → DCP billed halala-per-second (cost + 40% margin).
//
// All inputs/outputs are plain numbers (no DB, no I/O) so this is trivially
// unit-testable. The DB-touching reprice loop stays in the VPS script; a future
// task can move it here once we want the backend to own the refresh cron.

'use strict'

// Constants are exported so the VPS script (and tests) can import the EXACT
// values the backend expects, instead of re-declaring them and drifting.
const USD_TO_SAR = 3.75
const SAR_TO_HALALA = 100
const MARKUP = 1.4

/**
 * Pure cost-plus transform: live upstream USD/hr → per-GPU-second halala.
 *
 * @param {number} usdPerHour - Live Secure Cloud uninterruptablePrice (USD/hr).
 *   Must be a positive finite number. null/undefined/non-positive → null
 *   (matches stock-refresh.py's "no live price → leave existing price
 *   UNCHANGED, never zero it" contract).
 * @param {object} [opts] - Optional overrides for testing / what-if.
 * @param {number} [opts.usdToSar=3.75] - USD→SAR FX rate.
 * @param {number} [opts.sarToHalala=100] - SAR→halala fixed conversion.
 * @param {number} [opts.markup=1.4] - Cost-plus margin multiplier (1.4 = +40%).
 * @returns {number|null} halala per GPU-second, or null if input is unusable.
 */
function computeCostPerGpuSecondHalala(usdPerHour, opts) {
  if (typeof usdPerHour !== 'number' || !Number.isFinite(usdPerHour) || usdPerHour <= 0) {
    return null
  }
  const usdToSar = typeof opts?.usdToSar === 'number' && opts.usdToSar > 0 ? opts.usdToSar : USD_TO_SAR
  const sarToHalala = typeof opts?.sarToHalala === 'number' && opts.sarToHalala > 0 ? opts.sarToHalala : SAR_TO_HALALA
  const markup = typeof opts?.markup === 'number' && opts.markup > 0 ? opts.markup : MARKUP

  // stock-refresh.py writes the RAW FLOAT to cost_per_gpu_second_halala — it
  // does NOT round. Per-GPU-second halala is fractional (e.g. $2.49/hr upstream
  // → 0.363 halala/sec); the fractional value is essential because billing
  // multiplies it by elapsed seconds (3600s × 0.363 ≈ 1307 halala = 13.07 SAR).
  // Rounding to integer-per-second would zero any sub-$3.50/hr GPU. Return the
  // raw float to stay byte-identical to the VPS script. Settlement rounds once,
  // at the final halala charge, not per-second.
  return (usdPerHour / 3600) * usdToSar * sarToHalala * markup
}

/**
 * Convenience: per-GPU-second halala → SAR-per-hour, the unit shown to renters.
 * sar_per_hour = halala_per_second × 3600 / 100  (= halala × 36).
 * @param {number} halalaPerSecond
 * @returns {number|null}
 */
function halalaPerSecondToSarPerHour(halalaPerSecond) {
  if (typeof halalaPerSecond !== 'number' || !Number.isFinite(halalaPerSecond) || halalaPerSecond < 0) {
    return null
  }
  return Number((halalaPerSecond * 3600 / 100).toFixed(4))
}

module.exports = {
  USD_TO_SAR,
  SAR_TO_HALALA,
  MARKUP,
  computeCostPerGpuSecondHalala,
  halalaPerSecondToSarPerHour,
}