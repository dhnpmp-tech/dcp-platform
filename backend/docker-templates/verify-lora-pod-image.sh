#!/usr/bin/env bash
# Verify the fat DCP LoRA pod image on a GPU provider host.
#
# This script is intentionally provider-side. Laptop/VPS Docker builds do not
# prove the product gate, because the acceptance criterion is: a fresh GPU pod
# imports the LoRA stack quickly without pip installing at launch time.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE="${1:-${DCP_LORA_IMAGE:-dcp-compute:lora}}"
MAX_IMPORT_SECONDS="${MAX_IMPORT_SECONDS:-5}"
REQUIRE_GPU="${REQUIRE_GPU:-1}"
REPORT_DIR="${DCP_LORA_IMAGE_PROOF_REPORT_DIR:-$REPO_ROOT/docs/reports/reliability}"
RUN_ID="${DCP_LORA_IMAGE_PROOF_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
REPORT_JSON="$REPORT_DIR/lora-pod-image-proof-$RUN_ID.json"
REPORT_MD="$REPORT_DIR/lora-pod-image-proof-$RUN_ID.md"
TMP_DIR="$(mktemp -d)"
STACK_LOG="$TMP_DIR/lora-stack-smoke.log"
SCAFFOLD_LOG="$TMP_DIR/lora-sft-scaffold.log"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

extract_result_json() {
  local file="$1"
  grep '^DC1_RESULT_JSON:' "$file" | tail -n 1 | sed 's/^DC1_RESULT_JSON://' || true
}

write_report() {
  local status="$1"
  local stack_status="$2"
  local scaffold_status="$3"
  local stack_json="${4:-}"
  local scaffold_json="${5:-}"
  local finished_at
  local host_name
  local verdict
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  host_name="$(hostname 2>/dev/null || echo unknown)"
  verdict="FAIL"
  if [ "$status" = "pass" ] && [ "$REQUIRE_GPU" = "1" ]; then
    verdict="PASS"
  elif [ "$status" = "pass" ]; then
    verdict="DRY_RUN"
  fi
  mkdir -p "$REPORT_DIR"

  cat > "$REPORT_JSON" <<JSON
{
  "contract": "dcp.lora_pod_image_proof.v1",
  "verdict": "$(json_escape "$verdict")",
  "status": "$(json_escape "$status")",
  "generated_at": "$(json_escape "$finished_at")",
  "finished_at": "$(json_escape "$finished_at")",
  "acceptance_gate": "lora_pod_image_provider_host",
  "host": "$(json_escape "$host_name")",
  "image": "$(json_escape "$IMAGE")",
  "max_import_seconds": "$(json_escape "$MAX_IMPORT_SECONDS")",
  "require_gpu": "$(json_escape "$REQUIRE_GPU")",
  "acceptance_requirements": {
    "provider_gpu_host": true,
    "docker_nvidia_runtime": true,
    "built_image": "$(json_escape "$IMAGE")",
    "require_gpu": "1",
    "accepted_verdict": "PASS",
    "dry_run_verdict": "DRY_RUN"
  },
  "claim_guards": {
    "claims_lora_pod_image_gpu_ready": false,
    "claims_fine_tuning_ready_pods": false,
    "enables_managed_training": false,
    "enables_adapter_serving": false,
    "enables_route_traffic": false,
    "proves_tinker_compatibility": false
  },
  "stack_smoke_exit_code": $stack_status,
  "scaffold_exit_code": $scaffold_status,
  "stack_smoke": ${stack_json:-null},
  "scaffold": ${scaffold_json:-null}
}
JSON

  cat > "$REPORT_MD" <<MD
# DCP LoRA Pod Image Proof

- Contract: \`dcp.lora_pod_image_proof.v1\`
- Verdict: \`$verdict\`
- Status: \`$status\`
- Finished at: \`$finished_at\`
- Host: \`$host_name\`
- Image: \`$IMAGE\`
- Max import seconds: \`$MAX_IMPORT_SECONDS\`
- Require GPU: \`$REQUIRE_GPU\`
- Stack smoke exit code: \`$stack_status\`
- Scaffold exit code: \`$scaffold_status\`

## Stack Smoke Result

\`\`\`json
${stack_json:-null}
\`\`\`

## LoRA SFT Scaffold Result

\`\`\`json
${scaffold_json:-null}
\`\`\`

## Notes

This provider-host proof only verifies that a fresh \`$IMAGE\` container imports
the LoRA/QLoRA/vLLM stack quickly and can construct the fixed SFT scaffold. It
does not claim managed training, adapter serving, route traffic, benchmark
quality, or Tinker compatibility are live.

\`DRY_RUN\` evidence is useful for script debugging only. The live acceptance
gate accepts only \`verdict=PASS\` with \`require_gpu=1\` on a provider GPU host.
MD

  echo ">>> Wrote proof report: $REPORT_JSON"
  echo ">>> Wrote proof report: $REPORT_MD"
}

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
set +e
docker run --rm \
  "${GPU_ARGS[@]}" \
  --entrypoint python \
  "$IMAGE" \
  /opt/dcp/examples/lora_stack_smoke.py "${SMOKE_ARGS[@]}" \
  >"$STACK_LOG" 2>&1
STACK_STATUS=$?
cat "$STACK_LOG"

echo ">>> Verifying offline LoRA scaffold"
docker run --rm \
  "${GPU_ARGS[@]}" \
  --entrypoint python \
  "$IMAGE" \
  /opt/dcp/examples/lora_sft_scaffold.py \
  >"$SCAFFOLD_LOG" 2>&1
SCAFFOLD_STATUS=$?
cat "$SCAFFOLD_LOG"
set -e

STACK_JSON="$(extract_result_json "$STACK_LOG")"
SCAFFOLD_JSON="$(extract_result_json "$SCAFFOLD_LOG")"

STATUS="pass"
if [ "$STACK_STATUS" -ne 0 ] || [ "$SCAFFOLD_STATUS" -ne 0 ] || [ -z "$STACK_JSON" ] || [ -z "$SCAFFOLD_JSON" ]; then
  STATUS="fail"
fi

write_report "$STATUS" "$STACK_STATUS" "$SCAFFOLD_STATUS" "$STACK_JSON" "$SCAFFOLD_JSON"

if [ "$STATUS" != "pass" ]; then
  echo ">>> $IMAGE failed LoRA pod image smoke" >&2
  exit 1
fi

echo ">>> $IMAGE passed LoRA pod image smoke"
