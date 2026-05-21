-- 018_cost_rates_reclassify.sql
-- Fix the pricing surface drift surfaced by the 2026-05-21 audit:
--
--   1. `hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4` was priced at
--      1 halala/M — almost certainly a test seed left active. That is
--      $0.00027/M which is below ANY hosting cost. Bump to small floor.
--   2. The `large` class had ZERO rows even though we route to A3B-MoE
--      and 35B models. /pricing page rendered an empty "Large" column.
--   3. ~25 of the 35 cost_rates rows date to pre-017 (created 2026-03-19
--      through 2026-05-05) and got blanket-tagged `small` by 017's
--      backfill, leaving 30B+ MoE models priced like 7B models (200
--      halala/M vs the 400 the large class targets).
--
-- This migration UPDATEs each affected row to the correct class + rate
-- per the 5-class card decided 2026-05-20:
--
--    tiny      15 halala/M   $0.040   ≤3B params
--    small     30 halala/M   $0.080   7-9B dense
--    medium   150 halala/M   $0.400   14-32B dense, 27B-MTP
--    large    400 halala/M   $1.067   30B+ MoE, 35B dense
--    embedding  5 halala/M   $0.013   bge-m3 et al
--
-- A3B MoE models go in `large` because their VRAM footprint (16-22 GB
-- for the 30B variant) determines hosting cost, not active params.

-- ── 1. Fix the 1-halala/M outlier ──
UPDATE cost_rates SET token_rate_halala = 30, model_class = 'small'
 WHERE model = 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4';

-- ── 2. Promote A3B MoE + 35B models from small → large ──
UPDATE cost_rates SET token_rate_halala = 400, model_class = 'large'
 WHERE model IN (
   'qwen3:30b-a3b',
   'nemotron:30b-a3b',
   'Qwen/Qwen3-30B-A3B-GPTQ-Int4',
   'mlx-community/Qwen3-30B-A3B-4bit',
   'qwen3.5:35b-a3b',
   'qwen3.6-35b',
   'qwen3.6-35b-a3b'
 );

-- ── 3. Promote 14B class from small → medium ──
UPDATE cost_rates SET token_rate_halala = 150, model_class = 'medium'
 WHERE model IN (
   'qwen3:14b',
   'qwen2.5:14b',
   'Qwen/Qwen2.5-14B-Instruct-AWQ',
   'gemma3:27b'
 );

-- ── 4. Normalise rates inside `small` class to the 30 halala/M floor ──
-- Many small models drifted to 80-180 halala/M from pre-017 admin tweaks.
-- The class floor is 30 (small) per the 5-class card. Keep ALLaM/qwen3:8b
-- etc at 30. We do NOT touch the medium-rate (150) entries because those
-- happen to coincide with the medium-class floor and may legitimately
-- belong to medium — they get reclassified individually below.

-- 7-9B dense models that ended up at 80-180 halala — reset to 30:
UPDATE cost_rates SET token_rate_halala = 30, model_class = 'small'
 WHERE model IN (
   'deepseek-r1-distill-qwen-7b',
   'falcon-h1-7b-instruct',
   'qwen3:4b',
   'mlx-community/Qwen3-4B-4bit',
   'qwen2.5:7b',
   'mlx-community/Qwen3-8B-4bit',
   'mistral:7b',
   'llama3.1:8b',
   'deepseek-r1:7b',
   'glm4:9b',
   'Qwen/Qwen2.5-7B-Instruct-AWQ'
 );

-- ── 5. Verify __default__ is still small floor (already 30 per 017) ──
UPDATE cost_rates SET token_rate_halala = 30, model_class = 'small'
 WHERE model = '__default__' AND token_rate_halala <> 30;
