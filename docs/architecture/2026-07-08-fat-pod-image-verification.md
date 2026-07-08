# Fat LoRA Pod Image Verification - 2026-07-08

Timestamp: 2026-07-08 04:50 UTC / 08:50 +04.

Source:

- `docs/strategy/2026-07-08-fireworks-tinker-product-roadmap.md`
- `docs/architecture/2026-07-08-pods-inference-fireworks-gap-audit.md`
- `docs/strategy/2026-07-07-codex-dev-process.md`

## Decision

Add a dedicated provider-local fat pod image:

- Alias: `lora`
- Docker tag: `dcp-compute:lora`
- Dockerfile: `backend/docker-templates/dcp-lora.Dockerfile`
- Verification script: `backend/docker-templates/verify-lora-pod-image.sh`

This does **not** make a public claim that managed LoRA training is live. It
creates the build and verification path required before the template-backed pod
launch UX and adapter registry work.

## Package Contract

The image is based on `pytorch/pytorch:2.3.1-cuda12.1-cudnn8-runtime` and bakes:

- SSH/Jupyter pod runtime.
- `transformers`
- `peft`
- `accelerate`
- `datasets`
- `bitsandbytes`
- `trl`
- `safetensors`
- `sentencepiece`
- `tensorboard`
- `hf-transfer`
- `vllm`

Optional Tinker cookbook material is intentionally off by default. Use
`TINKER_COOKBOOK_GIT_URL` only after source/licensing/access are approved. Do
not ship one-env-var Tinker compatibility copy until the API shim exists.

## Provider Build

Run this on a GPU provider host, not on the VPS and not on a laptop:

```bash
cd /root/dc1-platform/backend/docker-templates
DCP_POD_IMAGE_TARGETS=lora ./build-pod-images.sh
```

The default build script can still build all pre-baked pod images:

```bash
./build-pod-images.sh
```

## Provider Verification

Run:

```bash
cd /root/dc1-platform/backend/docker-templates
./verify-lora-pod-image.sh dcp-compute:lora
```

Acceptance gate:

- `docker image inspect dcp-compute:lora` succeeds.
- `nvidia-smi` is available unless `REQUIRE_GPU=0` is explicitly set for a
  CPU-only dry run.
- A fresh container imports `torch`, `transformers`, `peft`, `accelerate`,
  `datasets`, `bitsandbytes`, `safetensors`, `trl`, and `vllm`.
- Total import time is <= `MAX_IMPORT_SECONDS` (default `5`).
- The container reports CUDA visibility.
- The offline LoRA SFT scaffold emits `DC1_RESULT_JSON` without downloading a
  model or dataset.

## Workspace Examples

The image bakes examples under `/opt/dcp/examples`. The pod entrypoint copies
them into `/workspace/examples` on first launch without overwriting renter files:

- `lora_stack_smoke.py`
- `lora_sft_scaffold.py`

This supports the next UI slice: upload dataset first, launch LoRA pod, then run
the scaffold from the mounted workspace.

## Rollback

If the image fails on provider hardware:

1. Do not expose `lora` in the launch UI.
2. Leave existing `pytorch`, `cuda`, `ubuntu`, and `vllm` aliases unchanged.
3. Rebuild only known-good images:

```bash
DCP_POD_IMAGE_TARGETS="pytorch cuda ubuntu vllm" ./build-pod-images.sh
```
