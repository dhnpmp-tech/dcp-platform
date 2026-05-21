-- 017_cost_rates_model_class.sql
-- Per-class PAYG rate card (decided Peter 2026-05-20 after competitor
-- analysis). The pre-016 cost_rates seed was calibrated for small models
-- (Mistral 7B, Llama-3-8B, TinyLlama) at 10-22 halala/M and routed all
-- premium models to __default__=19 halala/M, which is below cost for
-- 27B+ class.
--
-- New 5-class rate card:
--   tiny      15 halala/M  ($0.04/M)   TinyLlama, qwen2.5vl:3b
--   small     30 halala/M  ($0.08/M)   qwen3:8b, Mistral-7B, Llama-3-8B,
--                                      Phi-3-mini, Gemma-2b, ALLaM-7B
--   medium   150 halala/M  ($0.40/M)   Qwen3.6-27B-MTP, Qwen2.5-Coder-32B
--   large    400 halala/M  ($1.07/M)   Future 70B class
--   embedding  5 halala/M  ($0.013/M)  bge-m3
--
-- __default__ raised 19 → 30 halala/M (small floor) so unmapped models
-- never route below cost.

ALTER TABLE cost_rates ADD COLUMN model_class TEXT;

-- Backfill existing rows by current rate (heuristic — exact assignments
-- below override)
UPDATE cost_rates SET model_class = 'small'  WHERE model_class IS NULL;

-- Authoritative model→class assignments. UPSERT pattern: insert if new,
-- update rate+class if exists.

-- ── tiny ──
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('TinyLlama/TinyLlama-1.1B-Chat-v1.0', 15, 'tiny', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 15, model_class = 'tiny';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('qwen2.5vl:3b', 15, 'tiny', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 15, model_class = 'tiny';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('google/gemma-2b-it', 15, 'tiny', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 15, model_class = 'tiny';

-- ── small ──
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('mistralai/Mistral-7B-Instruct-v0.2', 30, 'small', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 30, model_class = 'small';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('meta-llama/Meta-Llama-3-8B-Instruct', 30, 'small', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 30, model_class = 'small';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('microsoft/Phi-3-mini-4k-instruct', 30, 'small', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 30, model_class = 'small';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('qwen3:8b', 30, 'small', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 30, model_class = 'small';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('humain-ai/ALLaM-7B-Instruct-preview', 30, 'small', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 30, model_class = 'small';

-- ── medium (flagship tier) ──
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('qwen3.6-27b-mtp', 150, 'medium', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 150, model_class = 'medium';
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('Qwen/Qwen2.5-Coder-32B-Instruct', 150, 'medium', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 150, model_class = 'medium';

-- ── large (future) ──
-- Reserved for 70B+ class. No seed rows; admin adds explicitly.

-- ── embedding ──
INSERT INTO cost_rates (model, token_rate_halala, model_class, is_active, created_at)
  VALUES ('bge-m3', 5, 'embedding', 1, datetime('now'))
  ON CONFLICT(model) DO UPDATE SET token_rate_halala = 5, model_class = 'embedding';

-- ── __default__ raised to small-class floor ──
UPDATE cost_rates
   SET token_rate_halala = 30, model_class = 'small'
 WHERE model = '__default__';

CREATE INDEX IF NOT EXISTS idx_cost_rates_class ON cost_rates(model_class);
