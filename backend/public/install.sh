#!/usr/bin/env bash
set -euo pipefail

API_BASE="${DCP_API_BASE:-https://api.dcp.sa}"
CONFIG_DIR="${HOME}/.dcp"
CONFIG_FILE="${CONFIG_DIR}/config"
INSTALL_DIR="${HOME}/dcp-provider"
LOG_DIR="${INSTALL_DIR}/logs"
DAEMON_PATH="${INSTALL_DIR}/dcp_daemon.py"
PID_FILE="${INSTALL_DIR}/dcp_daemon.pid"

LAUNCHD_LABEL="com.dcp.provider"
LAUNCHD_PLIST="${HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
SYSTEMD_USER_UNIT_DIR="${HOME}/.config/systemd/user"
SYSTEMD_USER_UNIT="${SYSTEMD_USER_UNIT_DIR}/dcp-provider.service"
SYSTEMD_SYSTEM_UNIT="/etc/systemd/system/dcp-provider.service"

OS_UNAME="$(uname -s 2>/dev/null || echo unknown)"
case "${OS_UNAME}" in
  Linux*) DCP_OS="linux" ;;
  Darwin*) DCP_OS="mac" ;;
  *) DCP_OS="linux" ;;
esac

# Inputs (any can come via env vars):
#   DCP_PROVIDER_KEY    long-lived daemon api_key (dcpk_… or legacy dcp-provider-…)
#   DCP_INSTALL_TOKEN   short-lived wizard token (dcpt_…) — exchanged once for an api_key
#   DCP_PROVIDER_EMAIL  email for self-register fallback
#   DCP_PROVIDER_NAME   display name override
#   DCP_PROVIDER_PHONE  phone for PDPL onboarding
#   DCP_API_BASE        override API_BASE (defaults to https://api.dcp.sa)
#   DCP_SYSTEMD_MODE    user|system (Linux only, default user)
DCP_PROVIDER_KEY="${DCP_PROVIDER_KEY:-}"
DCP_INSTALL_TOKEN="${DCP_INSTALL_TOKEN:-}"
DCP_PROVIDER_ID="${DCP_PROVIDER_ID:-}"
DCP_PROVIDER_EMAIL="${DCP_PROVIDER_EMAIL:-}"
DCP_PROVIDER_NAME="${DCP_PROVIDER_NAME:-}"
DCP_PROVIDER_PHONE="${DCP_PROVIDER_PHONE:-}"
DCP_SYSTEMD_MODE="${DCP_SYSTEMD_MODE:-user}" # user (default) or system

# Engine selection: "vllm" or "ollama" — set by select_engine()
DCP_ENGINE="${DCP_ENGINE:-vllm}"

# ── Argument parser ───────────────────────────────────────────────────────
# Supports both flag style (preferred, what the wizard emits) and the legacy
# positional style for backward compatibility:
#
#   curl … | bash -s -- --token dcpt_xxx                    (wizard)
#   curl … | bash -s -- --api-key dcp-provider-xxx          (manual)
#   curl … | bash -s -- --email me@example.com              (self-register)
#   curl … | bash -s -- me@example.com https://api.foo      (legacy positional)
while [ $# -gt 0 ]; do
  case "$1" in
    --token|-t)
      DCP_INSTALL_TOKEN="${2:-}"; shift 2 ;;
    --api-key|-k)
      DCP_PROVIDER_KEY="${2:-}"; shift 2 ;;
    --email|-e)
      DCP_PROVIDER_EMAIL="${2:-}"; shift 2 ;;
    --name)
      DCP_PROVIDER_NAME="${2:-}"; shift 2 ;;
    --phone)
      DCP_PROVIDER_PHONE="${2:-}"; shift 2 ;;
    --api-base)
      API_BASE="${2:-${API_BASE}}"; shift 2 ;;
    --systemd-mode)
      DCP_SYSTEMD_MODE="${2:-${DCP_SYSTEMD_MODE}}"; shift 2 ;;
    --engine)
      DCP_ENGINE="${2:-${DCP_ENGINE}}"; shift 2 ;;
    --help|-h)
      cat <<'USAGE'
DCP provider installer.

Usage:
  curl -fsSL https://dcp.sa/install.sh | sudo bash -s -- [flags]

Flags:
  --token TOKEN       wizard install_token (preferred path)
  --api-key KEY       existing provider api_key (manual install)
  --email EMAIL       email for self-register fallback
  --name NAME         display name (defaults to hostname)
  --phone PHONE       phone for PDPL onboarding
  --api-base URL      API base (default https://api.dcp.sa)
  --systemd-mode MODE user|system (Linux only, default user)
  --engine ENG        vllm|ollama (default vllm; auto-falls-back on Mac/Linux)
USAGE
      exit 0 ;;
    --) shift; break ;;
    -*)
      printf 'WARN: unknown flag %s\n' "$1" >&2; shift ;;
    *)
      # Legacy positional: $1 = email|api-key, $2 = api-base
      if [ -z "${DCP_PROVIDER_KEY}" ] && echo "$1" | grep -qE '^(dcp-provider-|dcpk_)'; then
        DCP_PROVIDER_KEY="$1"
      elif [ -z "${DCP_PROVIDER_EMAIL}" ] && echo "$1" | grep -q '@'; then
        DCP_PROVIDER_EMAIL="$1"
      elif echo "$1" | grep -qE '^https?://'; then
        API_BASE="$1"
      fi
      shift ;;
  esac
done

step()    { printf '\n==> %s\n' "$1"; }
info()    { printf '  - %s\n' "$1"; }
success() { printf '  + %s\n' "$1"; }
warn()    { printf '  ! %s\n' "$1"; }
fail()    { printf '\nERROR: %s\n' "$1" >&2; exit 1; }

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

shell_quote() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
}

json_get_string() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

json_get_number() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p" | head -n 1
}

load_config() {
  local env_key="${DCP_PROVIDER_KEY:-}"
  local env_id="${DCP_PROVIDER_ID:-}"
  local env_email="${DCP_PROVIDER_EMAIL:-}"
  local env_name="${DCP_PROVIDER_NAME:-}"
  if [ -f "${CONFIG_FILE}" ]; then
    # shellcheck disable=SC1090
    . "${CONFIG_FILE}"
  fi
  [ -n "${env_key}" ] && DCP_PROVIDER_KEY="${env_key}" || true
  [ -n "${env_id}" ] && DCP_PROVIDER_ID="${env_id}" || true
  [ -n "${env_email}" ] && DCP_PROVIDER_EMAIL="${env_email}" || true
  [ -n "${env_name}" ] && DCP_PROVIDER_NAME="${env_name}" || true
}

