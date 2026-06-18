-- 024_burst_pods.sql
-- Burst / partner-compute provider type: a renter can launch a pod on a GPU DCP does
-- not physically own; the backend brokers it on an external partner cloud and runs OUR
-- daemon inside it, relayed through our VPS, so the renter's experience is identical to
-- a native (Node 2) pod. The vendor is never surfaced anywhere — internal naming only.
--
-- Pricing is cost-plus: cost_per_gpu_second_halala = partner_usd_per_hr/3600 * SAR(3.75)
-- * 100 * (1 + markup 0.4). Stored FRACTIONAL (REAL) — pods.js ceils the final quote, so
-- cheap GPUs are not over-rounded. The catalog-refresh job keeps these live + heartbeats fresh.

ALTER TABLE jobs ADD COLUMN burst_external_id TEXT;   -- partner pod id; NEVER serialized to the renter
ALTER TABLE jobs ADD COLUMN burst_status TEXT;        -- internal launch/teardown state

ALTER TABLE providers ADD COLUMN is_burst INTEGER DEFAULT 0;          -- 1 = synthetic burst row
ALTER TABLE providers ADD COLUMN burst_gpu_type_id TEXT;             -- partner GPU type id (internal)
ALTER TABLE providers ADD COLUMN burst_cloud_type TEXT DEFAULT 'SECURE';

-- Synthetic burst provider rows — one per offered GPU. Seeded online+approved with a
-- readiness blob that satisfies resolvePodProvider (docker+cuda+vram). cost is live-cost*1.4.
-- name/gpu_model carry only the GPU spec (no vendor, no "burst" — the marketplace shows the
-- GPU type). email is a neutral unique placeholder. The catalog-refresh job updates price +
-- last_heartbeat and flips status offline when the partner is out of stock.
INSERT OR IGNORE INTO providers
  (name, email, gpu_model, gpu_name_detected, gpu_count, vram_gb, gpu_vram_mib,
   status, approval_status, is_paused, last_heartbeat, readiness_status, readiness_details,
   cost_per_gpu_second_halala, is_burst, burst_gpu_type_id, burst_cloud_type, created_at, updated_at)
VALUES
  ('NVIDIA RTX 4090','burst-rtx4090@dcp.internal','NVIDIA GeForce RTX 4090','NVIDIA GeForce RTX 4090',1,24,24576,
   'online','approved',0,datetime('now'),'ready','{"docker":1,"cuda_available":1,"vram_gb":24}',
   0.1006,1,'NVIDIA GeForce RTX 4090','SECURE',datetime('now'),datetime('now')),
  ('NVIDIA RTX 5090','burst-rtx5090@dcp.internal','NVIDIA GeForce RTX 5090','NVIDIA GeForce RTX 5090',1,32,32768,
   'online','approved',0,datetime('now'),'ready','{"docker":1,"cuda_available":1,"vram_gb":32}',
   0.1444,1,'NVIDIA GeForce RTX 5090','SECURE',datetime('now'),datetime('now')),
  ('NVIDIA L40S','burst-l40s@dcp.internal','NVIDIA L40S','NVIDIA L40S',1,48,49152,
   'online','approved',0,datetime('now'),'ready','{"docker":1,"cuda_available":1,"vram_gb":48}',
   0.1254,1,'NVIDIA L40S','SECURE',datetime('now'),datetime('now')),
  ('NVIDIA A100 80GB','burst-a100-80@dcp.internal','NVIDIA A100 80GB PCIe','NVIDIA A100 80GB PCIe',1,80,81920,
   'online','approved',0,datetime('now'),'ready','{"docker":1,"cuda_available":1,"vram_gb":80}',
   0.2027,1,'NVIDIA A100 80GB PCIe','SECURE',datetime('now'),datetime('now')),
  ('NVIDIA H100 80GB','burst-h100-80@dcp.internal','NVIDIA H100 80GB HBM3','NVIDIA H100 80GB HBM3',1,80,81920,
   'online','approved',0,datetime('now'),'ready','{"docker":1,"cuda_available":1,"vram_gb":80}',
   0.4798,1,'NVIDIA H100 80GB HBM3','SECURE',datetime('now'),datetime('now')),
  ('NVIDIA H200','burst-h200@dcp.internal','NVIDIA H200','NVIDIA H200',1,141,144384,
   'online','approved',0,datetime('now'),'ready','{"docker":1,"cuda_available":1,"vram_gb":141}',
   0.6402,1,'NVIDIA H200','SECURE',datetime('now'),datetime('now'));
