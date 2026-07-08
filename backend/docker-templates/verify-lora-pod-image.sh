#!/usr/bin/env bash
# Verify the fat DCP LoRA pod image on a GPU provider host.
#
# This script is intentionally provider-side. Laptop/VPS Docker builds do not
# prove the product gate, because the acceptance criterion is: a fresh GPU pod
# imports the LoRA stack quickly without pip installing at launch time.
set -euo pipefail

IMAGE="${1:-${DCP_LORA_IMAGE:-dcp-compute:lora}}"
MAX_IMPORT_SECONDS="${MAX_IMPORT_SECONDS:-5}"
REQUIRE_GPU="${REQUIRE_GPU:-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 2
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Missing image: $IMAGE" >&2
  echo "Build it on this provider host first:" >&2
  echo "  cd /root/dc1-platform/backend/docker-templates" >&2
  echo "  DCP_POD_IMAGE_TARGETS=lora ./build-pod-images.sh" >&2
  exit 2
fi

GPU_ARGS=()
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_ARGS=(--gpus all)
elif [ "$REQUIRE_GPU" = "1" ]; then
  echo "nvidia-smi not found and REQUIRE_GPU=1; refusing CPU-only smoke" >&2
  exit 2
fi

SMOKE_ARGS=(--max-import-seconds "$MAX_IMPORT_SECONDS")
if [ "$REQUIRE_GPU" = "1" ]; then
  SMOKE_ARGS+=(--require-gpu)
fi

echo ">>> Verifying $IMAGE (max import seconds: $MAX_IMPORT_SECONDS, require GPU: $REQUIRE_GPU)"
docker run --rm \
  "${GPU_ARGS[@]}" \
  --entrypoint python \
  "$IMAGE" \
  /opt/dcp/examples/lora_stack_smoke.py "${SMOKE_ARGS[@]}"

echo ">>> Verifying offline LoRA scaffold"
docker run --rm \
  "${GPU_ARGS[@]}" \
  --entrypoint python \
  "$IMAGE" \
  /opt/dcp/examples/lora_sft_scaffold.py

echo ">>> $IMAGE passed LoRA pod image smoke"
