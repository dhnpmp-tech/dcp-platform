-- 024_burst_gpu_grid_expand_to_12.sql
-- Burst grid expansion: 8 -> 13 on-demand GPU types.
--
-- Adds 5 new is_burst=1 provider rows so GET /api/renters/available-providers
-- (the live home grid) exposes 13 NVIDIA GPU types. Each row is a synthetic
-- "GPU type capacity" row; the actual machine is launched on-demand and brokered
-- invisibly (renters only ever see the public NVIDIA gpu_model label, never the
-- backing vendor).
--
-- gpu_model == burst_gpu_type_id VERBATIM (the RunPod gpuTypes.id the launcher
-- passes as gpuTypeIds:[...]; resolveGpuType in routes/pods.js substring-matches
-- the alias needle against gpu_model).
--
-- cost_per_gpu_second_halala is COST-PLUS, seeded from the live RunPod Secure
-- Cloud uninterruptablePrice at insert time:
--   halala/s = usd_per_hr / 3600 * 3.75 (SAR/USD) * 100 (halala/SAR) * 1.4 (margin)
-- The stock-refresh cron (every 4 min) overwrites this live from RunPod's secure
-- price and flips status/stock_available from real secure-cloud availability, so
-- these seeds are a correct initial value the cron self-heals.
--
-- Seed snapshot (live secure uninterruptablePrice, 2026-06-19):
--   RTX PRO 6000 Blackwell Server Edition  96GB  $2.09/hr  -> 10.97 SAR/hr  0.304791667 halala/s
--   RTX PRO 4500 Blackwell                 32GB  $0.74/hr  ->  3.89 SAR/hr  0.107916667 halala/s
--   A100-SXM4-80GB                         80GB  $1.49/hr  ->  7.82 SAR/hr  0.217291667 halala/s
--   H100 NVL                               94GB  $3.19/hr  -> 16.75 SAR/hr  0.465208333 halala/s
--
-- Idempotent: INSERT OR IGNORE keyed on the UNIQUE email column.

INSERT OR IGNORE INTO providers
  (id, name, email, gpu_model, gpu_count, vram_gb, os, status, gpu_vram_mib,
   cost_per_gpu_second_halala, approval_status, is_paused, is_burst,
   burst_gpu_type_id, stock_available, accepting_jobs)
VALUES
  (1781798914179, 'NVIDIA RTX PRO 6000', 'burst-rtxpro6000@dcp.internal',
   'NVIDIA RTX PRO 6000 Blackwell Server Edition', 1, 96, 'linux', 'online', 98304,
   0.304791667, 'approved', 0, 1, 'NVIDIA RTX PRO 6000 Blackwell Server Edition', 1, 1),
  (1781798914180, 'NVIDIA RTX PRO 4500', 'burst-rtxpro4500@dcp.internal',
   'NVIDIA RTX PRO 4500 Blackwell', 1, 32, 'linux', 'online', 32768,
   0.107916667, 'approved', 0, 1, 'NVIDIA RTX PRO 4500 Blackwell', 1, 1),
  (1781798914181, 'NVIDIA A100 SXM 80GB', 'burst-a100sxm80@dcp.internal',
   'NVIDIA A100-SXM4-80GB', 1, 80, 'linux', 'online', 81920,
   0.217291667, 'approved', 0, 1, 'NVIDIA A100-SXM4-80GB', 1, 1),
  (1781798914182, 'NVIDIA H100 NVL', 'burst-h100nvl@dcp.internal',
   'NVIDIA H100 NVL', 1, 94, 'linux', 'online', 96256,
   0.465208333, 'approved', 0, 1, 'NVIDIA H100 NVL', 1, 1),
  -- B200 (Blackwell datacenter flagship, sm_100). 180GB HBM3e. Launched on the
  -- cu128 image. Cost-plus seed matches the live RunPod Secure price snapshot
  -- (0.858958333 halala/s ~= $8.25/hr at 3.75 SAR/USD); stock cron self-heals it.
  (1781798914183, 'NVIDIA B200', 'burst-b200@dcp.internal',
   'NVIDIA B200', 1, 180, 'linux', 'online', 184320,
   0.858958333, 'approved', 0, 1, 'NVIDIA B200', 1, 1);
