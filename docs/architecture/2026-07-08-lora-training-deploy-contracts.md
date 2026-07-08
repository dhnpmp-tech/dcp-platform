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
2. Create a training job row with fixed recipe and idempotency key.
3. Launch only on a provider that passed the fat LoRA image GPU-host smoke.
4. Write logs and an artifact manifest.
5. Compute artifact SHA-256.
6. Register the adapter in `adapter_registry` with `registered` or `ready`.
7. Keep deployment separate until vLLM load proof exists.
