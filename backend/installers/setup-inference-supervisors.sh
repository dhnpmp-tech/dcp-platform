#!/usr/bin/env bash
# setup-inference-supervisors.sh
#
# DCP provider-side inference-server supervisor installer. Idempotent.
#
# Drops a systemd USER unit for each known GGUF model found in
# ~/models/*.gguf (the standard provider model directory) so that
# llama-server is auto-restarted by systemd on crash and re-launched
# at boot. Without this, a CUDA OOM (which IS recoverable — VRAM frees
# in seconds) leaves the provider offline indefinitely because there
# is no supervisor.
#
# Background: see incident_node2_oom_2026-05-21.md. On Node 2 the
# llama-server process died at 2026-05-21 00:28 +03 from a CUDA OOM
# during a 19,423-token prompt re-process, and stayed down for ~12 hr
# because it was started manually without any supervisor.
#
# Conventions this script enforces:
#   - User unit name: dcp-llama-<short-id>.service
#   - WorkingDirectory: $HOME
#   - Restart=on-failure, RestartSec=15s, StartLimitBurst=5/600s
#   - --cache-ram 4096 (OOM-safe; previous default 8192 caused the crash)
#   - --host 0.0.0.0 (bind WG-reachable; gateway lives on the VPS)
#   - Idempotent: skips a model if its unit already exists, unless --force.
#
# Requirements:
#   - llama-server binary at $LLAMA_SERVER (default
#     $HOME/llama.cpp-src/build-cuda/bin/llama-server; override with env)
#   - sudo NOPASSWD for `loginctl enable-linger` OR linger already on
#
# Usage:
#   setup-inference-supervisors.sh              # idempotent install
#   setup-inference-supervisors.sh --force      # overwrite existing units
#   setup-inference-supervisors.sh --dry-run    # print only, no writes

set -euo pipefail

MODEL_DIR="${DCP_MODEL_DIR:-$HOME/models}"
LLAMA_SERVER="${LLAMA_SERVER:-$HOME/llama.cpp-src/build-cuda/bin/llama-server}"
UNIT_DIR="$HOME/.config/systemd/user"
LOG_DIR="$HOME/.dcp/logs"
DEFAULT_PORT="${LLAMA_PORT:-8080}"
DEFAULT_CTX="${LLAMA_CTX:-32768}"
DEFAULT_CACHE_MIB="${LLAMA_CACHE_MIB:-4096}"

FORCE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --force)   FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *)         echo "[setup] unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '[setup] %s\n' "$*"; }
warn() { printf '[setup] WARN: %s\n' "$*" >&2; }
fail() { printf '[setup] FAIL: %s\n' "$*" >&2; exit 1; }

[[ -x "$LLAMA_SERVER" ]] || fail "llama-server not found at $LLAMA_SERVER"
[[ -d "$MODEL_DIR"     ]] || fail "model dir not found at $MODEL_DIR"

mkdir -p "$UNIT_DIR" "$LOG_DIR"

# Ensure linger so user units survive logout + reboot. Skip if already on.
linger_state="$(loginctl show-user "$USER" 2>/dev/null | awk -F= '/^Linger=/{print $2}')"
if [[ "$linger_state" != "yes" ]]; then
  if (( DRY_RUN )); then
    log "DRY-RUN: would enable linger for $USER"
  elif command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
    sudo -n loginctl enable-linger "$USER" || warn "enable-linger failed (continuing)"
  else
    warn "linger=no but no sudo NOPASSWD; run: sudo loginctl enable-linger $USER"
  fi
fi

# Map model filename → canonical alias (so the gateway sees a stable name
# regardless of which quant a provider happens to have on disk).
declare -A ALIAS_MAP=(
  ["Qwen3.6-27B-Q4_K_S.gguf"]="qwen3.6-27b-mtp"
  ["Qwen3.6-27B-Q4_K_M.gguf"]="qwen3.6-27b-mtp"
  ["Qwen3.6-27B-Q5_K_S.gguf"]="qwen3.6-27b-mtp"
  ["Qwen3.6-27B-Q5_K_M.gguf"]="qwen3.6-27b-mtp"
  ["Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf"]="qwen3-coder-30b-a3b"
  ["ALLaM-Q4_K_M.gguf"]="allam-7b"
  ["ALLaM-7B-Instruct-Q4_K_M.gguf"]="allam-7b"
  ["ALLaM-7B-Q4_K_M.gguf"]="allam-7b"
)

# Priority order (first match wins). The top entry becomes the provider's
# PRIMARY inference server: takes port 8080 and is auto-enabled+started.
# Everything else gets a unit written for fast swap, but it is left
# disabled — we cannot load multiple 16GB+ models on a 24GB card.
# To swap the primary: systemctl --user stop dcp-llama-<current>; edit
# the new unit to use port 8080; enable+start it.
PRIMARY_ALIAS_PRIORITY=(
  "qwen3.6-27b-mtp"
  "qwen3-coder-30b-a3b"
  "allam-7b"
)

# Allocate unique ports per model. Primary → 8080. Standby units → 8090+.
STANDBY_PORT_NEXT=8090

short_id_for() {
  # Derive a filesystem-friendly short id for the unit name.
  local fname="$1"
  local alias="${ALIAS_MAP[$fname]:-}"
  if [[ -n "$alias" ]]; then
    printf '%s' "$alias"
  else
    printf '%s' "$(basename "$fname" .gguf | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-\+/-/g; s/^-//; s/-$//')"
  fi
}