write_config() {
  mkdir -p "${CONFIG_DIR}"
  umask 077
  {
    printf "DCP_PROVIDER_KEY='%s'\n" "$(shell_quote "${DCP_PROVIDER_KEY}")"
    printf "DCP_PROVIDER_ID='%s'\n" "$(shell_quote "${DCP_PROVIDER_ID:-}")"
    printf "DCP_PROVIDER_EMAIL='%s'\n" "$(shell_quote "${DCP_PROVIDER_EMAIL:-}")"
    printf "DCP_PROVIDER_NAME='%s'\n" "$(shell_quote "${DCP_PROVIDER_NAME:-}")"
    printf "DCP_API_BASE='%s'\n" "$(shell_quote "${API_BASE}")"
  } > "${CONFIG_FILE}"
  chmod 600 "${CONFIG_FILE}"

  # Write systemd-compatible env file for the daemon
  {
    printf "DCP_API_KEY=%s\n" "${DCP_PROVIDER_KEY}"
    printf "DCP_API_URL=%s\n" "${API_BASE}"
    if [ -n "${VLLM_ENDPOINT_URL:-}" ]; then
      printf "VLLM_ENDPOINT_URL=%s\n" "${VLLM_ENDPOINT_URL}"
    fi
    # Engine-specific env vars
    if [ "${DCP_ENGINE}" = "mlx" ]; then
      printf "DCP_ENGINE=mlx\n"
      printf "DCP_INFERENCE_PORT=8000\n"
    elif [ "${DCP_ENGINE}" = "ollama" ]; then
      printf "DCP_ENGINE=ollama\n"
      printf "OLLAMA_FLASH_ATTENTION=1\n"
      printf "DCP_INFERENCE_PORT=11434\n"
    else
      printf "DCP_ENGINE=vllm\n"
      printf "DCP_INFERENCE_PORT=8000\n"
    fi
    # Served model info — daemon reads these for heartbeats and pre-caching
    printf "DCP_SERVED_MODEL=%s\n" "${DCP_MODEL:-}"
  } > "${CONFIG_DIR}/env"
  chmod 600 "${CONFIG_DIR}/env"
}

detect_gpu() {
  if command -v nvidia-smi >/dev/null 2>&1; then
    GPU_MODEL="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    VRAM_MIB_RAW="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d '[:space:]')"
    if [ -z "${GPU_MODEL}" ]; then
      GPU_MODEL="NVIDIA GPU"
    fi
    if [ -n "${VRAM_MIB_RAW}" ] && [ "${VRAM_MIB_RAW}" -ge 0 ] 2>/dev/null; then
      VRAM_GB="$(( (VRAM_MIB_RAW + 512) / 1024 ))"
    else
      VRAM_GB=0
    fi
    # Detect compute capability and driver version
    GPU_COMPUTE_CAP="$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d '[:space:]')"
    DRIVER_VERSION="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 | tr -d '[:space:]')"
  else
    GPU_MODEL="CPU"
    VRAM_GB=0
    GPU_COMPUTE_CAP=""
    DRIVER_VERSION=""
  fi
}

ensure_python() {
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  else
    fail "python3 is required. Install Python 3.8+ and re-run this installer."
  fi
}

exchange_install_token() {
  # Wizard path: trade a short-lived install_token for a long-lived api_key
  # via POST /v1/provider/register-node. Idempotent only on the first call —
  # the backend marks the token consumed atomically.
  [ -n "${DCP_INSTALL_TOKEN}" ] || return 0
  [ -n "${DCP_PROVIDER_KEY}" ] && return 0  # api_key already known, skip

  step "Exchanging wizard install token for API key"
  local hostname os payload response api_key err
  hostname="$(hostname 2>/dev/null || echo unknown)"
  os="${DCP_OS}"
  payload=$(cat <<JSON
{"install_token":"$(json_escape "${DCP_INSTALL_TOKEN}")","hostname":"$(json_escape "${hostname}")","os":"${os}","gpu_detected":[{"vendor":"$(json_escape "${GPU_VENDOR:-NVIDIA}")","model":"$(json_escape "${GPU_MODEL:-unknown}")","vram_mb":${VRAM_MB:-0}}],"daemon_version":"installer-${DCP_OS}"}
JSON
)
  response="$(curl -sS -X POST "${API_BASE}/v1/provider/register-node" -H "Content-Type: application/json" -d "${payload}" || true)"
  api_key="$(json_get_string "${response}" "api_key")"
  if [ -z "${api_key}" ]; then
    err="$(json_get_string "${response}" "message")"
    [ -n "${err}" ] || err="$(json_get_string "${response}" "error")"
    [ -n "${err}" ] || err="register-node returned: ${response}"
    fail "Install-token exchange failed: ${err}"
  fi
  DCP_PROVIDER_KEY="${api_key}"
  DCP_PROVIDER_ID="$(json_get_string "${response}" "node_id")"
  success "API key minted from install token (provider node ${DCP_PROVIDER_ID:-unknown})."
}

register_provider_if_needed() {
  # Preferred path: wizard-issued install token → /v1/provider/register-node.
  if [ -n "${DCP_INSTALL_TOKEN}" ] && [ -z "${DCP_PROVIDER_KEY}" ]; then
    exchange_install_token
    [ -n "${DCP_PROVIDER_KEY}" ] && return
  fi

  if [ -n "${DCP_PROVIDER_KEY}" ]; then
    info "Provider key found."
    return
  fi

  # Ask for existing key first
  if [ -r /dev/tty ]; then
    echo ""
    info "Register at https://dcp.sa/setup to get your API key."
    echo ""
    read -r -p "  Enter your DCP provider API key (dcp-provider-... or dcpk_...): " DCP_PROVIDER_KEY </dev/tty
    echo ""
    if [ -n "${DCP_PROVIDER_KEY}" ]; then
      if echo "${DCP_PROVIDER_KEY}" | grep -qE "^(dcp-provider-|dcpk_)"; then
        success "API key accepted"
        return
      else
        warn "Key doesn't look right (expected dcp-provider-… or dcpk_…). Trying auto-registration."
        DCP_PROVIDER_KEY=""
      fi
    fi
  fi

  # Fallback: auto-register with email
  [ -n "${DCP_PROVIDER_NAME}" ] || DCP_PROVIDER_NAME="$(hostname 2>/dev/null || whoami)"

  if [ -z "${DCP_PROVIDER_EMAIL}" ] && [ -r /dev/tty ]; then
    read -r -p "  No API key? Enter your email to register: " DCP_PROVIDER_EMAIL </dev/tty
  fi
  [ -n "${DCP_PROVIDER_EMAIL}" ] || fail "API key or email required. Register at https://dcp.sa/setup"

  local payload
  payload=$(cat <<JSON
{"name":"$(json_escape "${DCP_PROVIDER_NAME}")","email":"$(json_escape "${DCP_PROVIDER_EMAIL}")","gpu_model":"$(json_escape "${GPU_MODEL}")","os":"${DCP_OS}","phone":"$(json_escape "${DCP_PROVIDER_PHONE}")","resource_spec":{"gpu":{"model":"$(json_escape "${GPU_MODEL}")","vram_gb":${VRAM_GB}}}}
JSON
)

  info "Registering provider at ${API_BASE}/api/providers/register"
  local response
  response="$(curl -sS -X POST "${API_BASE}/api/providers/register" -H "Content-Type: application/json" -d "${payload}" || true)"

  local api_key
  api_key="$(json_get_string "${response}" "api_key")"
  if [ -z "${api_key}" ]; then
    local err
    err="$(json_get_string "${response}" "error")"
    [ -n "${err}" ] || err="Registration failed: ${response}"
    fail "${err}"
  fi

  DCP_PROVIDER_KEY="${api_key}"
  DCP_PROVIDER_ID="$(json_get_number "${response}" "provider_id")"
  info "Provider registration complete (id: ${DCP_PROVIDER_ID:-unknown})."
}

