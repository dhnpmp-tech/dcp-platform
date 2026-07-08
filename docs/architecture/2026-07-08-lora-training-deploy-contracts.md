# LoRA Training and Deploy Contracts - 2026-07-08

## Scope

This is the LoRA foundation slice after adapter registry, prompt-cache design,
and batch design. It creates validation contracts for the future train-here /
deploy-here loop without starting a GPU training job or routing adapter traffic.

This slice does **not** claim:

- managed LoRA training is live
- an adapter can deploy to an endpoint today
- multi-LoRA serving is available
- DCP is Tinker-compatible

## Current Code Foundation

- `backend/src/services/loraTrainingContract.js`
- `backend/src/__tests__/loraTrainingContract.test.js`

The contract covers:

- SFT JSONL dataset validation
- token and size estimation
- train/validation split metadata
- fixed LoRA/QLoRA recipe normalization
- adapter deploy gating based on serving load proof

## Dataset Contract

Supported JSONL row shapes:

```jsonl
{"messages":[{"role":"user","content":"Question"},{"role":"assistant","content":"Answer"}]}
{"prompt":"Question","completion":"Answer"}
```

Validation rules:

- every non-empty line must be JSON
- rows cannot mix chat and prompt/completion formats
- chat rows require at least one `user` and one `assistant` message
- prompt/completion rows require non-empty strings
- NUL bytes are rejected
- max bytes and max rows are enforced before GPU work
- datasets with at least 10 rows receive validation split metadata

## Training Job Contract

The first managed recipe remains intentionally narrow:

- `recipe`: `lora_sft` or `qlora_sft`
- `base_model`
- `dataset_storage_key`
- `output_adapter_name`
- hyperparameters:
  - `rank`
  - `alpha`
  - `dropout`
  - `learning_rate`
  - `epochs`
  - `max_seq_length`

The normalized draft includes:

- `job_type: lora_training`
- `status: draft_contract`
- `output.artifact_kind: lora_adapter`
- `output.registry_initial_status: registered`
- `safety.requires_dataset_validation: true`
- `safety.requires_gpu_host_proof: true`

This draft can become a route only after the job worker can produce a real
adapter artifact and register it with checksum/storage metadata.

## Adapter Deploy Contract

Adapter deployment must never route traffic on request intent alone.

`normalizeAdapterDeploySpec` returns:

- `pending_load_proof` and `route_traffic: false` by default
- `loaded_verified` and `route_traffic: true` only when serving load proof
  confirms:
  - `loaded: true`
  - matching `adapter_id`
  - matching `base_model`

The next deploy API must preserve that invariant even if it introduces
dedicated endpoints, live merge, or multi-LoRA.

## Verification

Run:

```bash
cd backend
npm test -- --runTestsByPath src/__tests__/loraTrainingContract.test.js
npm run templates:validate
```

Before a public training route:

1. Validate the dataset contract on uploaded workspace JSONL.
2. Create a training job row with fixed recipe and idempotency key. **Done in
   PR #744.**
3. Launch only on a provider that passed the fat LoRA image GPU-host smoke.
   **Worker scaffold is done in PR #750**, but it stays disabled until an
   executor backed by GPU-host proof is configured.
4. Write logs and an artifact manifest.
   **Lifecycle log ledger is added in PR #751** via
   `GET /api/lora/training-jobs/{training_job_id}/logs`, which is
   tenant-scoped and records job creation plus worker status transitions.
   **Model-card manifest projection is added in PR #775** via the additive
   `model_card_manifest` field on LoRA training-job responses. It is metadata
   only and explicitly carries no public training, serving, quality, or
   Tinker-compatibility claims.
   **Fine-Tuning manifest rendering is added in PR #778** via read-only
   `/renter/fine-tuning` proof cards that render those claim guards directly.
5. Compute artifact SHA-256.
6. Register the adapter in `adapter_registry` with `registered` or `ready`.
   **Done in PR #748** via `POST
   /api/lora/training-jobs/{training_job_id}/register-adapter`, which only
   accepts succeeded jobs with artifact storage and SHA-256 proof.
7. Keep deployment separate until vLLM load proof exists. **Proof attachment is
   wired in PR #749** via admin/internal `POST
   /api/adapters/{adapter_id}/deployments/{deployment_id}/load-proof`; it only
   flips `route_traffic` when the load proof matches adapter id and base model.

PR #744 adds `/api/lora/training-jobs` as a metadata foundation. It validates
dataset JSONL and normalizes the recipe, but returns `training_enabled: false`
until trainer-worker proof, artifact checksums, and adapter registration are
wired.

PR #748 connects the succeeded-job artifact proof to the adapter registry. It
does **not** start training, deploy adapters, or route inference traffic. It
only creates/replays the adapter metadata row and keeps
`serving_enabled: false` until the deployment/load-proof slice exists.

PR #749 exposes the deployment load-proof attachment path behind admin auth.
Renter deployment creation remains an intent record; the proof route is the only
API route that can move a deployment to `running` with `route_traffic: true`,
and mismatched proof degrades the deployment instead of routing traffic.

PR #750 adds the disabled-by-default LoRA training worker scaffold and CLI
runner. With an injected executor it can move `created -> running -> succeeded`
and write artifact/model-card metadata, or mark a job failed. Without
`DCP_LORA_TRAINING_WORKER_ENABLED=1` and a real executor it does not mutate
jobs, so managed training is still not publicly live.

PR #751 adds tenant-scoped LoRA training logs. Job creation and worker-driven
status transitions now write immutable metadata rows, and renters can read them
through `GET /api/lora/training-jobs/{training_job_id}/logs`. This makes the
future trainer path observable without enabling GPU execution or adapter
traffic.

PR #775 adds `model_card_manifest` to LoRA training jobs when a
`model_card_storage_key` is present. The manifest is deterministic metadata for
the future model-card artifact writer and fine-tuning dashboard. It keeps raw
dataset content out of API responses and explicitly marks public training,
serving, routing, quality claims, and Tinker compatibility as false until
GPU-host and serving-load proof exist.
PR #778 wires the fine-tuning dashboard to that manifest. The UI now shows
manifest status, adapter/base, dataset rows, artifact proof, storage key,
contract version, and next step, while rendering public training, serving,
routing, quality, and Tinker guards from the manifest claims object.