declare -i COUNT_NEW=0 COUNT_SKIP=0
PRIMARY_ASSIGNED=0

# Walk ggufs in priority order. For each priority alias, find the first
# matching file on disk. The first alias whose file exists wins port 8080.
declare -a ORDERED_GGUFS=()
declare -A SEEN_ALIAS=()
for prio_alias in "${PRIMARY_ALIAS_PRIORITY[@]}"; do
  for gguf in "$MODEL_DIR"/*.gguf; do
    [[ -f "$gguf" ]] || continue
    fname="$(basename "$gguf")"
    if [[ "${ALIAS_MAP[$fname]:-}" == "$prio_alias" ]] && [[ -z "${SEEN_ALIAS[$prio_alias]:-}" ]]; then
      ORDERED_GGUFS+=("$gguf")
      SEEN_ALIAS[$prio_alias]=1
      break
    fi
  done
done
# Append any ggufs that didn't match a priority alias (unknown models).
for gguf in "$MODEL_DIR"/*.gguf; do
  [[ -f "$gguf" ]] || continue
  fname="$(basename "$gguf")"
  if [[ -z "${ALIAS_MAP[$fname]:-}" ]]; then
    ORDERED_GGUFS+=("$gguf")
  fi
done

shopt -s nullglob
for gguf in "${ORDERED_GGUFS[@]}"; do
  fname="$(basename "$gguf")"
  short_id="$(short_id_for "$fname")"
  unit_name="dcp-llama-${short_id}.service"
  unit_path="$UNIT_DIR/$unit_name"
  alias="${ALIAS_MAP[$fname]:-$short_id}"
  if (( PRIMARY_ASSIGNED == 0 )); then
    port=$DEFAULT_PORT
    is_primary=1
    PRIMARY_ASSIGNED=1
  else
    port=$STANDBY_PORT_NEXT
    STANDBY_PORT_NEXT=$((STANDBY_PORT_NEXT + 1))
    is_primary=0
  fi

  if [[ -f "$unit_path" ]] && (( FORCE == 0 )); then
    log "SKIP $unit_name (exists; pass --force to overwrite)"
    COUNT_SKIP+=1
    continue
  fi

  if (( DRY_RUN )); then
    log "DRY-RUN: would write $unit_path for $fname → alias=$alias port=$port"
    COUNT_NEW+=1
    continue
  fi

  # Note on --model-draft: MTP-flavour ggufs (qwen3.6-mtp) embed the draft
  # head inside the same file. Passing --model-draft for the same gguf
  # tries to load a SECOND full-weight copy and OOMs on a 24GB card. So
  # we intentionally do not include --model-draft here; llama-server
  # auto-engages MTP from the gguf metadata when present.
  cat > "$unit_path" <<UNIT
[Unit]
Description=DCP llama-server: ${alias} (model=${fname})
Documentation=See backend/installers/setup-inference-supervisors.sh and incident_node2_oom_2026-05-21.md
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${HOME}
ExecStart=${LLAMA_SERVER} \\
  --host 0.0.0.0 \\
  --port ${port} \\
  --model ${gguf} \\
  --alias ${alias} \\
  --ctx-size ${DEFAULT_CTX} \\
  --n-gpu-layers 999 \\
  --cache-ram ${DEFAULT_CACHE_MIB} \\
  --metrics
StandardOutput=append:${LOG_DIR}/llama-${short_id}-stdout.log
StandardError=append:${LOG_DIR}/llama-${short_id}-stderr.log
Restart=on-failure
RestartSec=15s
TimeoutStartSec=180s
TimeoutStopSec=30s
StartLimitBurst=5
StartLimitIntervalSec=600

[Install]
WantedBy=default.target
UNIT

  if (( is_primary )); then
    ln -sf "$unit_path" "$UNIT_DIR/dcp-llama-primary.link"
    log "WROTE $unit_path  (PRIMARY alias=$alias port=$port)"
  else
    log "WROTE $unit_path  (standby alias=$alias port=$port disabled)"
  fi
  COUNT_NEW+=1
done

if (( DRY_RUN )); then
  log "DRY-RUN summary: $COUNT_NEW would-write, $COUNT_SKIP skip"
  exit 0
fi

systemctl --user daemon-reload

# Only the primary unit gets enabled+started (one model at a time on a
# single GPU). Standby units are left disabled — admin enables them by
# hand when swapping.
PRIMARY_UNIT="$UNIT_DIR/dcp-llama-primary.link"
if [[ -L "$PRIMARY_UNIT" ]] || [[ -f "$PRIMARY_UNIT" ]]; then
  primary_name="$(basename "$(readlink -f "$PRIMARY_UNIT" 2>/dev/null || echo "$PRIMARY_UNIT")")"
  systemctl --user enable "$primary_name" >/dev/null 2>&1 || true
  if ! systemctl --user is-active --quiet "$primary_name"; then
    log "START primary: $primary_name"
    systemctl --user start "$primary_name" || warn "start $primary_name failed (check journalctl)"
  else
    log "ACTIVE primary: $primary_name (skip start)"
  fi
else
  warn "no primary unit symlink found; nothing started"
fi

log "DONE. new=$COUNT_NEW skip=$COUNT_SKIP primary_assigned=$PRIMARY_ASSIGNED"
log "Health: ss -tlnp | grep -E ':80[0-9]+'"
log "Logs:   journalctl --user -u 'dcp-llama-*' --since '5 min ago'"
log "Swap primary: stop current, edit standby's --port to 8080, enable+start it"
