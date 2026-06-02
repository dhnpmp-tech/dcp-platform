-- Seed model_registry table with real model data for OpenRouter compatibility
-- Run this migration to populate an empty model_registry
-- Usage: sqlite3 providers.db < migrations/seed_model_registry.sql

BEGIN TRANSACTION;

INSERT OR IGNORE INTO model_registry
  (model_id, display_name, family, vram_gb, quantization, context_window, use_cases, min_gpu_vram_gb, default_price_halala_per_min, is_active, prewarm_class, created_at)
VALUES
  ('mistralai/Mistral-7B-Instruct-v0.2', 'Mistral 7B Instruct', 'mistral', 14, 'bf16', 32768, '["chat","coding","arabic"]', 16, 15, 1, 'warm', datetime('now')),
  ('meta-llama/Meta-Llama-3-8B-Instruct', 'LLaMA 3 8B Instruct', 'llama', 16, 'bf16', 8192, '["chat","reasoning"]', 16, 17, 1, 'warm', datetime('now')),
  ('Qwen/Qwen2-7B-Instruct', 'Qwen2 7B Instruct', 'qwen', 14, 'bf16', 32768, '["chat","arabic","translation"]', 16, 14, 1, 'warm', datetime('now')),
  ('microsoft/Phi-3-mini-4k-instruct', 'Phi-3 Mini', 'phi', 4, 'int4', 4096, '["chat","classification"]', 6, 8, 1, 'warm', datetime('now')),
  ('deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', 'DeepSeek R1 7B', 'deepseek', 16, 'bf16', 32768, '["reasoning","coding"]', 16, 18, 1, 'warm', datetime('now')),
  ('ALLaM-AI/ALLaM-7B-Instruct-preview', 'ALLaM 7B Instruct', 'allam', 24, 'bf16', 8192, '["arabic","chat","enterprise"]', 24, 22, 1, 'warm', datetime('now')),
  ('tiiuae/Falcon-H1-7B-Instruct', 'Falcon H1 7B Instruct', 'falcon', 24, 'bf16', 8192, '["arabic","chat","reasoning"]', 24, 20, 1, 'warm', datetime('now')),
  ('inceptionai/jais-13b-chat', 'JAIS 13B Chat', 'jais', 24, 'bf16', 4096, '["arabic","chat","enterprise"]', 24, 27, 1, 'warm', datetime('now')),
  ('BAAI/bge-m3', 'BGE M3 Embeddings', 'embedding', 8, 'fp16', 8192, '["embedding","rag","retrieval"]', 8, 12, 1, 'warm', datetime('now')),
  ('BAAI/bge-reranker-v2-m3', 'BGE Reranker v2 M3', 'reranker', 8, 'fp16', 4096, '["reranking","rag","search"]', 8, 14, 1, 'warm', datetime('now')),
  ('qwen2.5vl:3b', 'Qwen2.5-VL 3B Instruct', 'qwen', 8, 'int4', 32768, '["vision","chat","multimodal"]', 8, 15, 1, 'warm', datetime('now')),
  ('stabilityai/stable-diffusion-xl-base-1.0', 'Stable Diffusion XL Base 1.0', 'diffusion', 16, 'fp16', 2048, '["image-generation","creative","marketing"]', 16, 30, 1, 'warm', datetime('now'));

-- Seed cost_rates for per-token billing (if cost_rates table exists)
INSERT OR IGNORE INTO cost_rates (model, token_rate_halala, is_active, created_at)
SELECT model_id, 
       CASE 
         WHEN family = 'nemotron' AND vram_gb >= 70 THEN 10
         WHEN family = 'llama' AND vram_gb >= 70 THEN 10
         WHEN family = 'qwen' AND vram_gb >= 70 THEN 10
         WHEN family = 'diffusion' THEN 2
         WHEN family = 'reranker' THEN 1
         WHEN family = 'embedding' THEN 1
         WHEN family = 'jais' THEN 4
         WHEN family = 'allam' THEN 3
         WHEN family = 'falcon' THEN 3
         WHEN family = 'llama' THEN 3
         WHEN family = 'qwen' THEN 2
         WHEN family = 'mistral' THEN 2
         WHEN family = 'phi' THEN 1
         WHEN family = 'deepseek' THEN 3
         ELSE 2
       END,
       1, datetime('now')
FROM model_registry
WHERE NOT EXISTS (SELECT 1 FROM cost_rates WHERE cost_rates.model = model_registry.model_id);

COMMIT;
