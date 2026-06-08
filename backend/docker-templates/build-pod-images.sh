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
#   cuda              -> dcp-compute:cuda
#   ubuntu            -> dcp-compute:ubuntu
#   vllm              -> dcp-compute:vllm       (large image; sshd only, no auto-serve)
#
# Re-running is safe; Docker layer caching skips unchanged steps.
set -euo pipefail

# Build from this directory so the COPY sources (entrypoints) resolve.
cd "$(dirname "$0")"

build() {
  local tag="$1" file="$2"
  echo ">>> Building ${tag} from ${file}"
  docker build -t "${tag}" -f "${file}" .
}

build dcp-compute:pytorch dcp-pytorch.Dockerfile
build dcp-compute:cuda    dcp-cuda.Dockerfile
build dcp-compute:ubuntu  dcp-ubuntu.Dockerfile
build dcp-compute:vllm    dcp-vllm.Dockerfile

echo ">>> Done. Pre-baked pod images:"
docker images --filter=reference='dcp-compute:*'