setup_wireguard() {
  if [ "${DCP_OS}" = "mac" ]; then
    if ! command -v wg >/dev/null 2>&1; then
      info "Installing WireGuard via Homebrew..."
      brew install wireguard-tools 2>/dev/null || warn "Could not install WireGuard. Install manually: brew install wireguard-tools"
    fi
  else
    if ! command -v wg >/dev/null 2>&1; then
      info "Installing WireGuard..."
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq && sudo apt-get install -y -qq wireguard-tools 2>&1 | tail -2
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y wireguard-tools 2>&1 | tail -2
      elif command -v yum >/dev/null 2>&1; then
        sudo yum install -y wireguard-tools 2>&1 | tail -2
      else
        warn "Could not install WireGuard automatically. Install wireguard-tools manually."
      fi
    fi
  fi

  if ! command -v wg >/dev/null 2>&1; then
    warn "WireGuard not available. VPN setup will be needed later for NAT traversal."
    return
  fi

  local wg_dir="${CONFIG_DIR}/wireguard"
  mkdir -p "${wg_dir}"

  if [ -f "${wg_dir}/private.key" ]; then
    info "WireGuard keypair already exists."
  else
    wg genkey > "${wg_dir}/private.key"
    chmod 600 "${wg_dir}/private.key"
    wg pubkey < "${wg_dir}/private.key" > "${wg_dir}/public.key"
    info "WireGuard keypair generated."
  fi

  local wg_pubkey
  wg_pubkey="$(cat "${wg_dir}/public.key")"

  # Register WireGuard public key with the backend
  local wg_response
  wg_response="$(curl -sS -X POST "${API_BASE}/api/providers/wireguard" \
    -H "Content-Type: application/json" \
    -H "x-provider-key: ${DCP_PROVIDER_KEY}" \
    -d "{\"public_key\":\"${wg_pubkey}\"}" 2>/dev/null || echo "{}")"

  local wg_ip
  wg_ip="$(json_get_string "${wg_response}" "assigned_ip")"
  local wg_endpoint
  wg_endpoint="$(json_get_string "${wg_response}" "endpoint")"
  local wg_server_pubkey
  wg_server_pubkey="$(json_get_string "${wg_response}" "server_public_key")"

  if [ -n "${wg_ip}" ] && [ -n "${wg_server_pubkey}" ]; then
    # Write WireGuard config. MTU 1420 is WG's default and works on most
    # links; the daemon's self-heal loop drops to 1280 if pings fail (broken
    # NAT/PPPoE/cellular). PersistentKeepalive=25 keeps NAT bindings alive.
    cat > "${wg_dir}/wg0.conf" <<WGCONF
[Interface]
PrivateKey = $(cat "${wg_dir}/private.key")
Address = ${wg_ip}/24
MTU = 1420

[Peer]
PublicKey = ${wg_server_pubkey}
Endpoint = ${wg_endpoint:-vpn.dcp.sa:51820}
AllowedIPs = 10.0.0.0/24
PersistentKeepalive = 25
WGCONF
    chmod 600 "${wg_dir}/wg0.conf"

    # Move to the OS-canonical path so wg-quick / systemd / launchd find it.
    if [ "${DCP_OS}" = "linux" ]; then
      sudo install -m 600 "${wg_dir}/wg0.conf" /etc/wireguard/wg0.conf 2>/dev/null \
        || sudo cp "${wg_dir}/wg0.conf" /etc/wireguard/wg0.conf
    else
      sudo install -m 600 "${wg_dir}/wg0.conf" /etc/wireguard/wg0.conf 2>/dev/null \
        || sudo mkdir -p /etc/wireguard && sudo cp "${wg_dir}/wg0.conf" /etc/wireguard/wg0.conf
    fi

    info "WireGuard config written. Activating tunnel..."
    # Bring it up once interactively so we can verify before persisting.
    sudo wg-quick down wg0 2>/dev/null || true
    if ! sudo wg-quick up wg0 2>&1 | tail -3; then
      fail "wg-quick up failed. Check 'sudo wg show' and the endpoint at ${wg_endpoint:-vpn.dcp.sa:51820}."
    fi

    # ── Verify the handshake actually completed ─────────────────────────
    # A "successful" wg-quick up doesn't mean the peer responded. Ping the
    # VPS WG IP from inside the tunnel; if no reply in 5 attempts, the
    # tunnel is dead-on-arrival and we must fail loudly.
    local server_wg_ip="${wg_endpoint%%:*}"
    # If endpoint resolves to a public IP/hostname, the in-tunnel IP is the
    # first usable address in AllowedIPs. Default to 10.0.0.1.
    local tunnel_target
    tunnel_target="$(echo "${wg_response}" | sed -n 's/.*"server_tunnel_ip"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    [ -n "${tunnel_target}" ] || tunnel_target="10.0.0.1"

    info "Verifying tunnel reachability (target: ${tunnel_target})..."
    local ok=0 i
    for i in 1 2 3 4 5; do
      if ping -c 1 -W 2 "${tunnel_target}" >/dev/null 2>&1; then
        ok=1; break
      fi
      sleep 1
    done
    if [ "${ok}" -eq 1 ]; then
      success "Tunnel handshake confirmed (ping to ${tunnel_target} OK)."
    else
      warn "Tunnel up but no reply from ${tunnel_target}. Daemon will retry + self-heal."
      warn "If this persists, your network may be blocking UDP/51820. Tier 2 work will add a UDP/443 fallback."
    fi

    # ── Persist the tunnel across reboots / sleep / network changes ─────
    if [ "${DCP_OS}" = "linux" ]; then
      # systemd unit shipped by wireguard-tools — just enable it.
      if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl enable --now wg-quick@wg0.service 2>&1 | tail -2 \
          && success "WireGuard persisted via wg-quick@wg0.service" \
          || warn "Could not enable wg-quick@wg0 systemd unit. Tunnel won't survive reboot."
      else
        warn "No systemctl found; tunnel won't survive reboot. Add a init.d script manually."
      fi
    elif [ "${DCP_OS}" = "mac" ]; then
      # launchd LaunchDaemon — runs as root, KeepAlive on network change,
      # re-ups tunnel after wake-from-sleep.
      local plist=/Library/LaunchDaemons/com.dcp.wireguard.plist
      sudo tee "${plist}" >/dev/null <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.dcp.wireguard</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string>
    <string>/usr/bin/env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin wg-quick down wg0 2>/dev/null; /usr/bin/env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin wg-quick up wg0</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>NetworkState</key><true/></dict>
  <key>StandardOutPath</key><string>/var/log/dcp-wireguard.log</string>
  <key>StandardErrorPath</key><string>/var/log/dcp-wireguard.log</string>
</dict></plist>
PLIST
      sudo launchctl unload "${plist}" 2>/dev/null || true
      sudo launchctl load -w "${plist}" 2>&1 | tail -2 \
        && success "WireGuard persisted via launchd (re-ups on wake/network change)" \
        || warn "Could not load launchd plist. Tunnel won't survive reboot/sleep."
    fi
    info "VPN public key: ${wg_pubkey}"
  else
    info "WireGuard public key: ${wg_pubkey}"
    info "VPN config will be assigned by DCP after approval."
  fi
}


