#!/usr/bin/env bash
# DCP — provider self-heal one-liner.
#
# Run this on any existing provider box to apply today's fixes WITHOUT
# re-installing from scratch. Preserves existing keys, models, vLLM
# config. Only changes what's broken.
#
#   curl -sSL https://api.dcp.sa/fix-provider | bash -s -- --api-key dcp-provider-XXXXXXXX
#
# What it fixes:
#   1. WireGuard tunnel — calls /api/providers/wg/install-config to get
#      a fresh wg0.conf with server-pre-registered PSK; writes it to
#      /etc/wireguard/wg0.conf and brings up wg0. Idempotent.
#   2. Ollama bind — if Ollama is running locally, sets OLLAMA_HOST to
#      0.0.0.0:11434 so the WG mesh IP can reach it. Persistent via
#      LaunchAgent (macOS) or systemd drop-in (Linux).
#   3. Post-fix health probe — verifies the VPS can reach the
#      provider's inference port through WG and the daemon is heart-
#      beating. Reports clearly which step failed.

set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────
API_KEY=""
DCP_HOME="${DCP_HOME:-${HOME}/.dcp}"
DCP_API_BASE="${DCP_API_BASE:-https://api.dcp.sa}"

while [ $# -gt 0 ]; do
  case "$1" in
    --api-key|-k)  API_KEY="${2:-}"; shift 2 ;;
    --api-base)    DCP_API_BASE="${2:-}"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -25
      exit 0
      ;;
    *) shift ;;
  esac
done

# Fallback: read api_key from ~/.dcp/env if not on cmd line
if [ -z "${API_KEY}" ] && [ -f "${DCP_HOME}/env" ]; then
  API_KEY=$(grep -oE 'DCP_PROVIDER_KEY=[^ ]+' "${DCP_HOME}/env" | head -1 | cut -d= -f2)
fi

if [ -z "${API_KEY}" ]; then
  echo "ERROR: --api-key required (or set DCP_PROVIDER_KEY in ${DCP_HOME}/env)"
  echo "Find your key in the DCP dashboard: ${DCP_API_BASE/api./}/provider"
  exit 1
fi

# ── Pretty logging ────────────────────────────────────────────────────
say()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*"; exit 1; }

# ── Detect platform ───────────────────────────────────────────────────
say "Detecting platform"
case "$(uname -s)" in
  Linux)  PLATFORM=linux ;;
  Darwin) PLATFORM=darwin ;;
  *)      fail "Unsupported platform: $(uname -s)" ;;
esac
ok "Platform: ${PLATFORM}"

command -v curl >/dev/null || fail "curl missing — install curl first"
command -v jq   >/dev/null 2>&1 || {
  warn "jq not found; will fall back to python3 for JSON parsing"
  command -v python3 >/dev/null || fail "need either jq or python3 for JSON parsing"
}

# Tiny JSON helper that uses jq if available, falls back to python3.
jget() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".$key // empty"
  else
    python3 -c "import json,sys; d=json.load(sys.stdin); v=d.get('$key',''); print(v if isinstance(v,str) else json.dumps(v))"
  fi
}

# ── 1. Ensure wireguard-tools installed ───────────────────────────────
say "Ensuring wireguard-tools is installed"
if ! command -v wg >/dev/null 2>&1; then
  if [ "${PLATFORM}" = linux ]; then
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y -qq wireguard-tools
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y wireguard-tools
    else
      fail "Install wireguard-tools manually"
    fi
  else
    command -v brew >/dev/null || fail "Homebrew required for wireguard-tools on macOS"
    brew install wireguard-tools
  fi
fi
ok "wg present"

# ── 2. Fetch a fresh WG config from the backend ───────────────────────
# The /api/providers/wg/install-config endpoint generates a keypair +
# PSK server-side, pre-registers the peer, and returns the paste-ready
# wg0.conf. This bypasses the broken legacy "registration after approval"
# flow that left tunnels half-installed.
say "Requesting fresh WG config from ${DCP_API_BASE}"
RESP_TMP="$(mktemp)"
HTTP=$(curl -sS -o "${RESP_TMP}" -w "%{http_code}" \
  -X POST "${DCP_API_BASE}/api/providers/wg/install-config" \
  -H "x-provider-key: ${API_KEY}" -H 'Content-Type: application/json')

if [ "${HTTP}" != "200" ]; then
  cat "${RESP_TMP}"
  rm -f "${RESP_TMP}"
  fail "wg/install-config returned HTTP ${HTTP}"
fi

MESH_IP="$(jget mesh_ip < "${RESP_TMP}")"
WG_CONF="$(jget wg_conf < "${RESP_TMP}")"
VLLM_URL="$(jget vllm_endpoint_url < "${RESP_TMP}")"
rm -f "${RESP_TMP}"

if [ -z "${WG_CONF}" ] || [ -z "${MESH_IP}" ]; then
  fail "wg/install-config response missing fields"
fi
ok "Got config for mesh IP ${MESH_IP}"

