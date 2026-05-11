-- 011_per_token_rates.sql
-- Per docs/pricing/PRICING-REDESIGN-2026-05-11.md
--
-- model_registry: per-1M-token rates (separate input vs output). Migration
-- 008 added ollama_pull_uri etc — this migration adds the billing fields.
--
-- providers: per-provider overrides for cases where a provider negotiates
-- a different rate.

ALTER TABLE model_registry ADD COLUMN price_in_halala_per_1m_tok INTEGER;
ALTER TABLE model_registry ADD COLUMN price_out_halala_per_1m_tok INTEGER;

ALTER TABLE providers ADD COLUMN price_in_halala_per_1m_tok_override INTEGER;
ALTER TABLE providers ADD COLUMN price_out_halala_per_1m_tok_override INTEGER;

-- Seed the rate card from the spec. Tier inferred from min_gpu_vram_gb.
--
-- Halala (1 SAR = 100 halala). USD ≈ SAR / 3.75.
--
-- Tier         | In (halala) | Out (halala) | ≈ USD/1M in | ≈ USD/1M out
-- Embeddings   |     8       |      0       |  $0.02      |  n/a
-- Small ≤9B    |    30       |     60       |  $0.08      |  $0.16
-- Mid 10-30B   |    80       |    150       |  $0.21      |  $0.40
-- Large 30-70B |   260       |    940       |  $0.69      |  $2.51

-- Embeddings / reranker (no completion tokens)
UPDATE model_registry SET
  price_in_halala_per_1m_tok = 8,
  price_out_halala_per_1m_tok = 0
WHERE (LOWER(family) IN ('embedding', 'reranker')
       OR LOWER(model_id) LIKE '%embed%'
       OR LOWER(model_id) LIKE '%rerank%'
       OR LOWER(model_id) LIKE '%bge%')
  AND price_in_halala_per_1m_tok IS NULL;

-- Small tier — vram ≤ 9 GB
UPDATE model_registry SET
  price_in_halala_per_1m_tok = 30,
  price_out_halala_per_1m_tok = 60
WHERE min_gpu_vram_gb IS NOT NULL
  AND min_gpu_vram_gb <= 9
  AND price_in_halala_per_1m_tok IS NULL;

-- Mid tier — 10 ≤ vram ≤ 30 GB
UPDATE model_registry SET
  price_in_halala_per_1m_tok = 80,
  price_out_halala_per_1m_tok = 150
WHERE min_gpu_vram_gb IS NOT NULL
  AND min_gpu_vram_gb > 9 AND min_gpu_vram_gb <= 30
  AND price_in_halala_per_1m_tok IS NULL;

-- Large tier — vram > 30 GB
UPDATE model_registry SET
  price_in_halala_per_1m_tok = 260,
  price_out_halala_per_1m_tok = 940
WHERE min_gpu_vram_gb IS NOT NULL
  AND min_gpu_vram_gb > 30
  AND price_in_halala_per_1m_tok IS NULL;

-- Fallback: rows without min_gpu_vram_gb get Small-tier as the safest
-- default (we'd rather under-charge than scare a renter with Large pricing
-- on a row we can't classify).
UPDATE model_registry SET
  price_in_halala_per_1m_tok = 30,
  price_out_halala_per_1m_tok = 60
WHERE price_in_halala_per_1m_tok IS NULL;