# ---------------------------------------------------------------------------
# Engine selection: pick vLLM or Ollama based on GPU architecture
# ---------------------------------------------------------------------------
# NOTE: Ollama saturates at ~3 concurrent users (per-user TPS drops >50%).
# For high-concurrency use cases, vLLM with continuous batching is required.
# Blackwell vLLM support expected when cu130 wheels ship.
# ---------------------------------------------------------------------------
select_engine() {
  local compute_cap="${GPU_COMPUTE_CAP:-}"
  local gpu_arch="unknown"

  # ── Apple Silicon detection (must come before NVIDIA check) ──────────
  if [ "${DCP_OS}" = "mac" ]; then
    local chip_name=""
    chip_name="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || true)"
    if echo "${chip_name}" | grep -qi "apple"; then
      local total_mem_gb
      total_mem_gb="$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1/1073741824}')"
      DCP_ENGINE="mlx"
      VRAM_GB="${total_mem_gb}"
      GPU_MODEL="${chip_name}"
      info "Apple Silicon detected: ${chip_name} (${total_mem_gb} GB unified memory)"
      info "Using MLX engine (3x faster than Ollama on Apple Silicon)"
      return
    fi
  fi

  if [ -z "${compute_cap}" ]; then
    # No NVIDIA GPU and not Apple Silicon — CPU-only mode
    DCP_ENGINE="ollama"
    info "No GPU detected — using Ollama (CPU mode)"
    return
  fi

  case "${compute_cap}" in
    12.*) gpu_arch="blackwell_consumer" ;;  # RTX 5090, 5080
    10.*) gpu_arch="blackwell_dc" ;;        # B100, B200, GB200
    9.*)  gpu_arch="hopper" ;;              # H100, H200
    8.9)  gpu_arch="ada" ;;                 # RTX 4090, L40S, L4
    8.6)  gpu_arch="ampere86" ;;            # RTX 3090, A40, A5000, A6000
    8.0)  gpu_arch="ampere" ;;              # A100
    *)    gpu_arch="unknown" ;;
  esac
  info "GPU compute: ${compute_cap} (${gpu_arch})"

  case "${gpu_arch}" in
    blackwell_consumer)
      # RTX 5090/5080: vLLM broken (11.4 tok/s), Ollama gives 182 tok/s
      DCP_ENGINE="ollama"
      info "Blackwell consumer GPU — using Ollama (vLLM broken on sm_120)"
      ;;
    ampere|ampere86|ada|hopper)
      # Ampere/Ada/Hopper: vLLM needs ~3GB overhead + model.
      # GPUs with <16GB VRAM should use Ollama (lighter, no PyTorch needed).
      if [ "${VRAM_GB}" -ge 16 ]; then
        DCP_ENGINE="vllm"
        info "Using vLLM + Marlin kernels (${gpu_arch}, ${VRAM_GB}GB VRAM)"
      else
        DCP_ENGINE="ollama"
        info "Using Ollama (${gpu_arch}, ${VRAM_GB}GB VRAM — too small for vLLM overhead)"
      fi
      ;;
    blackwell_dc)
      # B100/B200: vLLM should work with proper wheels
      DCP_ENGINE="vllm"
      info "Blackwell datacenter GPU — using vLLM"
      ;;
    *)
      # Unknown architecture — default to Ollama for safety
      DCP_ENGINE="ollama"
      info "Unknown GPU architecture (${compute_cap}) — using Ollama"
      ;;
  esac

  if [ -n "${DRIVER_VERSION:-}" ]; then
    info "Driver version: ${DRIVER_VERSION}"
  fi

  # Allow override via env var
  if [ -n "${DCP_ENGINE_OVERRIDE:-}" ]; then
    DCP_ENGINE="${DCP_ENGINE_OVERRIDE}"
    info "Engine overridden to: ${DCP_ENGINE}"
  fi
}


# ---------------------------------------------------------------------------
# Model selection based on VRAM and engine
# ---------------------------------------------------------------------------
# Verified benchmark data from DCP-MODEL-GPU-MATRIX.md (2026-04-09)
# Mixtral 8x7B does NOT fit on any GPU under 48GB — requires CPU offloading
# and only gets 12 tok/s. Never select it for < 48GB.
# ---------------------------------------------------------------------------
select_model_for_vram() {
  DCP_MODEL_EXTRA_ARGS=""
  DCP_NEEDS_VLLM_UPGRADE=false

  if [ "${DCP_ENGINE}" = "mlx" ]; then
    # -----------------------------------------------------------------------
    # MLX model selection (Apple Silicon Macs)
    # MLX is 3x faster than Ollama on Apple Silicon — mandatory for Mac providers.
    # Uses unified memory (shared CPU+GPU), so VRAM_GB = total system RAM.
    # MoE models are critical: 35B total / 3B active = quality + speed.
    # Benchmark source: DCP-APPLE-SILICON-BENCHMARK-RESEARCH.md (2026-04-13)
    # -----------------------------------------------------------------------
    if [ "${VRAM_GB}" -ge 128 ]; then
      DCP_MODEL="mlx-community/Qwen3.5-35B-A3B-4bit"
      info "Selected: Qwen3.5 35B-A3B MoE via MLX (${VRAM_GB}GB unified, ~130 tok/s)"
    elif [ "${VRAM_GB}" -ge 64 ]; then
      DCP_MODEL="mlx-community/Qwen3-30B-A3B-4bit"
      info "Selected: Qwen3 30B-A3B MoE via MLX (${VRAM_GB}GB unified, ~92 tok/s)"
    elif [ "${VRAM_GB}" -ge 32 ]; then
      DCP_MODEL="mlx-community/Qwen3-30B-A3B-4bit"
      info "Selected: Qwen3 30B-A3B MoE via MLX (${VRAM_GB}GB unified, ~35-40 tok/s)"
    elif [ "${VRAM_GB}" -ge 16 ]; then
      DCP_MODEL="mlx-community/Qwen3-8B-4bit"
      info "Selected: Qwen3 8B via MLX (${VRAM_GB}GB unified, ~35-45 tok/s)"
    elif [ "${VRAM_GB}" -ge 8 ]; then
      DCP_MODEL="mlx-community/Qwen3-4B-4bit"
      info "Selected: Qwen3 4B via MLX (${VRAM_GB}GB unified, ~30-40 tok/s)"
    else
      DCP_MODEL="mlx-community/Qwen3-4B-4bit"
      info "Selected: Qwen3 4B via MLX (${VRAM_GB}GB unified, CPU fallback)"
    fi
  elif [ "${DCP_ENGINE}" = "ollama" ]; then
    # -----------------------------------------------------------------------
    # Ollama model selection (Blackwell / CPU / small NVIDIA GPUs)
    # Model names use ollama pull format (e.g., qwen3:30b-a3b)
    # -----------------------------------------------------------------------
    if [ "${VRAM_GB}" -ge 28 ]; then
      DCP_MODEL="qwen3:30b-a3b"
      info "Selected: Qwen3 30B-A3B MoE (${VRAM_GB}GB GPU, ~182 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 20 ]; then
      DCP_MODEL="qwen3:30b-a3b"
      info "Selected: Qwen3 30B-A3B MoE (${VRAM_GB}GB GPU, ~182 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 12 ]; then
      DCP_MODEL="qwen2.5:14b"
      info "Selected: Qwen2.5 14B (${VRAM_GB}GB GPU, ~144 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 8 ]; then
      DCP_MODEL="qwen3:8b"
      info "Selected: Qwen3 8B (${VRAM_GB}GB GPU, ~197 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 4 ]; then
      DCP_MODEL="qwen2.5:7b"
      info "Selected: Qwen2.5 7B (${VRAM_GB}GB GPU, ~270 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 1 ]; then
      DCP_MODEL="qwen3:4b"
      info "Selected: Qwen3 4B (${VRAM_GB}GB GPU, ~270 tok/s verified)"
    else
      # CPU-only: smallest model
      DCP_MODEL="qwen3:4b"
      info "Selected: Qwen3 4B (CPU mode)"
    fi
  else
    # -----------------------------------------------------------------------
    # vLLM model selection (Ampere / Ada / Hopper)
    # HuggingFace model IDs with Marlin quantization flags
    # -----------------------------------------------------------------------
    if [ "${VRAM_GB}" -ge 48 ]; then
      DCP_MODEL="Qwen/Qwen3.5-35B-A3B-GPTQ-Int4"
      DCP_MODEL_EXTRA_ARGS="--quantization gptq_marlin --dtype bfloat16 --max-num-batched-tokens 2096 --trust-remote-code"
      DCP_NEEDS_VLLM_UPGRADE=true
      info "Selected: Qwen 3.5 35B-A3B (48GB+ GPU)"
    elif [ "${VRAM_GB}" -ge 28 ]; then
      DCP_MODEL="Qwen/Qwen3.5-35B-A3B-GPTQ-Int4"
      DCP_MODEL_EXTRA_ARGS="--quantization gptq_marlin --dtype bfloat16 --max-model-len 16384 --max-num-batched-tokens 2096 --trust-remote-code"
      DCP_NEEDS_VLLM_UPGRADE=true
      info "Selected: Qwen 3.5 35B-A3B (${VRAM_GB}GB GPU)"
    elif [ "${VRAM_GB}" -ge 20 ]; then
      DCP_MODEL="Qwen/Qwen3-30B-A3B-GPTQ-Int4"
      DCP_MODEL_EXTRA_ARGS="--quantization gptq_marlin --max-model-len 8192 --enable-prefix-caching --trust-remote-code"
      info "Selected: Qwen3 30B-A3B MoE + Marlin (${VRAM_GB}GB GPU, ~197 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 12 ]; then
      DCP_MODEL="Qwen/Qwen2.5-7B-Instruct-AWQ"
      DCP_MODEL_EXTRA_ARGS="--quantization awq_marlin --max-model-len 8192"
      info "Selected: Qwen 2.5 7B AWQ + Marlin (${VRAM_GB}GB GPU, ~138 tok/s verified)"
    elif [ "${VRAM_GB}" -ge 8 ]; then
      DCP_MODEL="Qwen/Qwen2.5-3B-Instruct"
      DCP_MODEL_EXTRA_ARGS="--max-model-len 8192"
      info "Selected: Qwen 2.5 3B (8GB GPU)"
    else
      fail "GPU has less than 8GB VRAM. Minimum: 8GB."
    fi
  fi

  # Allow override via env var
  if [ -n "${DCP_MODEL_OVERRIDE:-}" ]; then
    DCP_MODEL="${DCP_MODEL_OVERRIDE}"
    DCP_MODEL_EXTRA_ARGS="${DCP_MODEL_EXTRA_ARGS_OVERRIDE:-}"
    info "Model overridden to: ${DCP_MODEL}"
  fi
}


