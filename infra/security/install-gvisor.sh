#!/usr/bin/env bash
# install-gvisor.sh — install gVisor (runsc) and register it as a Docker runtime
# with GPU support, for sandboxing UNTRUSTED renter pods on a DCP provider node.
# Idempotent + safe to re-run. Linux-only.
#
# This is the GA gate for renter-pod isolation: today pods run on plain runc
# (shared kernel). gVisor interposes a user-space kernel (the "Sentry") between
# the container and the host kernel, shrinking the host attack surface for
# untrusted code. GPU access under gVisor goes through nvproxy.
#
# Outputs a marker file (CONFIG_DIR/runsc-capability.json, where CONFIG_DIR =
# $HOME/dcp-provider, matching the daemon) that the daemon reads to decide
# whether to launch pods under --runtime=runsc-nvidia. If the GPU probe under
# gVisor fails (nvproxy is a STRICT driver-version match and does not cover every
# driver), the marker records gpu=false and the daemon falls back to runc with a
# logged WARNING rather than pretend the sandbox works.
#
# SAFETY: this script restarts dockerd to register the runtime, which would kill
# running containers. It REFUSES to restart if DCP pods or vLLM inference
# containers are live, and tells the operator to re-run during a maintenance
# window — so it never causes an inference outage on a serving node.
#
# Refs (verified 2026-06-08):
#   https://gvisor.dev/docs/user_guide/install/
#   https://gvisor.dev/docs/user_guide/gpu/         (nvproxy, strict driver match)
#   https://gvisor.dev/docs/user_guide/quick_start/docker/  (runsc install --runtime NAME -- FLAGS)
#   runsc/config/flags.go: --nvproxy and --nvproxy-docker are both LEGACY; with
#     `docker run --gpus` GPU support auto-enables from the OCI spec, and
#     --nvproxy-docker explicitly recommends against itself — so we do NOT use it.
set -euo pipefail

MARKER_DIR="${DCP_CONFIG_DIR:-$HOME/dcp-provider}"
MARKER="${MARKER_DIR}/runsc-capability.json"
RUNTIME_NAME="runsc-nvidia"
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"
LOG() { printf '[install-gvisor] %s\n' "$*"; }
WARN() { printf '[install-gvisor] WARN: %s\n' "$*" >&2; }