# ── 3. Write /etc/wireguard/wg0.conf + bring up ───────────────────────
say "Writing /etc/wireguard/wg0.conf"
if [ "${PLATFORM}" = linux ]; then
  sudo bash -c "umask 077; printf '%s' '${WG_CONF}' > /etc/wireguard/wg0.conf"
  sudo chmod 600 /etc/wireguard/wg0.conf
  sudo wg-quick down wg0 2>/dev/null || true
  sudo wg-quick up wg0
  ok "wg0 up"
else
  # macOS: install via WireGuard.app's CLI, or wg-quick if available
  if command -v wg-quick >/dev/null 2>&1; then
    sudo bash -c "umask 077; printf '%s' '${WG_CONF}' > /etc/wireguard/wg0.conf"
    sudo chmod 600 /etc/wireguard/wg0.conf
    sudo wg-quick down wg0 2>/dev/null || true
    sudo wg-quick up wg0
    ok "wg0 up"
  else
    warn "macOS without wg-quick — install WireGuard.app from App Store and import the config manually."
    printf "Config content:\n%s\n" "${WG_CONF}"
  fi
fi

# ── 4. If Ollama is running locally, fix its bind to 0.0.0.0 ──────────
say "Checking Ollama bind"
if command -v ollama >/dev/null 2>&1 && lsof -iTCP:11434 -sTCP:LISTEN >/dev/null 2>&1; then
  CURRENT_BIND=$(lsof -iTCP:11434 -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $9}')
  if echo "${CURRENT_BIND}" | grep -qE 'localhost|127\.0\.0\.1'; then
    warn "Ollama bound to ${CURRENT_BIND} — fixing"
    if [ "${PLATFORM}" = darwin ]; then
      launchctl setenv OLLAMA_HOST '0.0.0.0:11434'
      # Persist via LaunchAgent so it survives reboots.
      LAUNCH_PLIST="${HOME}/Library/LaunchAgents/sa.dcp.ollama-host.plist"
      mkdir -p "$(dirname "${LAUNCH_PLIST}")"
      cat > "${LAUNCH_PLIST}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sa.dcp.ollama-host</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/launchctl</string>
    <string>setenv</string>
    <string>OLLAMA_HOST</string>
    <string>0.0.0.0:11434</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
      launchctl unload "${LAUNCH_PLIST}" 2>/dev/null || true
      launchctl load   "${LAUNCH_PLIST}"
      # Restart Ollama
      pkill -f 'Ollama.app' 2>/dev/null || true
      pkill -f 'ollama serve' 2>/dev/null || true
      sleep 2
      OLLAMA_HOST=0.0.0.0:11434 nohup /Applications/Ollama.app/Contents/Resources/ollama serve > /tmp/ollama.log 2>&1 &
      disown 2>/dev/null || true
      sleep 4
    else
      # Linux: systemd drop-in
      sudo mkdir -p /etc/systemd/system/ollama.service.d
      sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<EOF
[Service]
Environment=OLLAMA_HOST=0.0.0.0:11434
EOF
      sudo systemctl daemon-reload
      sudo systemctl restart ollama
      sleep 4
    fi
    ok "Ollama re-bound to 0.0.0.0:11434"
  else
    ok "Ollama already binds 0.0.0.0 (${CURRENT_BIND})"
  fi
else
  ok "Ollama not running locally — skipping (likely vLLM-based provider)"
fi

# ── 5. Health probe ───────────────────────────────────────────────────
say "Verifying tunnel + inference endpoint"

# Wait up to 10s for first WG handshake
for i in 1 2 3 4 5; do
  HS=$(sudo wg show wg0 latest-handshakes 2>/dev/null | awk '{print $2}' | head -1)
  if [ -n "${HS}" ] && [ "${HS}" -gt 0 ]; then
    AGE=$(( $(date +%s) - HS ))
    ok "WG handshake fresh (${AGE}s ago)"
    break
  fi
  sleep 2
done

# Probe inference port locally — what the VPS will see over the mesh
PORT=$(echo "${VLLM_URL}" | grep -oE ':[0-9]+' | head -1 | tr -d ':')
PORT="${PORT:-8000}"
if curl -sS -m 3 -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:${PORT}/v1/models" 2>/dev/null | grep -q "^2"; then
  ok "Inference server responds on 127.0.0.1:${PORT}"
elif curl -sS -m 3 -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:11434/api/tags" 2>/dev/null | grep -q "^2"; then
  ok "Ollama responds on 127.0.0.1:11434"
else
  warn "Inference server not responding locally — check your engine is running"
fi

# ── 6. Summary ────────────────────────────────────────────────────────
printf "\n\033[1;32m========================================\033[0m\n"
printf "\033[1;32m  DCP Provider — self-heal complete\033[0m\n"
printf "\033[1;32m========================================\033[0m\n\n"
printf "  - Mesh IP:           %s\n" "${MESH_IP}"
printf "  - Inference target:  %s\n" "${VLLM_URL}"
printf "  - WG status:         sudo wg show wg0\n"
printf "  - Dashboard:         %s/provider\n\n" "${DCP_API_BASE/api./}"
printf "VPS will now reach your inference port via the mesh.\n"
printf "If renters still see provider_unavailable, check that your\n"
printf "inference server (vLLM or Ollama) is bound to 0.0.0.0, not\n"
printf "127.0.0.1.\n"