# ---------------------------------------------------------------------------
# Ollama install + start functions
# ---------------------------------------------------------------------------
install_mlx() {
  # MLX engine for Apple Silicon Macs — pip install mlx + mlx-lm
  info "Installing MLX engine for Apple Silicon..."
  "${PYTHON_BIN}" -m pip install --break-system-packages -q mlx mlx-lm 2>&1 | tail -3 || {
    warn "pip install failed, trying with --user flag"
    "${PYTHON_BIN}" -m pip install --user -q mlx mlx-lm 2>&1 | tail -3 || {
      fail "Could not install MLX. Please install manually: pip install mlx mlx-lm"
    }
  }
  success "MLX installed"
}

start_mlx_server() {
  # Start MLX as an OpenAI-compatible server on port 8000
  info "Downloading model ${DCP_MODEL} (this may take a few minutes)..."
  nohup "${PYTHON_BIN}" -m mlx_lm.server \
    --model "${DCP_MODEL}" \
    --host 0.0.0.0 \
    --port 8000 \
    >> "${LOG_DIR}/mlx-server.log" 2>&1 &
  local mlx_pid=$!
  echo "${mlx_pid}" > "${INSTALL_DIR}/mlx-server.pid"
  info "MLX server starting (PID ${mlx_pid}), downloading model weights..."
  # Wait for server to become healthy (model download + load)
  local attempts=0
  while [ $attempts -lt 120 ]; do
    if curl -s http://localhost:8000/v1/models >/dev/null 2>&1; then
      success "MLX server ready — serving ${DCP_MODEL}"
      return
    fi
    sleep 5
    attempts=$((attempts + 1))
  done
  warn "MLX server did not become ready in 10 minutes. Check ${LOG_DIR}/mlx-server.log"
}

install_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    info "Ollama already installed"
    return
  fi
  # Need zstd for new Ollama installer (sudo if not root)
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" = "0" ]; then
      apt-get update -qq && apt-get install -y -qq zstd curl 2>&1 | tail -1
    elif command -v sudo >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y -qq zstd curl 2>&1 | tail -1
    else
      warn "Cannot install zstd (not root and no sudo). Ollama install may fail."
    fi
  fi
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh 2>&1 | tail -3
  success "Ollama installed"
}

start_ollama() {
  # Check if already running
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    info "Ollama already running"
  else
    info "Starting Ollama..."
    OLLAMA_FLASH_ATTENTION=1 nohup ollama serve > "${LOG_DIR}/ollama.log" 2>&1 &
    echo $! > "${INSTALL_DIR}/ollama.pid"
    sleep 5
  fi

  info "Pulling model ${DCP_MODEL}..."
  ollama pull "${DCP_MODEL}" 2>&1 | tail -3

  # Verify it works
  local test_result
  test_result=$(curl -s http://localhost:11434/api/chat \
    -d "{\"model\":\"${DCP_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}],\"stream\":false,\"think\":false}" \
    --max-time 120)

  if echo "$test_result" | grep -q "eval_count"; then
    success "Ollama serving ${DCP_MODEL}"
  else
    warn "Ollama model test failed. Check ${LOG_DIR}/ollama.log"
  fi
}


