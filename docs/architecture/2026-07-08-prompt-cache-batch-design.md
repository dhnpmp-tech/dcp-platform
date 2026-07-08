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
   **Done in PR #755** with `prompt_cache_measurements`, a hash-only ledger of
   cache keys, session hashes, counters, request ids, and discount flags.
4. Add response usage fields only after compatibility checks:
   - `prompt_cache.status`
   - `prompt_cache.cache_key`
   - `prompt_cache.cached_input_tokens`
   - `prompt_cache.billable_input_tokens`
   - `prompt_cache.discount_applied`
   - `prompt_cache.discount_bps`
   **Done in PR #754** for `/v1/chat/completions`; fields are attached to
   non-streaming responses and final/synthetic streaming usage chunks.
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
   The batch is not considered result-available until the worker also records a
   `result_checksum_sha256` proof and normalized result byte count.
   Completed result downloads are exposed only through scoped short-lived
   signed URLs after the batch result object-store signer is configured.
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
  input_normalized_bytes INTEGER NOT NULL DEFAULT 0,
  completion_window TEXT NOT NULL DEFAULT '24h',
  metadata_json TEXT,
  result_storage_key TEXT,
  result_checksum_sha256 TEXT,
  result_normalized_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'created',
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
4. Add result artifact path and worker stub. **Done in PR #743.**
5. Add result checksum/byte proof and a read-only result manifest route.
   **Done in PR #752** via `GET /api/batches/:batch_id/results`.
6. Add signed object-store download URLs for completed result artifacts.
   **Done in PR #756** with a disabled-until-configured S3-compatible signer.
7. Run per-line billing through the existing inference settlement path.
8. Only then expose `capability_flags.batch = true` for models that can run it.

PR #741 deliberately leaves `execution_enabled: false` and keeps `/v1/models`
`capability_flags.batch = false` until steps 4-6 are complete.
PR #743 adds a dormant worker scaffold and deterministic result-artifact key
builder, but it does not run in production unless `DCP_BATCH_WORKER_ENABLED=1`
and an executor is explicitly provided.
PR #752 requires completed batch artifacts to include both `result_storage_key`
and `result_checksum_sha256` before `results_available` becomes true. It adds a
tenant-scoped result manifest route, but still does not issue signed download
URLs, apply batch discounts, or enable public batch model capability flags.
PR #753 adds the convenience smoke command
`npm --prefix backend run worker:batch-inference:once -- --limit 1`, matching
the LoRA worker check and avoiding raw node-path drift during deploy handoffs.
PR #754 wires prompt-cache measurement metadata into `/v1/chat/completions`
usage blocks without changing billing. It accepts optional `static_prefix` or
`prompt_cache.static_prefix` hints, hashes session scope, and keeps
`discount_applied: false` with `billable_input_tokens === prompt_tokens`.
PR #755 adds durable prompt-cache measurement rows and uses prior recorded cache
keys to report `hit_measured_no_discount` on repeated prefixes. The ledger is
best-effort from the v1 route, stores no raw prompt text, and still leaves
cached-input discounts disabled.
PR #756 adds the batch result download signer. Completed manifests can return a
short-lived signed GET URL only when result proof exists, the key is scoped to
`batch-results/renter-{id}/{batch_id}/`, and `BATCH_RESULTS_S3_BUCKET` plus
S3-compatible endpoint/key/secret config are present. Production batch
execution, discounts, and `/v1/models` batch capability flags remain gated.
