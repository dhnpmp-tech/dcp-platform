#!/usr/bin/env bash
# Smoke-test the gVisor pod hardening end to end on a real provider node.
set -uo pipefail
MARKER="${DCP_CONFIG_DIR:-$HOME/dcp-provider}/runsc-capability.json"
RUNTIME="runsc-nvidia"
PROBE_IMG="nvidia/cuda:12.2.0-base-ubuntu22.04"
pass(){ echo "  PASS: $*"; }
fail(){ echo "  FAIL: $*"; }

echo "[0] no live inference will be killed (installer self-guards, but double-check)"
docker ps --format '{{.Names}}' | grep -Ei 'vllm|dcp-infer' && echo "  WARN: inference live — run installer only in a maintenance window" || pass "no live inference containers"

echo "[1] install-gvisor.sh is idempotent (re-run must succeed)"
bash infra/security/install-gvisor.sh && pass "re-run clean" || fail "re-run errored"

echo "[2] marker exists and parses"
if [ -f "$MARKER" ] && python3 -c "import json,sys;json.load(open('$MARKER'))"; then
  pass "marker valid: $(cat "$MARKER")"
else fail "marker missing/invalid"; fi

echo "[3] dockerd lists the runtime"
docker info 2>/dev/null | grep -q "$RUNTIME" && pass "runtime registered" || fail "runtime not in docker info"

echo "[4] CPU sandbox works"
docker run --rm --runtime="$RUNTIME" alpine:3.20 true && pass "runsc CPU sandbox" || fail "runsc CPU sandbox"

echo "[5] GPU under gVisor (informational — may legitimately fail on unsupported driver)"
if docker run --rm --runtime="$RUNTIME" --gpus all "$PROBE_IMG" nvidia-smi -L >/dev/null 2>&1; then
  pass "GPU visible under gVisor (untrusted pods safe WITH GPU)"
else
  echo "  INFO: nvproxy GPU probe failed — daemon will fall back to runc with a WARNING (expected on unsupported drivers; run: runsc nvproxy list-supported-drivers)"
fi

echo "[6] launch a real pod and confirm the chosen runtime AND that SSH still comes up"
JOB=$(curl -s -X POST https://api.dcp.sa/api/pods -H "x-renter-key: <RENTER_KEY>" \
  -H 'content-type: application/json' \
  -d '{"duration_minutes":5}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
echo "  launched pod: $JOB — once running, on the provider node run:"
echo "    docker inspect --format '{{.HostConfig.Runtime}}' dcp-pod-$JOB"
echo "  expect '$RUNTIME' when marker.gpu=true, else 'runc' (check daemon log for the WARNING)"
echo "  CRITICAL: confirm SSH into the pod still works (we removed no-new-privileges precisely to protect this path)"