write_marker() {
  # write_marker <installed:true|false> <gpu:true|false> <runtime> <note>
  mkdir -p "${MARKER_DIR}"
  cat > "${MARKER}" <<JSON
{
  "installed": ${1},
  "gpu": ${2},
  "runtime": "${3}",
  "note": "${4}",
  "checked_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
  LOG "marker written: ${MARKER} (installed=${1} gpu=${2})"
}

# ── 0. Platform guard — gVisor only runs on Linux ──────────────────────────
if [ "$(uname -s)" != "Linux" ]; then
  WARN "gVisor runs on Linux only; this host is $(uname -s). Pods will use runc (no sandbox)."
  write_marker false false "runc" "non-linux host; gVisor unavailable"
  exit 0
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else
    WARN "not root and no sudo; cannot install gVisor. Pods will use runc."
    write_marker false false "runc" "insufficient privileges"
    exit 0
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  WARN "docker not found; install Docker first. Pods will use runc."
  write_marker false false "runc" "docker missing"
  exit 0
fi

# ── 1. Install runsc (idempotent — skip if already on PATH) ────────────────
if command -v runsc >/dev/null 2>&1; then
  LOG "runsc already installed: $(runsc --version 2>/dev/null | head -1)"
else
  LOG "installing gVisor (runsc) from the official apt repo..."
  ARCH="$(uname -m)"
  case "${ARCH}" in
    x86_64) URL_ARCH="x86_64" ;;
    aarch64|arm64) URL_ARCH="aarch64" ;;
    *) WARN "unsupported arch ${ARCH}; gVisor unavailable. Pods will use runc."; write_marker false false "runc" "unsupported arch ${ARCH}"; exit 0 ;;
  esac
  if command -v apt-get >/dev/null 2>&1; then
    ${SUDO} apt-get install -y -qq apt-transport-https ca-certificates curl gnupg >/dev/null 2>&1 || true
    curl -fsSL https://gvisor.dev/archive.key | ${SUDO} gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
      | ${SUDO} tee /etc/apt/sources.list.d/gvisor.list >/dev/null
    ${SUDO} apt-get update -qq >/dev/null 2>&1
    ${SUDO} apt-get install -y -qq runsc >/dev/null 2>&1
  else
    # Direct binary install (RHEL/rootfs without apt).
    TMP="$(mktemp -d)"
    BASE="https://storage.googleapis.com/gvisor/releases/release/latest/${URL_ARCH}"
    ( cd "${TMP}" \
      && curl -fsSLO "${BASE}/runsc" \
      && curl -fsSLO "${BASE}/runsc.sha512" \
      && curl -fsSLO "${BASE}/containerd-shim-runsc-v1" \
      && curl -fsSLO "${BASE}/containerd-shim-runsc-v1.sha512" \
      && sha512sum -c runsc.sha512 \
      && sha512sum -c containerd-shim-runsc-v1.sha512 \
      && chmod a+rx runsc containerd-shim-runsc-v1 \
      && ${SUDO} mv runsc containerd-shim-runsc-v1 /usr/local/bin/ )
    rm -rf "${TMP}"
  fi
  if ! command -v runsc >/dev/null 2>&1; then
    WARN "runsc install failed. Pods will use runc."
    write_marker false false "runc" "runsc install failed"
    exit 0
  fi
  LOG "runsc installed: $(runsc --version 2>/dev/null | head -1)"
fi

# ── 2. Register the runsc-nvidia Docker runtime (idempotent JSON merge) ────
# Modern gVisor + `docker run --gpus` auto-enables GPU from the OCI spec, so we
# register a PLAIN runsc runtime (NO --nvproxy-docker: it is LEGACY and double-
# injects the nvidia hook alongside --gpus). We keep --nvproxy as a harmless
# compatibility hint for older runsc builds.
LOG "registering Docker runtime '${RUNTIME_NAME}' (nvproxy auto-enabled via --gpus)..."
${SUDO} runsc install --runtime "${RUNTIME_NAME}" -- --nvproxy >/dev/null 2>&1 \
  || WARN "runsc install returned non-zero (continuing; will verify/patch via daemon.json)"

ensure_runtime_in_daemon_json() {
  ${SUDO} mkdir -p /etc/docker
  [ -f "${DOCKER_DAEMON_JSON}" ] || echo '{}' | ${SUDO} tee "${DOCKER_DAEMON_JSON}" >/dev/null
  if command -v python3 >/dev/null 2>&1; then
    ${SUDO} python3 - "${DOCKER_DAEMON_JSON}" "${RUNTIME_NAME}" <<'PY'
import json, os, sys
path, name = sys.argv[1], sys.argv[2]
try:
    cfg = json.load(open(path))
except Exception:
    cfg = {}
cfg.setdefault("runtimes", {})
# Only set if absent (idempotent — don't clobber an admin override).
runsc_path = "/usr/bin/runsc" if os.path.exists("/usr/bin/runsc") else "/usr/local/bin/runsc"
cfg["runtimes"].setdefault(name, {
    "path": runsc_path,
    "runtimeArgs": ["--nvproxy"],
})
json.dump(cfg, open(path, "w"), indent=2)
print("daemon.json runtimes:", list(cfg["runtimes"].keys()))
PY
  else
    WARN "python3 absent; relying on 'runsc install' result for daemon.json"
  fi
}
ensure_runtime_in_daemon_json

