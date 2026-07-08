#!/usr/bin/env bash
# Build the DCP pre-baked pod images.
#
# RUN THIS ON A PROVIDER (a GPU host running the DCP daemon), not on the VPS or
# a laptop — the daemon launches these `dcp-compute:<alias>` images locally for
# renter pods, so they must exist in the provider's local Docker image store.
# The images bake sshd (and Jupyter, for pytorch) so pods start in SECONDS with
# no apt at launch.
#
# Friendly aliases the pods route maps to these tags:
#   pytorch (default) -> dcp-compute:pytorch   (ships Jupyter + SSH)
#   lora              -> dcp-compute:lora      (fat LoRA/QLoRA/vLLM stack + examples)
#   cuda              -> dcp-compute:cuda
#   ubuntu            -> dcp-compute:ubuntu
#   vllm              -> dcp-compute:vllm       (large image; sshd only, no auto-serve)
#
# Re-running is safe; Docker layer caching skips unchanged steps. To build only
# one or two images:
#
#   DCP_POD_IMAGE_TARGETS="lora pytorch" ./build-pod-images.sh
#
set -euo pipefail

# Build from this directory so the COPY sources (entrypoints) resolve.
cd "$(dirname "$0")"

build() {
  local tag="$1" file="$2"
  echo ">>> Building ${tag} from ${file}"
  docker build -t "${tag}" -f "${file}" .
}

TARGETS="${DCP_POD_IMAGE_TARGETS:-pytorch cuda ubuntu vllm lora}"

for target in $TARGETS; do
  case "$target" in
    pytorch) build dcp-compute:pytorch dcp-pytorch.Dockerfile ;;
    cuda) build dcp-compute:cuda dcp-cuda.Dockerfile ;;
    ubuntu) build dcp-compute:ubuntu dcp-ubuntu.Dockerfile ;;
    vllm) build dcp-compute:vllm dcp-vllm.Dockerfile ;;
    lora) build dcp-compute:lora dcp-lora.Dockerfile ;;
    *)
      echo "Unknown DCP pod image target: $target" >&2
      echo "Valid targets: pytorch cuda ubuntu vllm lora" >&2
      exit 2
      ;;
  esac
done

echo ">>> Done. Pre-baked pod images:"
docker images --filter=reference='dcp-compute:*'