# ---------------------------------------------------------------------------
# vLLM install + start functions (Ampere / Ada / Hopper)
# ---------------------------------------------------------------------------
install_vllm() {
  # Step 1: Detect GPU architecture (for PyTorch CUDA version + vLLM build)
  local compute_cap="${GPU_COMPUTE_CAP:-}"
  local gpu_arch="standard"
  if [ -n "${compute_cap}" ]; then
    case "${compute_cap}" in
      12.*) gpu_arch="blackwell_consumer" ;;  # RTX 5090, 5080
      10.*) gpu_arch="blackwell_dc" ;;        # B100, B200, GB200
      9.*)  gpu_arch="hopper" ;;              # H100, H200
      8.9)  gpu_arch="ada" ;;                 # RTX 4090, L40S, L4
      8.6)  gpu_arch="ampere86" ;;            # RTX 3090, A40, A5000, A6000
      8.0)  gpu_arch="ampere" ;;              # A100
      *)    gpu_arch="standard" ;;
    esac
    info "GPU compute: ${compute_cap} (${gpu_arch})"
  fi

  # Step 2: Install PyTorch (correct CUDA version for architecture)
  if ! "${PYTHON_BIN}" -c "import torch" 2>/dev/null; then
    case "${gpu_arch}" in
      blackwell_consumer|blackwell_dc)
        info "Installing PyTorch with CUDA 12.8 (Blackwell)..."
        "${PYTHON_BIN}" -m pip install --break-system-packages torch --index-url https://download.pytorch.org/whl/cu128 --progress-bar on 2>&1 || \
          "${PYTHON_BIN}" -m pip install --break-system-packages torch --progress-bar on 2>&1 || {
            warn "Could not install PyTorch."; return 1
          }
        ;;
      *)
        info "Installing PyTorch..."
        "${PYTHON_BIN}" -m pip install --break-system-packages torch --progress-bar on 2>&1 || {
          warn "Could not install PyTorch."; return 1
        }
        ;;
    esac
    success "PyTorch installed"
  else
    info "PyTorch already installed"
  fi

  # Step 3: Install vLLM (correct build for GPU architecture)
  local vllm_installed=false
  "${PYTHON_BIN}" -c "import vllm" 2>/dev/null && vllm_installed=true

  case "${gpu_arch}" in
    blackwell_dc)
      # B100/B200: needs cu128 or cu130 wheel
      info "Blackwell datacenter GPU — installing vLLM cu130 build..."
      local vllm_ver="0.19.0"
      local cpu_arch
      cpu_arch="$(uname -m)"
      "${PYTHON_BIN}" -m pip install --break-system-packages -U "https://github.com/vllm-project/vllm/releases/download/v${vllm_ver}/vllm-${vllm_ver}+cu130-cp38-abi3-manylinux_2_35_${cpu_arch}.whl" \
        --extra-index-url https://download.pytorch.org/whl/cu130 --progress-bar on 2>&1 || {
          warn "Could not install vLLM for Blackwell datacenter GPU."
          return 1
        }
      ;;
    *)
      # Ampere, Ada, Hopper: standard pip install
      if [ "${vllm_installed}" = "true" ]; then
        info "vLLM already installed"
      else
        info "Installing vLLM..."
        "${PYTHON_BIN}" -m pip install --break-system-packages vllm --progress-bar on 2>&1 || {
          warn "Could not install vLLM."
          return 1
        }
      fi
      ;;
  esac
  success "vLLM ready"

  # Step 4: Qwen 3.5 / Gemma 4 / GLM-5 need latest transformers
  # Install AFTER vLLM with --no-deps to prevent downgrade
  local needs_dev_transformers=false
  if echo "${DCP_MODEL:-}" | grep -qiE "Qwen3\.5|gemma-4|glm-5"; then
    needs_dev_transformers=true
  fi

  if [ "${needs_dev_transformers}" = "true" ]; then
    info "Model requires latest transformers — installing from source..."
    "${PYTHON_BIN}" -m pip install --break-system-packages -U huggingface_hub --progress-bar on 2>&1 || true
    "${PYTHON_BIN}" -m pip install --break-system-packages --no-deps git+https://github.com/huggingface/transformers.git --progress-bar on 2>&1 || {
      warn "Could not install transformers from source."
      return 1
    }
    success "Transformers updated for ${DCP_MODEL}"
  fi
}

start_vllm() {
  # Check if vLLM is already running on port 8000
  if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    info "vLLM already running on port 8000"
    # Get the model name from the running instance
    local running_model
    running_model="$(curl -s http://localhost:8000/v1/models 2>/dev/null | "${PYTHON_BIN}" -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null || echo "")"
    if [ -n "${running_model}" ]; then
      DCP_MODEL="${running_model}"
      info "Running model: ${DCP_MODEL}"
    fi
    return
  fi

  # Model already selected before install_vllm was called

  # Check disk space — models need 5-30GB depending on size
  local free_disk_gb=""
  free_disk_gb="$(df -BG "${INSTALL_DIR}" 2>/dev/null | awk 'NR==2{gsub(/G/,""); print $4}' || echo "")"
  if [ -z "${free_disk_gb}" ]; then
    # macOS fallback (df doesn't support -BG)
    free_disk_gb="$(df -g "${INSTALL_DIR}" 2>/dev/null | awk 'NR==2{print $4}' || echo "")"
  fi
  if [ -n "${free_disk_gb}" ] && [ "${free_disk_gb}" -lt 15 ] 2>/dev/null; then
    warn "Low disk space: ${free_disk_gb}GB free. Model download needs 10-30GB."
    info "Cleaning up pip cache and old downloads..."
    "${PYTHON_BIN}" -m pip cache purge 2>/dev/null || true
    rm -rf /root/.cache/huggingface/hub/models--*/.no_exist 2>/dev/null || true
    rm -rf /tmp/pip-* /tmp/huggingface-* 2>/dev/null || true
    free_disk_gb="$(df -BG "${INSTALL_DIR}" 2>/dev/null | awk 'NR==2{gsub(/G/,""); print $4}' || echo "0")"
    if [ -n "${free_disk_gb}" ] && [ "${free_disk_gb}" -lt 10 ] 2>/dev/null; then
      fail "Not enough disk space (${free_disk_gb}GB free, need at least 10GB). Add more storage or clean up manually."
    fi
    info "Disk space after cleanup: ${free_disk_gb}GB free"
  else
    info "Disk space: ${free_disk_gb:-unknown}GB free"
  fi

  info "Starting vLLM with ${DCP_MODEL}..."
  info "This will download the model weights on first run (may take several minutes)"

  local vllm_log="${LOG_DIR}/vllm.log"
  mkdir -p "${LOG_DIR}"

  # Start vLLM in background
  nohup "${PYTHON_BIN}" -m vllm.entrypoints.openai.api_server \
    --model "${DCP_MODEL}" \
    --host 0.0.0.0 \
    --port 8000 \
    ${DCP_MODEL_EXTRA_ARGS} \
    > "${vllm_log}" 2>&1 &

  local vllm_pid=$!
  echo "${vllm_pid}" > "${INSTALL_DIR}/vllm.pid"
  info "vLLM starting (PID ${vllm_pid}), waiting for health check..."

  # Wait for vLLM to become healthy (up to 10 minutes for model download)
  local attempts=0
  local max_attempts=120
  local spinner='|/-\'
  while [ "${attempts}" -lt "${max_attempts}" ]; do
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
      printf '\r  + vLLM is ready — serving %s                    \n' "${DCP_MODEL}"
      return
    fi
    # Check if process is still alive
    if ! kill -0 "${vllm_pid}" 2>/dev/null; then
      printf '\n'
      warn "vLLM process died. Check logs: ${vllm_log}"
      tail -5 "${vllm_log}" 2>/dev/null || true
      fail "vLLM failed to start. Check ${vllm_log} for details."
    fi
    # Show spinner with elapsed time
    local spin_char="${spinner:$((attempts % 4)):1}"
    local elapsed=$(( attempts * 5 ))
    printf '\r  %s Waiting for model to load... (%ds elapsed)  ' "${spin_char}" "${elapsed}"
    attempts=$((attempts + 1))
    sleep 5
  done
  warn "vLLM did not become healthy within 10 minutes."
  warn "It may still be downloading the model. Check: tail -f ${vllm_log}"
  warn "Once healthy, restart the daemon: systemctl restart dcp-provider"
}

