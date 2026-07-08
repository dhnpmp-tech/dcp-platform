# Prompt Cache and Batch Inference Foundation - 2026-07-08

## Scope

This is the next backend slice from the Fireworks/Tinker roadmap after adapter
registry. It intentionally creates design rails and contract tests before
turning on discounts or a public batch route.

This slice does **not** claim:

- prompt-cache discounts are live
- batch inference is publicly available
- cached input tokens reduce renter billing
- any provider has proved batch throughput capacity

## Prompt-Cache Accounting Order

1. Measure first, discount later.
2. Compute a cache key from:
   - model id
   - optional session id hash
   - explicit `static_prefix`, or leading `system` / `developer` messages
3. Record only hashes and counters in durable storage. Do not persist raw prompt
   text inside accounting tables.
4. Add response usage fields only after compatibility checks:
   - `prompt_cache.status`
   - `prompt_cache.cache_key`
   - `prompt_cache.cached_input_tokens`
   - `prompt_cache.billable_input_tokens`
   - `prompt_cache.discount_applied`
   - `prompt_cache.discount_bps`
5. Keep `billable_input_tokens === prompt_tokens` until hit measurement is
   reliable across restarts and provider failover.
6. Only after measurement is trusted, add per-model cached-input rates and
   wallet settlement tests.

Current code foundation:

- `backend/src/services/promptCacheAccounting.js`
- `backend/src/__tests__/promptCacheAccounting.test.js`

Acceptance before discounting:

- Same static prefix and model produce the same cache key.
- Changing model or prefix changes the cache key.
- Measured hits never reduce billable tokens yet.
- Multimodal inputs are hash-normalized so URLs are not exposed by the
  accounting payload.
- Usage totals stay OpenAI-compatible.

## Batch Inference API Shape

DCP should follow the familiar OpenAI-style JSONL shape because agents and
customers already know it:

```jsonl
{"custom_id":"request-1","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen/qwen3-coder","messages":[{"role":"user","content":"hello"}]}}
{"custom_id":"request-2","method":"POST","url":"/v1/complete","body":{"model":"mistral","prompt":"hello"}}
```

The first implementation should use existing job/billing rails, not a separate
scheduler:

1. Upload JSONL to workspace/object storage.
2. `POST /api/batches` creates a batch record with:
   - `batch_id`
   - `renter_id`
   - `input_storage_key`
   - `input_checksum_sha256`
   - `endpoint`
   - `status`
   - `request_count`
   - `created_at`
   - `completed_at`
3. Worker fans out requests to the same v1 inference path used today.
4. Each line receives a result object with:
   - `custom_id`
   - `status_code`
   - `response`
   - `error`
   - `usage`
   - `cost_halala`
5. Store result JSONL as `result_storage_key`.
6. Billing policy:
   - no public discount in the first live route
   - per-line settlement uses existing inference metering
   - batch-level discounted billing comes only after replay/idempotency tests

Current code foundation:

- `backend/src/services/batchInferenceContract.js`
- `backend/src/__tests__/batchInferenceContract.test.js`

Acceptance before public route:

- JSONL parser rejects invalid JSON with line numbers.
- `custom_id` is unique and stable.
- Only supported inference endpoints are accepted.
- Endpoint-specific body fields are required.
- Request count and byte limits are enforced.
- Normalized checksum is deterministic.

## Proposed Batch Tables

```sql
CREATE TABLE batch_inference_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL UNIQUE,
  renter_id INTEGER NOT NULL,
  input_storage_key TEXT NOT NULL,
  input_checksum_sha256 TEXT NOT NULL,
  result_storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  request_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_cost_halala INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (renter_id) REFERENCES renters(id)
);
```

Do not create this table until the route/worker slice starts; otherwise the
schema can drift before the behavior exists.

## Next Implementation Slice

1. Add `batch_inference_jobs` migration and service. **Done in PR #741.**
2. Add `POST /api/batches` for metadata + JSONL contract validation. **Done in
   PR #741.**
3. Add `GET /api/batches/:batch_id`. **Done in PR #741.**
4. Add result artifact path and worker stub.
5. Run per-line billing through the existing inference settlement path.
6. Only then expose `capability_flags.batch = true` for models that can run it.

PR #741 deliberately leaves `execution_enabled: false` and keeps `/v1/models`
`capability_flags.batch = false` until steps 4-6 are complete.
