'use strict';

// coding-models.js — the curated coding-model catalog for the `dcp` launcher
// surface (GET /v1/coding/models + the /anthropic billing rates).
//
// Curation is deliberate: only models proven to hold up inside Claude Code's
// tool-use loop on DCP's consumer-GPU tier belong here — this is what the CLI
// shows in its picker, not a dump of everything any provider serves.
// Override via DCP_CODING_MODELS (JSON array of descriptors) without a deploy.

const IN_RATE_HALALA_PER_1M = Number(process.env.DCP_ANTHROPIC_IN_RATE_HALALA_PER_1M || 150);
const OUT_RATE_HALALA_PER_1M = Number(process.env.DCP_ANTHROPIC_OUT_RATE_HALALA_PER_1M || 400);

const DEFAULT_CODING_MODELS = [
  {
    id: 'qwen3-30b-a3b',
    label: 'Qwen3 30B A3B (GPTQ-Int4)',
    vram_gb: 24,
  },
];

function curatedCodingModels() {
  const raw = process.env.DCP_CODING_MODELS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (err) {
      console.error('[coding-models] DCP_CODING_MODELS is not valid JSON — using defaults:', err.message);
    }
  }
  return DEFAULT_CODING_MODELS;
}

module.exports = {
  curatedCodingModels,
  IN_RATE_HALALA_PER_1M,
  OUT_RATE_HALALA_PER_1M,
};
