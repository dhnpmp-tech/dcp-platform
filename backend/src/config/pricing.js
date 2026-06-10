'use strict';

/**
 * DCP Pricing Configuration
 *
 * Floor prices configured here from the current public pricing model.
 * These are renter-facing prices, 23-51% below competitors at Saudi energy rates.
 *
 * Currency: all USD prices converted to halala at 1 USD = SAR_USD_RATE SAR,
 * 100 halala = 1 SAR. Use pricingService.js for runtime conversions.
 */

// SAR/USD exchange rate. Override via env var for live FX updates.
const SAR_USD_RATE = parseFloat(process.env.SAR_USD_RATE || '3.75');

/**
 * GPU model rate table.
 * Keys are canonical model strings matched against provider.gpu_model (case-insensitive prefix match).
 *
 * rate_per_hour_usd  — DCP floor price charged to renters (USD/hr)
 * rate_per_second_usd — rate_per_hour_usd / 3600 (USD/sec)
 * tier               — 'entry' | 'standard' | 'high' | 'enterprise'
 * min_vram_gb        — minimum VRAM for competitor tier lookup
 * competitor_prices  — USD/hr for display; sourced from strategic brief
 */
const GPU_RATE_TABLE = [
  {
    models: ['h200'],
    display_name: 'NVIDIA H200',
    rate_per_hour_usd: 2.450,
    rate_per_second_usd: 0.000681,
    tier: 'enterprise',
    min_vram_gb: 141,
    competitor_prices: { vast_ai: 4.50, runpod: 5.49, aws: 8.00 },
  },
  {
    models: ['h100'],
    display_name: 'NVIDIA H100',
    rate_per_hour_usd: 1.890,
    rate_per_second_usd: 0.000525,
    tier: 'enterprise',
    min_vram_gb: 80,
    competitor_prices: { vast_ai: 2.50, runpod: 3.49, aws: 5.67 },
  },
  {
    models: ['a100'],
    display_name: 'NVIDIA A100',
    rate_per_hour_usd: 1.200,
    rate_per_second_usd: 0.000333,
    tier: 'high',
    min_vram_gb: 40,
    competitor_prices: { vast_ai: 1.89, runpod: 2.29, aws: 3.06 },
  },
  {
    models: ['rtx 4090', 'rtx4090', 'geforce rtx 4090'],
    display_name: 'NVIDIA RTX 4090',
    rate_per_hour_usd: 0.267,
    rate_per_second_usd: 0.0000742,
    tier: 'standard',
    min_vram_gb: 24,
    competitor_prices: { vast_ai: 0.350, runpod: 0.440, aws: 0.750 },
  },
  {
    models: ['rtx 4080', 'rtx4080', 'geforce rtx 4080'],
    display_name: 'NVIDIA RTX 4080',
    rate_per_hour_usd: 0.178,
    rate_per_second_usd: 0.0000494,
    tier: 'standard',
    min_vram_gb: 16,
    competitor_prices: { vast_ai: 0.230, runpod: 0.290, aws: 0.500 },
  },
  {
    models: ['rtx 3090', 'rtx3090', 'geforce rtx 3090'],
    display_name: 'NVIDIA RTX 3090',
    rate_per_hour_usd: 0.134,
    rate_per_second_usd: 0.0000372,
    tier: 'standard',
    min_vram_gb: 24,
    competitor_prices: { vast_ai: 0.200, runpod: 0.240, aws: 0.400 },
  },
  {
    models: ['rtx 3080', 'rtx3080', 'geforce rtx 3080'],
    display_name: 'NVIDIA RTX 3080',
    rate_per_hour_usd: 0.089,
    rate_per_second_usd: 0.0000247,
    tier: 'entry',
    min_vram_gb: 10,
    competitor_prices: { vast_ai: 0.130, runpod: 0.160, aws: 0.280 },
  },
  {
    // Fallback for unrecognised GPUs — conservative entry-tier rate
    models: ['default'],
    display_name: 'GPU (Standard)',
    rate_per_hour_usd: 0.089,
    rate_per_second_usd: 0.0000247,
    tier: 'entry',
    min_vram_gb: 0,
    competitor_prices: { vast_ai: 0.130, runpod: 0.160, aws: 0.280 },
  },
];

/**
 * Pricing-class surcharge multipliers applied on top of GPU base rate.
 * 'priority'  — guaranteed <30s queue wait, +20% surcharge
 * 'standard'  — baseline
 * 'economy'   — best-effort, -10% discount
 */
const PRICING_CLASS_MULTIPLIERS = {
  priority: 1.20,
  standard: 1.00,
  economy: 0.90,
};

/**
 * Job-type base rates in halala/min, used when no gpu_model is available.
 * Kept for backward compatibility with existing job-type-only submissions.
 * 100 halala = 1 SAR; at SAR_USD_RATE=3.75: 1 halala/min ≈ $0.0444/hr.
 */
const JOB_TYPE_RATES_HALALA_PER_MIN = {
  'llm-inference': 9,
  'llm_inference': 9,
  'training': 7,
  'rendering': 10,
  'image_generation': 10,
  'vllm_serve': 9,
  'rag-pipeline': 15,
  'custom_container': 7,
  // Whole-GPU interactive pods: 2 halala/min ≈ 1.20 SAR/hr/GPU (~$0.32/hr) —
  // inside the consumer-tier market band (vast.ai 3090 ≈ SAR 0.53-0.68/hr,
  // RunPod community ≈ SAR 0.83, RunPod secure ≈ SAR 1.73). Providers can
  // override via cost_per_gpu_second_halala. Adjust here as pricing strategy.
  'interactive_pod': 2,
  'default': 6,
};

const STORAGE_RATE_HALALA_PER_GB_MONTH = 50;
const BANDWIDTH_RATE_HALALA_PER_GB = 10;

module.exports = {
  SAR_USD_RATE,
  GPU_RATE_TABLE,
  PRICING_CLASS_MULTIPLIERS,
  JOB_TYPE_RATES_HALALA_PER_MIN,
  STORAGE_RATE_HALALA_PER_GB_MONTH,
  BANDWIDTH_RATE_HALALA_PER_GB,
};
