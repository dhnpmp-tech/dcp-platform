#!/usr/bin/env bash
# DCP Agent — one-line bootstrap installer.
#
# Pulls the DCP Agent (Hermes fork) from GitHub, sets up a venv, saves the
# install token, and launches the agent gateway. From there the agent itself
# orchestrates everything: detects GPU, installs/checks Ollama, sets up
# WireGuard, registers with api.dcp.sa, and enters the always-on loop.
#
# Provider runs ONE command:
#   curl -sSL https://api.dcp.sa/install/agent | bash -s -- --token TOKEN
#
# After it finishes, the provider opens http://localhost:8642 in their
# browser and talks to the agent via the LIVE / CHAT tabs. The agent
# narrates everything it does and self-heals when something breaks.
#
# Linux + macOS supported. Windows uses a separate path.

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────
# DCP Agent code is served as a tarball from api.dcp.sa (the underlying repo
# is private; the backend keeps an up-to-date copy in installers/). Override
# DCP_AGENT_TARBALL for testing against staging.
DCP_AGENT_TARBALL="${DCP_AGENT_TARBALL:-https://api.dcp.sa/installers/dcp-agent.tar.gz}"
DCP_HOME="${DCP_HOME:-${HOME}/.dcp}"
AGENT_DIR="${DCP_HOME}/agent"
AGENT_REPO_DIR="${AGENT_DIR}/repo"
AGENT_VENV="${AGENT_DIR}/.venv"
TOKEN_FILE="${DCP_HOME}/install_token"
LOG_FILE="${DCP_HOME}/install.log"

# ── Inputs ───────────────────────────────────────────────────────────────
TOKEN=""
PROVIDER_KEY=""
NO_LAUNCH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --token|-t)      TOKEN="${2:-}"; shift 2 ;;
    --api-key|-k)    PROVIDER_KEY="${2:-}"; shift 2 ;;
    --no-launch)     NO_LAUNCH=1; shift ;;
    -h|--help)
      cat <<USAGE
DCP Agent installer.

Usage:
  curl -sSL https://api.dcp.sa/install/agent | bash -s -- --token TOKEN

Flags:
  --token TOKEN     install token from dcp.sa/setup (preferred)
  --api-key KEY     existing provider api_key (alternative to token)
  --no-launch       install only, don't start the agent

The agent does the rest — checks Ollama, WireGuard, GPU; installs what's
missing; registers your provider; and then runs always-on. Open
http://localhost:8642 once it's up to chat with it.
USAGE
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "${TOKEN}" ] && [ -z "${PROVIDER_KEY}" ]; then
  echo "ERROR: --token or --api-key required."
  echo "Get a token from https://dcp.sa/setup."
  exit 1
fi

# ── Pretty logging ───────────────────────────────────────────────────────
mkdir -p "${DCP_HOME}"
exec > >(tee -a "${LOG_FILE}") 2>&1
say()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*"; exit 1; }

cat <<'BANNER'

  ┌──────────────────────────────────────────────┐
  │                                              │
  │           DCP Agent — bootstrap              │
  │                                              │
  │  After this script: agent takes over.        │
  │  Open http://localhost:8642 to chat with it. │
  │                                              │
  └──────────────────────────────────────────────┘

BANNER

# ── 1. Detect platform ───────────────────────────────────────────────────
say "Detecting platform"
case "$(uname -s)" in
  Linux*)  PLATFORM=linux ;;
  Darwin*) PLATFORM=mac ;;
  *) fail "Unsupported OS. Linux and macOS only for this installer." ;;
esac
ARCH="$(uname -m)"
ok "Platform: ${PLATFORM} (${ARCH})"