# ── 3. Restart Docker — ONLY if it is safe (no live pods / inference) ───────
# A docker restart kills ALL containers, including running vLLM inference. Never
# do that silently on a serving node.
runsc_visible() { docker info 2>/dev/null | grep -q "${RUNTIME_NAME}"; }
if runsc_visible; then
  LOG "Docker already lists runtime '${RUNTIME_NAME}' — no restart needed."
else
  LIVE="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -Ei 'dcp-pod-|vllm|dcp-infer|interactive' || true)"
  if [ -n "${LIVE}" ]; then
    WARN "Docker restart is required to load runtime '${RUNTIME_NAME}', but these"
    WARN "containers are RUNNING and a restart would interrupt them:"
    printf '%s\n' "${LIVE}" | sed 's/^/[install-gvisor]   - /' >&2
    WARN "Refusing to restart dockerd. Drain this node, then run:"
    WARN "    ${SUDO} systemctl restart docker && bash $0"
    write_marker true false "runc" "runsc installed; dockerd restart deferred (live containers present)"
    exit 0
  fi
  if command -v systemctl >/dev/null 2>&1; then
    LOG "no live pods/inference — restarting dockerd to load the runtime..."
    ${SUDO} systemctl restart docker 2>/dev/null || WARN "could not restart docker via systemctl"
  fi
fi

if ! runsc_visible; then
  WARN "Docker does not list runtime '${RUNTIME_NAME}'. Pods will use runc."
  write_marker true false "runc" "runtime not visible to dockerd"
  exit 0
fi
LOG "Docker runtime '${RUNTIME_NAME}' registered."

# ── 4. Capability probe — CPU sandbox first, then GPU under gVisor ──────────
# 4a. Plain runsc sandbox (no GPU): proves the Sentry works on this kernel.
if docker run --rm --runtime="${RUNTIME_NAME}" alpine:3.20 true >/dev/null 2>&1; then
  LOG "runsc CPU sandbox probe: OK"
else
  WARN "runsc CPU sandbox probe FAILED (kernel may lack unprivileged userns / KVM). Pods will use runc."
  write_marker true false "runc" "runsc sandbox probe failed"
  exit 0
fi

# 4b. GPU under gVisor (nvproxy). THIS IS THE MATURITY GATE: nvproxy is a STRICT
# driver-version match. If it fails, record gpu=false; the daemon runs GPU pods
# under runc (logged WARN) rather than ship a broken sandbox.
PROBE_IMG="nvidia/cuda:12.2.0-base-ubuntu22.04"
if docker image inspect "${PROBE_IMG}" >/dev/null 2>&1 || docker pull "${PROBE_IMG}" >/dev/null 2>&1; then
  if docker run --rm --runtime="${RUNTIME_NAME}" --gpus all "${PROBE_IMG}" \
       nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1; then
    GPU_NAME="$(docker run --rm --runtime="${RUNTIME_NAME}" --gpus all "${PROBE_IMG}" nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
    LOG "GPU under gVisor (nvproxy) probe: OK — ${GPU_NAME}"
    write_marker true true "${RUNTIME_NAME}" "runsc+nvproxy GPU verified: ${GPU_NAME}"
    LOG "DONE: untrusted renter pods can run sandboxed WITH GPU on this node."
    exit 0
  else
    WARN "GPU-under-gVisor (nvproxy) probe FAILED. Known maturity gap:"
    WARN "  nvproxy is a strict driver-version match; this driver may be unsupported"
    WARN "  (run: runsc nvproxy list-supported-drivers)."
    WARN "  CPU pods sandbox fine; GPU pods fall back to runc (logged WARNING by daemon)."
    write_marker true false "${RUNTIME_NAME}" "runsc CPU-sandbox OK; nvproxy GPU probe failed (driver match)"
    exit 0
  fi
else
  WARN "could not obtain ${PROBE_IMG}; cannot probe GPU-under-gVisor. Recording gpu=false."
  write_marker true false "${RUNTIME_NAME}" "GPU probe image unavailable"
  exit 0
fi
