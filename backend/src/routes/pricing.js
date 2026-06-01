'use strict';

const express = require('express');
const router = express.Router();
const { publicEndpointLimiter } = require('../middleware/rateLimiter');
const { GPU_RATE_TABLE, PRICING_CLASS_MULTIPLIERS, SAR_USD_RATE } = require('../config/pricing');

// GET /api/pricing/tiers
// Returns floor prices per GPU tier with competitor comparison.
// Anchor: RTX 4090 at $0.267/hr (23.7% below Vast.ai).
router.get('/tiers', publicEndpointLimiter, (req, res) => {
  const tiers = GPU_RATE_TABLE
    .filter(entry => entry.models[0] !== 'default')
    .map(entry => {
      const dcpSarPerHour = parseFloat((entry.rate_per_hour_usd * SAR_USD_RATE).toFixed(2));
      const vastSar = parseFloat((entry.competitor_prices.vast_ai * SAR_USD_RATE).toFixed(2));
      const savingsPct = vastSar > 0
        ? Math.max(0, Math.round(((vastSar - dcpSarPerHour) / vastSar) * 100))
        : 0;

      return {
        gpu_model: entry.models[0],
        display_name: entry.display_name,
        tier: entry.tier,
        min_vram_gb: entry.min_vram_gb,
        pricing: {
          rate_per_hour_usd: entry.rate_per_hour_usd,
          rate_per_hour_sar: dcpSarPerHour,
          rate_per_second_usd: entry.rate_per_second_usd,
        },
        competitor_prices: {
          vast_ai_usd: entry.competitor_prices.vast_ai,
          runpod_usd: entry.competitor_prices.runpod,
          aws_usd: entry.competitor_prices.aws,
          vast_ai_sar: vastSar,
          runpod_sar: parseFloat((entry.competitor_prices.runpod * SAR_USD_RATE).toFixed(2)),
          aws_sar: parseFloat((entry.competitor_prices.aws * SAR_USD_RATE).toFixed(2)),
        },
        savings_vs_vast_ai_pct: savingsPct,
      };
    });

  return res.json({
    generated_at: new Date().toISOString(),
    sar_usd_rate: SAR_USD_RATE,
    anchor_gpu: 'rtx 4090',
    anchor_rate_usd: 0.267,
    pricing_classes: PRICING_CLASS_MULTIPLIERS,
    tiers,
  });
});

// GET /api/pricing/arabic-rag
// Returns DCP price for the Arabic RAG bundle vs competitors (AWS Bedrock, Azure OpenAI).
// Competitor prices sourced from backend/src/config/pricing.js (March 2026 data).
// Usage scenario: 8h/day, 22 working days/month = 176h/month.
router.get('/arabic-rag', publicEndpointLimiter, (req, res) => {
  // DCP price: rag-pipeline job type at standard tier — 1.20 USD/hr
  // (BGE-M3 + reranker + ALLaM-7B on RTX 4090, Saudi electricity rates)
  const DCP_PRICE_USD_PER_HOUR = 1.20;
  const dcpSarPerHour = parseFloat((DCP_PRICE_USD_PER_HOUR * SAR_USD_RATE).toFixed(2));

  // Competitor pricing for equivalent Arabic RAG-as-a-service capability
  // (embedding + reranking + generation per hour of dedicated pipeline compute)
  const competitors = [
    {
      name: 'AWS Bedrock (Titan Embed + Rerank + Claude)',
      price_per_hour_usd: 8.50,
      notes: 'Pay-per-token; estimated at 50k tokens/hr typical RAG workload',
    },
    {
      name: 'Azure OpenAI (Ada embed + GPT-4o)',
      price_per_hour_usd: 6.80,
      notes: 'Pay-per-token; no Arabic-specialised reranker available',
    },
    {
      name: 'Vast.ai (RTX 4090 self-managed)',
      price_per_hour_usd: 0.35,
      notes: 'Compute only — no Arabic models, no managed pipeline, no PDPL compliance',
    },
  ];

  const HOURS_PER_MONTH = 8 * 22; // 8hr/day × 22 working days

  const withSavings = competitors.map(c => {
    const savingsPct = Math.round(((c.price_per_hour_usd - DCP_PRICE_USD_PER_HOUR) / c.price_per_hour_usd) * 100);
    return {
      ...c,
      price_per_hour_sar: parseFloat((c.price_per_hour_usd * SAR_USD_RATE).toFixed(2)),
      savings_vs_dcp_pct: Math.max(0, savingsPct),
      monthly_cost_usd: parseFloat((c.price_per_hour_usd * HOURS_PER_MONTH).toFixed(2)),
      monthly_cost_sar: parseFloat((c.price_per_hour_usd * SAR_USD_RATE * HOURS_PER_MONTH).toFixed(2)),
    };
  });

  return res.json({
    generated_at: new Date().toISOString(),
    sar_usd_rate: SAR_USD_RATE,
    bundle_id: 'arabic-rag',
    bundle_name: 'Arabic RAG Pipeline',
    bundle_components: ['BGE-M3 embeddings', 'BGE reranker-v2-m3', 'ALLaM 7B Instruct'],
    pdpl_compliant: true,
    dcp_pricing: {
      price_per_hour_usd: DCP_PRICE_USD_PER_HOUR,
      price_per_hour_sar: dcpSarPerHour,
      monthly_cost_usd: parseFloat((DCP_PRICE_USD_PER_HOUR * HOURS_PER_MONTH).toFixed(2)),
      monthly_cost_sar: parseFloat((DCP_PRICE_USD_PER_HOUR * SAR_USD_RATE * HOURS_PER_MONTH).toFixed(2)),
      usage_assumption: `${HOURS_PER_MONTH}h/month (8h/day × 22 working days)`,
    },
    competitors: withSavings,
  });
});

module.exports = router;