detect_endpoint_url() {
  # For cloud GPUs, figure out the public endpoint URL
  if [ -n "${VLLM_ENDPOINT_URL:-}" ]; then
    return
  fi

  # Determine the correct port based on engine
  local inference_port="8000"
  if [ "${DCP_ENGINE}" = "ollama" ]; then
    inference_port="11434"
  fi

  # RunPod: construct from pod ID
  if [ -n "${RUNPOD_POD_ID:-}" ]; then
    VLLM_ENDPOINT_URL="https://${RUNPOD_POD_ID}-${inference_port}.proxy.runpod.net"
    info "RunPod endpoint: ${VLLM_ENDPOINT_URL}"
    return
  fi

  # Try to auto-detect from RunPod hostname pattern
  local pod_hostname
  pod_hostname="$(hostname 2>/dev/null || echo "")"
  if echo "${pod_hostname}" | grep -qE '^[0-9a-f]{12}$'; then
    # Looks like a RunPod container ID, but we need the pod ID
    # Check if RUNPOD_POD_ID is in environment
    if [ -n "${RUNPOD_POD_ID:-}" ]; then
      VLLM_ENDPOINT_URL="https://${RUNPOD_POD_ID}-${inference_port}.proxy.runpod.net"
      info "RunPod endpoint: ${VLLM_ENDPOINT_URL}"
      return
    fi
  fi

  # Cloud but can't auto-detect — ask the user
  if [ "${IS_CLOUD:-false}" = "true" ]; then
    echo ""
    info "Could not auto-detect your public endpoint URL."
    info "Your inference server needs to be reachable from the internet."
    if [ "${DCP_ENGINE}" = "ollama" ]; then
      info "Examples:"
      info "  RunPod:  https://<pod-id>-11434.proxy.runpod.net"
      info "  Lambda:  http://<instance-ip>:11434"
    else
      info "Examples:"
      info "  RunPod:  https://<pod-id>-8000.proxy.runpod.net"
      info "  Lambda:  http://<instance-ip>:8000"
    fi
    echo ""
    if [ -r /dev/tty ]; then
      read -r -p "  Enter your inference endpoint URL (or press Enter to set later): " VLLM_ENDPOINT_URL </dev/tty
    fi
    if [ -n "${VLLM_ENDPOINT_URL:-}" ]; then
      success "Endpoint URL set: ${VLLM_ENDPOINT_URL}"
    else
      info "Set it later at dcp.sa/provider/settings"
    fi
  fi
}

download_daemon() {
  mkdir -p "${INSTALL_DIR}" "${LOG_DIR}"
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "${tmp}"' RETURN

  local primary_url fallback_url
  primary_url="${API_BASE}/api/providers/download/daemon?key=${DCP_PROVIDER_KEY}"
  fallback_url="${API_BASE}/daemon?key=${DCP_PROVIDER_KEY}"

  if curl -fsSL "${primary_url}" -o "${tmp}"; then
    :
  elif curl -fsSL "${fallback_url}" -o "${tmp}"; then
    warn "Using fallback daemon endpoint: ${fallback_url}"
  else
    fail "Failed to download daemon from ${API_BASE}."
  fi

  mv "${tmp}" "${DAEMON_PATH}"
  chmod +x "${DAEMON_PATH}"
  info "Daemon downloaded to ${DAEMON_PATH}."
}

restart_nohup_daemon() {
  local old_pid=""

  # Prefer tracked PID, then try process lookup for idempotent restarts.
  if [ -f "${PID_FILE}" ]; then
    old_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  fi
  if [ -z "${old_pid}" ]; then
    old_pid="$(pgrep -f "${DAEMON_PATH}" | head -n 1 || true)"
  fi
  if [ -n "${old_pid}" ] && kill -0 "${old_pid}" >/dev/null 2>&1; then
    info "Stopping existing daemon process (${old_pid})."
    kill "${old_pid}" >/dev/null 2>&1 || true
    sleep 1
  fi

  DCP_API_KEY="${DCP_PROVIDER_KEY}" DCP_API_URL="${API_BASE}" VLLM_ENDPOINT_URL="${VLLM_ENDPOINT_URL:-}" nohup "${PYTHON_BIN}" "${DAEMON_PATH}" >> "${LOG_DIR}/daemon.log" 2>> "${LOG_DIR}/daemon-error.log" &
  echo $! > "${PID_FILE}"
  info "Daemon started in background (pid: $(cat "${PID_FILE}"))."
}

setup_linux_service() {
  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl not found. Falling back to background process mode."
    restart_nohup_daemon
    return
  fi

  # Build ExecStartPre for Ollama if needed (start Ollama serve before daemon)
  local ollama_exec_pre=""
  local ollama_env=""
  if [ "${DCP_ENGINE}" = "ollama" ]; then
    ollama_env="Environment=OLLAMA_FLASH_ATTENTION=1"
    # Ollama is started separately; the daemon just needs it running
    # ExecStartPre ensures Ollama is serving before the daemon starts
    ollama_exec_pre="ExecStartPre=/bin/sh -c 'if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then OLLAMA_FLASH_ATTENTION=1 nohup ollama serve > ${LOG_DIR}/ollama.log 2>&1 & sleep 5; fi'"
  fi

  if [ "${DCP_SYSTEMD_MODE}" = "system" ]; then
    step "Installing systemd system service (requires sudo)"
    local tmp_unit
    tmp_unit="$(mktemp)"
    cat > "${tmp_unit}" <<UNIT
[Unit]
Description=DCP Provider Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_DIR}/env
${ollama_env}
${ollama_exec_pre}
ExecStart=${PYTHON_BIN} ${DAEMON_PATH}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    if command -v sudo >/dev/null 2>&1; then
      sudo cp "${tmp_unit}" "${SYSTEMD_SYSTEM_UNIT}"
      sudo systemctl daemon-reload
      if sudo systemctl is-active --quiet dcp-provider; then
        sudo systemctl restart dcp-provider
        info "Existing system service restarted."
      else
        sudo systemctl enable --now dcp-provider
        info "System service enabled and started."
      fi
    else
      rm -f "${tmp_unit}"
      fail "DCP_SYSTEMD_MODE=system requires sudo installed."
    fi
    rm -f "${tmp_unit}"
    return
  fi

  step "Installing systemd user service"
  mkdir -p "${SYSTEMD_USER_UNIT_DIR}"
  cat > "${SYSTEMD_USER_UNIT}" <<UNIT
[Unit]
Description=DCP Provider Daemon (user)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_DIR}/env
${ollama_env}
${ollama_exec_pre}
ExecStart=${PYTHON_BIN} ${DAEMON_PATH}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

  if systemctl --user daemon-reload >/dev/null 2>&1; then
    if systemctl --user is-active --quiet dcp-provider; then
      systemctl --user restart dcp-provider
      info "Existing user service restarted."
    else
      systemctl --user enable --now dcp-provider
      info "User service enabled and started."
    fi
  else
    warn "systemd user session unavailable. Falling back to background process mode."
    restart_nohup_daemon
  fi
}