# ── 2. Find / install Python 3.11+ ───────────────────────────────────────
say "Locating Python 3.11+"
PY=""
for cand in python3.13 python3.12 python3.11 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    ver=$("$cand" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    major=${ver%.*}
    minor=${ver#*.}
    if [ "$major" -ge 3 ] && [ "$minor" -ge 11 ]; then
      PY="$(command -v "$cand")"
      break
    fi
  fi
done

if [ -z "${PY}" ]; then
  warn "Python 3.11+ not found — installing"
  if [ "${PLATFORM}" = linux ]; then
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq
      sudo apt-get install -y -qq python3.11 python3.11-venv python3-pip
      PY="$(command -v python3.11)"
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y python3.11 python3-pip
      PY="$(command -v python3.11)"
    else
      fail "No supported package manager. Install Python 3.11+ manually and re-run."
    fi
  else
    if command -v brew >/dev/null 2>&1; then
      brew install python@3.12
      PY="$(brew --prefix)/bin/python3.12"
    else
      fail "Homebrew required on macOS. Install from brew.sh and re-run."
    fi
  fi
fi
ok "Python: ${PY} ($("${PY}" --version))"

# ── 3. git + curl present ────────────────────────────────────────────────
say "Verifying git + curl"
command -v git  >/dev/null 2>&1 || fail "git missing — install with apt/brew."
command -v curl >/dev/null 2>&1 || fail "curl missing — install with apt/brew."
ok "Both present."

# ── 4. Save the install token ────────────────────────────────────────────
say "Saving install credentials"
if [ -n "${TOKEN}" ]; then
  printf '%s' "${TOKEN}" > "${TOKEN_FILE}"
  chmod 600 "${TOKEN_FILE}"
  ok "Install token written to ${TOKEN_FILE}"
fi
if [ -n "${PROVIDER_KEY}" ]; then
  printf 'DCP_PROVIDER_KEY=%s\n' "${PROVIDER_KEY}" > "${DCP_HOME}/env"
  chmod 600 "${DCP_HOME}/env"
  ok "Provider API key written to ${DCP_HOME}/env"
fi

# ── 5. Download + extract dcp-agent ──────────────────────────────────────
say "Downloading DCP Agent code"
mkdir -p "${AGENT_DIR}"
TARBALL_TMP="$(mktemp -t dcp-agent.XXXXXX.tar.gz)"
curl -fsSL "${DCP_AGENT_TARBALL}" -o "${TARBALL_TMP}" || fail "Could not download ${DCP_AGENT_TARBALL}"
rm -rf "${AGENT_REPO_DIR}"
mkdir -p "${AGENT_REPO_DIR}"
tar xzf "${TARBALL_TMP}" -C "${AGENT_REPO_DIR}" --strip-components=1 || fail "Tarball extract failed"
rm -f "${TARBALL_TMP}"
ok "Agent code at ${AGENT_REPO_DIR}"

# ── 6. Create venv + install agent ───────────────────────────────────────
say "Setting up Python venv"
if [ ! -d "${AGENT_VENV}" ]; then
  "${PY}" -m venv "${AGENT_VENV}"
fi
"${AGENT_VENV}/bin/pip" install --quiet --upgrade pip wheel setuptools

say "Installing DCP Agent (this takes 1–2 min)"
"${AGENT_VENV}/bin/pip" install --quiet "${AGENT_REPO_DIR}"
ok "Agent installed."

# ── 6b. Wire Hermes brain to our gateway (no MiniMax key on this box) ────
# Hermes' built-in `minimax` provider posts Anthropic-format requests to
# <MINIMAX_BASE_URL>/v1/messages. Pointing at our gateway means:
#   • The MiniMax subscription key never leaves the VPS.
#   • We can swap the brain (Claude / in-house / OpenRouter) by editing
#     UPSTREAMS in routes/agent-gateway.js — no client redeploy.
#   • All provider agent traffic is observable centrally.
say "Wiring Hermes brain through api.dcp.sa gateway"
mkdir -p "${HOME}/.hermes"
ENVFILE="${AGENT_REPO_DIR}/.env"
{
  echo "# Generated by agent-install.sh — do not edit; re-run installer."
  echo "MINIMAX_BASE_URL=https://api.dcp.sa/api/agent/gateway"
  echo "# Provider key is the auth credential against our gateway. The"
  echo "# gateway uses its own server-side MINIMAX_AGENT_KEY upstream."
  if [ -n "${PROVIDER_KEY}" ]; then
    echo "MINIMAX_API_KEY=${PROVIDER_KEY}"
    echo "DCP_PROVIDER_KEY=${PROVIDER_KEY}"
  else
    echo "# MINIMAX_API_KEY will be set after first-run-setup mints the provider key."
  fi
  echo "DCP_API_BASE=https://api.dcp.sa"
} > "${ENVFILE}"
chmod 600 "${ENVFILE}"
ok "Brain endpoint set: api.dcp.sa/api/agent/gateway"

# ── 7. WireGuard userland tools (kernel module is in-tree on modern Linux) ─
say "Checking WireGuard tools"
if ! command -v wg-quick >/dev/null 2>&1; then
  warn "wg-quick not installed — installing"
  if [ "${PLATFORM}" = linux ] && command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y -qq wireguard-tools
  elif [ "${PLATFORM}" = mac ] && command -v brew >/dev/null 2>&1; then
    brew install wireguard-tools
  else
    warn "Install wireguard-tools manually if the agent reports tunnel issues."
  fi
fi
command -v wg-quick >/dev/null 2>&1 && ok "WireGuard tools present."

# ── 7b. WG bootstrap — call /api/providers/wg/install-config and apply ──
# The server generates a keypair + PSK, pre-registers the peer, returns a
# paste-ready wg0.conf. No manual key generation, no half-installed
# tunnels. Idempotent: re-running this section is safe.
if [ -n "${PROVIDER_KEY}" ]; then
  say "Provisioning WireGuard tunnel via api.dcp.sa"
  WG_RESP_TMP="$(mktemp)"
  WG_HTTP=$(curl -sS -o "${WG_RESP_TMP}" -w "%{http_code}" \
    -X POST "https://api.dcp.sa/api/providers/wg/install-config" \
    -H "x-provider-key: ${PROVIDER_KEY}" \
    -H 'Content-Type: application/json')

  if [ "${WG_HTTP}" = "200" ]; then
    # Tiny JSON parse: jq if available, python3 fallback.
    if command -v jq >/dev/null 2>&1; then
      WG_CONF_BODY="$(jq -r '.wg_conf // empty' < "${WG_RESP_TMP}")"
      WG_MESH_IP="$(jq -r '.mesh_ip // empty' < "${WG_RESP_TMP}")"
    else
      WG_CONF_BODY="$(python3 -c "import json,sys; print(json.load(open('${WG_RESP_TMP}')).get('wg_conf',''))")"
      WG_MESH_IP="$(python3 -c "import json,sys; print(json.load(open('${WG_RESP_TMP}')).get('mesh_ip',''))")"
    fi
    if [ -n "${WG_CONF_BODY}" ] && [ -n "${WG_MESH_IP}" ]; then
      if [ "${PLATFORM}" = linux ] && command -v wg-quick >/dev/null 2>&1; then
        sudo bash -c "umask 077; printf '%s' '${WG_CONF_BODY}' > /etc/wireguard/wg0.conf"
        sudo chmod 600 /etc/wireguard/wg0.conf
        sudo wg-quick down wg0 2>/dev/null || true
        sudo wg-quick up wg0
        ok "WG tunnel up at ${WG_MESH_IP}"
      elif [ "${PLATFORM}" = mac ] && command -v wg-quick >/dev/null 2>&1; then
        sudo bash -c "umask 077; printf '%s' '${WG_CONF_BODY}' > /etc/wireguard/wg0.conf"
        sudo chmod 600 /etc/wireguard/wg0.conf
        sudo wg-quick down wg0 2>/dev/null || true
        sudo wg-quick up wg0
        ok "WG tunnel up at ${WG_MESH_IP}"
      else
        warn "wg-quick not available — agent will retry tunnel bootstrap on next loop."
        warn "Config received but not applied. Manual import path on macOS uses WireGuard.app."
      fi
    else
      warn "WG config response was empty — agent self-heal skill will retry."
    fi
  else
    warn "WG install-config returned HTTP ${WG_HTTP} — agent self-heal skill will retry."
    cat "${WG_RESP_TMP}" 2>/dev/null | head -c 500
    echo
  fi
  rm -f "${WG_RESP_TMP}"
fi

# ── 7c. Ollama bind fix — only relevant if Ollama is running locally ────
# Ollama defaults to 127.0.0.1:11434, unreachable from the WG mesh. Persist
# OLLAMA_HOST=0.0.0.0:11434 so the VPS can route inference here. Skipped
# entirely on vLLM-based providers (Ollama not installed).
if command -v ollama >/dev/null 2>&1; then
  say "Configuring Ollama to bind 0.0.0.0:11434"
  if [ "${PLATFORM}" = mac ]; then
    launchctl setenv OLLAMA_HOST '0.0.0.0:11434' 2>/dev/null || true
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
    launchctl load   "${LAUNCH_PLIST}" 2>/dev/null || true
    ok "OLLAMA_HOST persisted via LaunchAgent (sa.dcp.ollama-host)"
  elif [ "${PLATFORM}" = linux ]; then
    if [ -d /etc/systemd/system ]; then
      sudo mkdir -p /etc/systemd/system/ollama.service.d
      sudo bash -c 'cat > /etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment=OLLAMA_HOST=0.0.0.0:11434
EOF'
      sudo systemctl daemon-reload 2>/dev/null || true
      sudo systemctl restart ollama 2>/dev/null || true
      ok "OLLAMA_HOST persisted via systemd drop-in + restarted ollama"
    fi
  fi
fi

# ── 8. Hand off to the agent ─────────────────────────────────────────────
if [ "${NO_LAUNCH}" = 1 ]; then
  cat <<NEXT

  Install complete (no-launch mode). Start the agent yourself with:

    ${AGENT_VENV}/bin/hermes gateway run

  Or, after activating the venv:

    source ${AGENT_VENV}/bin/activate
    hermes gateway run

NEXT
  exit 0
fi

cat <<HANDOFF

  ┌──────────────────────────────────────────────┐
  │                                              │
  │  Bootstrap done. Starting DCP Agent…         │
  │                                              │
  │  Open this in your browser:                  │
  │      http://localhost:8642                   │
  │                                              │
  │  Tabs:                                       │
  │    • LIVE — what the agent is doing now      │
  │    • CHAT — talk to it directly              │
  │                                              │
  │  The agent reads ${TOKEN_FILE}      │
  │  on first run, finishes registration,        │
  │  and enters always-on mode. You don't need   │
  │  to do anything else.                        │
  │                                              │
  │  Stop with Ctrl+C. Logs at ${LOG_FILE}  │
  │                                              │
  └──────────────────────────────────────────────┘

HANDOFF

# Launch in foreground so the operator sees gateway logs. The agent's
# boot-sequence skill drives first-run-setup → provider-registration →
# always-on by reading $TOKEN_FILE / $DCP_HOME/env.
exec "${AGENT_VENV}/bin/hermes" gateway run