setup_macos_launchagent() {
  step "Installing macOS LaunchAgent"
  mkdir -p "$(dirname "${LAUNCHD_PLIST}")" "${LOG_DIR}"

  cat > "${LAUNCHD_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON_BIN}</string>
    <string>${DAEMON_PATH}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DCP_API_KEY</key>
    <string>${DCP_PROVIDER_KEY}</string>
    <key>DCP_API_URL</key>
    <string>${API_BASE}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/daemon-error.log</string>
</dict>
</plist>
PLIST

  launchctl bootout "gui/$(id -u)" "${LAUNCHD_PLIST}" >/dev/null 2>&1 || true
  if launchctl bootstrap "gui/$(id -u)" "${LAUNCHD_PLIST}" >/dev/null 2>&1; then
    :
  else
    launchctl load -w "${LAUNCHD_PLIST}" >/dev/null 2>&1 || true
  fi
  launchctl kickstart -k "gui/$(id -u)/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
  info "LaunchAgent loaded and restarted."
}

setup_macos_menubar() {
  step "Installing DCP menu bar monitor"
  local menubar_path="${INSTALL_DIR}/dcp_menubar.py"
  local menubar_url="${API_BASE}/api/providers/download/menubar"
  local tmp
  tmp="$(mktemp)"
  trap 'rm -f "${tmp}"' RETURN

  if curl -fsSL "${menubar_url}" -o "${tmp}" 2>/dev/null; then
    mv "${tmp}" "${menubar_path}"
    chmod +x "${menubar_path}"
  else
    warn "Could not download menu bar app. Skipping."
    rm -f "${tmp}"
    return
  fi

  # Install rumps + requests if needed
  "${PYTHON_BIN}" -c "import rumps" 2>/dev/null || {
    info "Installing menu bar dependencies (rumps, requests)…"
    "${PYTHON_BIN}" -m pip install --break-system-packages rumps requests -q 2>/dev/null || \
      "${PYTHON_BIN}" -m pip install --break-system-packages --user rumps requests -q 2>/dev/null || \
      "${PYTHON_BIN}" -m pip install --break-system-packages rumps requests -q 2>/dev/null || {
        warn "Could not install rumps. Menu bar app will install deps on first launch."
      }
  }

  # Create a LaunchAgent to start the menu bar app at login
  local mb_label="com.dcp.provider.menubar"
  local mb_plist="${HOME}/Library/LaunchAgents/${mb_label}.plist"
  mkdir -p "$(dirname "${mb_plist}")"

  cat > "${mb_plist}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${mb_label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PYTHON_BIN}</string>
    <string>${menubar_path}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/menubar.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/menubar-error.log</string>
</dict>
</plist>
PLIST

  # Load (or reload) the menu bar agent
  launchctl bootout "gui/$(id -u)" "${mb_plist}" >/dev/null 2>&1 || true
  if launchctl bootstrap "gui/$(id -u)" "${mb_plist}" >/dev/null 2>&1; then
    :
  else
    launchctl load -w "${mb_plist}" >/dev/null 2>&1 || true
  fi
  info "Menu bar monitor installed and launched."
}

fetch_provider_id_if_missing() {
  if [ -n "${DCP_PROVIDER_ID}" ]; then
    return
  fi

  local me_response
  me_response="$(curl -sS "${API_BASE}/api/providers/me?key=${DCP_PROVIDER_KEY}" || true)"
  DCP_PROVIDER_ID="$(json_get_number "${me_response}" "id")"
}

# ===========================================================================
# MAIN EXECUTION FLOW
# ===========================================================================

step "DCP Provider setup starting"
info "API base: ${API_BASE}"
info "Detected OS: ${DCP_OS}"

load_config

step "Detecting GPU"
detect_gpu
info "GPU model: ${GPU_MODEL}"
info "VRAM (GB): ${VRAM_GB}"
if [ -n "${GPU_COMPUTE_CAP:-}" ]; then
  info "Compute capability: ${GPU_COMPUTE_CAP}"
fi
if [ -n "${DRIVER_VERSION:-}" ]; then
  info "Driver version: ${DRIVER_VERSION}"
fi

step "Ensuring Python runtime"
ensure_python
info "Python: ${PYTHON_BIN}"

step "Provider registration"
register_provider_if_needed

step "Saving local config"
write_config
info "Config saved at ${CONFIG_FILE}"

step "Detecting environment"
IS_CLOUD=false
# RunPod detection
if [ -n "${RUNPOD_POD_ID:-}" ] || [ -f /etc/runpod.conf ] || hostname 2>/dev/null | grep -qE '^[0-9a-f]{12}$'; then
  IS_CLOUD=true
  info "Cloud GPU detected (RunPod)"
# Lambda Labs detection
elif [ -n "${LAMBDA_NODE_ID:-}" ] || [ -d /opt/lambda ]; then
  IS_CLOUD=true
  info "Cloud GPU detected (Lambda Labs)"
# Generic Docker/container detection
elif [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
  IS_CLOUD=true
  info "Containerized environment detected"
# Manual override
elif [ "${DCP_CLOUD_GPU:-}" = "true" ]; then
  IS_CLOUD=true
  info "Cloud GPU mode (manual override)"
else
  info "Local/home GPU detected"
fi

if [ "${IS_CLOUD}" = "false" ]; then
  step "Setting up WireGuard VPN"
  setup_wireguard
fi

step "Setting up inference server"
select_engine
select_model_for_vram

if [ "${DCP_ENGINE}" = "mlx" ]; then
  install_mlx
  start_mlx_server
elif [ "${DCP_ENGINE}" = "ollama" ]; then
  install_ollama
  start_ollama
else
  install_vllm
  start_vllm
fi

if [ "${IS_CLOUD}" = "true" ]; then
  step "Configuring cloud endpoint"
  detect_endpoint_url
fi

step "Downloading daemon"
download_daemon

# Re-write config now that we know the engine, model, and endpoint
write_config

if [ "${DCP_OS}" = "mac" ]; then
  setup_macos_launchagent
  setup_macos_menubar
else
  setup_linux_service
fi

step "Finalizing"
fetch_provider_id_if_missing
write_config

printf '\n%s\n' "============================================"
printf '%s\n' "  DCP Provider is LIVE"
printf '%s\n' "============================================"
echo ""
info "Provider ID:  ${DCP_PROVIDER_ID:-unknown}"
info "GPU:          ${GPU_MODEL} (${VRAM_GB}GB)"
info "Engine:       ${DCP_ENGINE}"
info "Model:        ${DCP_MODEL:-unknown}"
info "Status:       Heartbeating every 30s"
if [ -n "${VLLM_ENDPOINT_URL:-}" ]; then
  info "Endpoint:     ${VLLM_ENDPOINT_URL}"
fi
info "Dashboard:    https://dcp.sa/provider"
info "Daemon logs:  ${LOG_DIR}/daemon.log"
if [ "${DCP_ENGINE}" = "ollama" ]; then
  info "Ollama logs:  ${LOG_DIR}/ollama.log"
else
  info "vLLM logs:    ${LOG_DIR}/vllm.log"
fi
echo ""
info "IMPORTANT: Disable thinking tokens for cost control (think:false in API calls)"
echo ""
