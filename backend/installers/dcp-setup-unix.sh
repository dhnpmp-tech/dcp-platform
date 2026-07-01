#!/bin/bash
# DC1 Provider Setup — Linux/Mac
# Downloads and installs the DC1 daemon + Docker + NVIDIA Container Toolkit.
#
# Usage:
#   curl -sL http://HOST/api/providers/download/setup?key=YOUR_KEY&os=linux | bash

set -e

DC1_API_KEY="INJECT_KEY_HERE"
DC1_API_URL="INJECT_URL_HERE"
INSTALL_DIR="/opt/dc1-provider"
LOG_DIR="$HOME/dc1-provider/logs"

echo "============================================"
echo "  DCP Provider Setup v3.3.0"
echo "  GPU Compute Marketplace — Saudi Arabia"
echo "============================================"
echo ""

# Check for root/sudo
if [ "$(id -u)" -ne 0 ]; then
    echo "[!] This script needs sudo for service & Docker installation."
    echo "    Re-running with sudo..."
    exec sudo bash "$0" "$@"
fi

# ── Step 1: Python 3 ────────────────────────────────────────────────────
echo "[1/8] Checking Python 3..."
if command -v python3 &>/dev/null; then
    PY=$(python3 --version 2>&1)
    echo "  Found: $PY"
else
    echo "  Python 3 not found. Installing..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq && apt-get install -y -qq python3 python3-pip
    elif command -v yum &>/dev/null; then
        yum install -y python3 python3-pip
    elif command -v brew &>/dev/null; then
        brew install python3
    else
        echo "  [ERROR] Cannot install Python 3. Please install manually."
        exit 1
    fi
fi

# ── Step 2: Python packages ────────────────────────────────────────────
echo "[2/8] Installing Python packages..."
pip3 install --quiet requests psutil 2>/dev/null || python3 -m pip install --quiet requests psutil 2>/dev/null || true

# ── Step 3: NVIDIA Drivers check ───────────────────────────────────────
echo "[3/8] Checking NVIDIA drivers..."
if command -v nvidia-smi &>/dev/null; then
    DRIVER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)
    GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    echo "  GPU: $GPU"
    echo "  Driver: $DRIVER"
else
    echo "  [WARN] nvidia-smi not found — NVIDIA drivers may not be installed."
    echo "  Install from: https://www.nvidia.com/download/index.aspx"
    echo "  Or on Ubuntu: sudo apt install nvidia-driver-545"
fi

# ── Step 4: Docker ──────────────────────────────────────────────────────
echo "[4/8] Checking Docker..."
if command -v docker &>/dev/null; then
    DOCKER_VER=$(docker --version 2>&1)
    echo "  Found: $DOCKER_VER"
else
    echo "  Docker not found. Installing..."
    if [ "$(uname)" = "Linux" ]; then
        # Official Docker install script
        curl -fsSL https://get.docker.com | sh
        # Add current user to docker group
        ACTUAL_USER=$(logname 2>/dev/null || echo "$SUDO_USER" || echo "root")
        usermod -aG docker "$ACTUAL_USER" 2>/dev/null || true
        systemctl enable docker
        systemctl start docker
        echo "  Docker installed. User '$ACTUAL_USER' added to docker group."
        echo "  NOTE: Log out and back in for docker group to take effect."
    elif [ "$(uname)" = "Darwin" ]; then
        echo "  [INFO] Install Docker Desktop from: https://docker.com/products/docker-desktop"
        echo "  Then re-run this script."
        exit 1
    fi
fi

# ── Step 5: NVIDIA Container Toolkit ────────────────────────────────────
echo "[5/8] Checking NVIDIA Container Toolkit..."

# Reliable detection: check for nvidia-ctk binary OR docker nvidia runtime
_nct_installed() {
    command -v nvidia-ctk &>/dev/null || docker info 2>/dev/null | grep -q "nvidia"
}

if _nct_installed; then
    echo "  NVIDIA Container Toolkit already installed."
elif [ "$(uname)" = "Linux" ]; then
    echo "  Installing NVIDIA Container Toolkit..."

    # Use NVIDIA's stable apt repo (works on Ubuntu 20.04, 22.04, 24.04 and Debian)
    # Ref: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
        gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null || true

    curl -fsSL "https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list" | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null 2>/dev/null || true

    # Try apt (Ubuntu/Debian), fall back to yum/dnf (RHEL/CentOS/Rocky)
    if command -v apt-get &>/dev/null; then
        apt-get update -qq 2>/dev/null
        apt-get install -y -qq nvidia-container-toolkit 2>/dev/null || \
            echo "  [WARN] NVIDIA CT install via apt failed — check repo access and try manually"
    elif command -v dnf &>/dev/null; then
        dnf install -y nvidia-container-toolkit 2>/dev/null || \
            echo "  [WARN] NVIDIA CT install via dnf failed"
    elif command -v yum &>/dev/null; then
        yum install -y nvidia-container-toolkit 2>/dev/null || \
            echo "  [WARN] NVIDIA CT install via yum failed"
    fi

    # Configure Docker to use NVIDIA runtime and restart
    if command -v nvidia-ctk &>/dev/null; then
        nvidia-ctk runtime configure --runtime=docker 2>/dev/null || true
        systemctl restart docker 2>/dev/null || true
        echo "  Docker runtime configured for NVIDIA GPU access."
    fi

    # Verify GPU passthrough inside a container
    if docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 \
        nvidia-smi --query-gpu=name --format=csv,noheader &>/dev/null; then
        GPU_IN_CONTAINER=$(docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 \
            nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        echo "  GPU passthrough verified: ${GPU_IN_CONTAINER}"
    else
        echo "  [WARN] NVIDIA CT installed but GPU passthrough test failed."
        echo "  Ensure NVIDIA drivers (>= 450.x) are installed: https://www.nvidia.com/download/index.aspx"
        echo "  The daemon will fall back to bare-metal execution until this is resolved."
    fi
else
    echo "  [INFO] NVIDIA Container Toolkit is only available on Linux."
    echo "  macOS providers will use bare-metal execution mode."
fi

# ── Step 6: Pull DCP Worker Images ─────────────────────────────────────
echo "[6/8] Pulling DCP worker images..."
if command -v docker &>/dev/null; then
    # For now, build from local Dockerfiles if registry not set
    # In production, these would be: docker pull ghcr.io/dhnpmp-tech/dc1-sd-worker:latest
    echo "  [INFO] Worker images will be built on first job or pulled from DCP registry."
    echo "  Pre-pulling NVIDIA base image..."
    docker pull nvidia/cuda:12.2.0-runtime-ubuntu22.04 2>/dev/null && \
        echo "  NVIDIA CUDA base image cached." || \
        echo "  [WARN] Could not pull NVIDIA base image. Will pull on first job."
fi

# ── Step 7: Download daemon + create service ────────────────────────────
echo "[7/8] Downloading DCP daemon..."
mkdir -p "$INSTALL_DIR" "$LOG_DIR"
curl -sL "${DC1_API_URL}/api/providers/download/daemon?key=${DC1_API_KEY}" -o "${INSTALL_DIR}/dcp_daemon.py"
chmod +x "${INSTALL_DIR}/dcp_daemon.py"
echo "  Installed to ${INSTALL_DIR}/dcp_daemon.py"

# Inference-server supervisor installer. Direct response to 2026-05-21
# Node 2 outage (llama-server died from CUDA OOM, stayed down 12h because
# nothing supervised it). The script is idempotent and runs before the
# daemon starts via systemd ExecStartPre= below.
echo "  Installing inference supervisor (setup-inference-supervisors.sh)..."
curl -sL "${DC1_API_URL}/api/providers/download/setup-inference-supervisors?key=${DC1_API_KEY}" \
  -o "${INSTALL_DIR}/setup-inference-supervisors.sh" \
  || echo "  [WARN] supervisor installer download failed (continuing; daemon will still start)"
chmod +x "${INSTALL_DIR}/setup-inference-supervisors.sh" 2>/dev/null || true

# Save config
cat > "${INSTALL_DIR}/config.json" << CONF
{
  "api_key": "${DC1_API_KEY}",
  "api_url": "${DC1_API_URL}",
  "daemon_version": "3.3.0",
  "run_mode": "always-on",
  "force_bare_metal": false
}
CONF

# Create systemd service (Linux) or launchd plist (Mac)
echo "[8/8] Creating background service..."

if [ "$(uname)" = "Linux" ] && command -v systemctl &>/dev/null; then
    ACTUAL_USER=$(logname 2>/dev/null || echo "$SUDO_USER" || echo "root")
    ACTUAL_HOME=$(eval echo ~"$ACTUAL_USER")

    # ── FIX #5a: passwordless sudo for wg-quick self-heal ────────────────
    # The daemon runs as the unprivileged $ACTUAL_USER but its WireGuard
    # self-heal path (_self_heal_wg in dcp_daemon.py) shells out to
    # `sudo -n wg-quick down/up <iface>`. Without a NOPASSWD sudoers rule
    # that non-interactive sudo fails silently, so a zombied tunnel never
    # recovers on its own. We grant the run-user passwordless sudo for
    # EXACTLY the wg-quick binary on EXACTLY the wireguard interfaces we
    # manage (wg0 primary + wg1 UDP/443 fallback). Nothing else.
    #
    # Security notes:
    #   - Scoped to the resolved absolute wg-quick path only.
    #   - Scoped to the up/down verbs + the wg0/wg1 ifaces only (no
    #     arbitrary .conf paths, no other wg-quick subcommands).
    #   - Validated with `visudo -cf` BEFORE being moved into place; a
    #     malformed drop-in that breaks sudo system-wide is never installed.
    #   - File mode 0440 root:root (sudo refuses world/group-writable
    #     drop-ins).
    # If $ACTUAL_USER is root the daemon never needs sudo, so we skip.
    if [ "$ACTUAL_USER" != "root" ]; then
        # Resolve the absolute wg-quick path. sudoers Cmnd specs must be
        # absolute — a bare "wg-quick" would never match `sudo wg-quick`
        # (which sudo resolves against secure_path to an absolute path).
        WG_QUICK_BIN="$(command -v wg-quick 2>/dev/null || true)"
        if [ -z "$WG_QUICK_BIN" ]; then
            for _cand in /usr/bin/wg-quick /usr/local/bin/wg-quick /bin/wg-quick; do
                [ -x "$_cand" ] && WG_QUICK_BIN="$_cand" && break
            done
        fi
        if [ -n "$WG_QUICK_BIN" ]; then
            SUDOERS_TMP="$(mktemp /tmp/dcp-wg.sudoers.XXXXXX)"
            # NOTE: literal tunnel names (wg0/wg1) are matched as the final
            # argument; the up/down verb is fixed per line. This is the
            # tightest spec sudo supports for "this binary + these args".
            cat > "$SUDOERS_TMP" << SUDOERS
# Installed by dcp-setup-unix.sh — DCP WireGuard self-heal.
# Grants $ACTUAL_USER passwordless sudo for ONLY wg-quick up/down on the
# wg0 (primary) and wg1 (UDP/443 fallback) interfaces. Do not edit by hand;
# re-run the provider installer to regenerate. See dcp_daemon.py _self_heal_wg.
Cmnd_Alias DCP_WGQUICK = $WG_QUICK_BIN up wg0, $WG_QUICK_BIN down wg0, $WG_QUICK_BIN up wg1, $WG_QUICK_BIN down wg1
$ACTUAL_USER ALL=(root) NOPASSWD: DCP_WGQUICK
SUDOERS
            # Validate the drop-in in isolation BEFORE it can affect sudo.
            if visudo -cf "$SUDOERS_TMP" >/dev/null 2>&1; then
                install -o root -g root -m 0440 "$SUDOERS_TMP" /etc/sudoers.d/dcp-wg
                echo "  Installed /etc/sudoers.d/dcp-wg (NOPASSWD wg-quick up/down wg0,wg1 for $ACTUAL_USER)."
            else
                echo "  [WARN] generated sudoers failed visudo validation — NOT installing."
                echo "         WireGuard self-heal will require manual sudo config."
            fi
            rm -f "$SUDOERS_TMP"
        else
            echo "  [WARN] wg-quick not found on PATH — skipping NOPASSWD sudoers."
            echo "         WireGuard auto-heal will be unavailable until wg-quick is installed + sudoers added."
        fi
    fi

    # ── FIX #5d: detect the engine the provider actually runs ────────────
    # The supervised inference engine must be whatever is actually serving
    # (Ollama :11434 / vLLM :8000 / llama.cpp :8080 / MLX), not a hardcoded
    # ~/models/*.gguf assumption. We probe the well-known local ports as the
    # run-user (so a user-scoped Ollama is visible) and record the result so
    # the post-install assertion checks the RIGHT unit.
    DCP_ENGINE_KIND=""        # ollama | vllm | llamacpp | mlx | ""
    DCP_ENGINE_UNIT=""        # systemd unit we expect to be enabled (if any)
    _probe_port() {
        # $1 = port. Returns 0 if something is listening locally.
        if command -v ss &>/dev/null; then
            ss -ltn 2>/dev/null | grep -q ":$1 "
        elif command -v curl &>/dev/null; then
            curl -fsS -m 2 "http://127.0.0.1:$1/" >/dev/null 2>&1
        else
            return 1
        fi
    }
    if _probe_port 11434; then
        DCP_ENGINE_KIND="ollama"
        # Ollama ships a system unit on most installs; fall back to user scope.
        if systemctl list-unit-files 2>/dev/null | grep -q '^ollama\.service'; then
            DCP_ENGINE_UNIT="ollama.service"
        fi
    elif _probe_port 8000; then
        DCP_ENGINE_KIND="vllm"
    elif _probe_port 8080; then
        DCP_ENGINE_KIND="llamacpp"
        # The llama.cpp supervisor units (installed by
        # setup-inference-supervisors.sh) are USER-scoped: dcp-llama-*.service.
    elif _probe_port 8081 || pgrep -f 'mlx_lm' >/dev/null 2>&1; then
        DCP_ENGINE_KIND="mlx"
    fi
    if [ -n "$DCP_ENGINE_KIND" ]; then
        echo "  Detected inference engine: $DCP_ENGINE_KIND${DCP_ENGINE_UNIT:+ (unit=$DCP_ENGINE_UNIT)}"
    else
        echo "  [INFO] No running inference engine detected on :11434/:8000/:8080 yet."
        echo "         The daemon will detect + report it once an engine is started."
    fi

    cat > /etc/systemd/system/dc1-provider.service << SVC
[Unit]
Description=DCP Provider Daemon
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$ACTUAL_USER
# Best-effort: bootstrap llama-server systemd supervisors before the daemon
# starts. Leading "-" means we ignore exit code so a missing/failed script
# does not block the daemon. See backend/installers/setup-inference-supervisors.sh
# and memory/incident_node2_oom_2026-05-21.md for the rationale.
ExecStartPre=-/bin/bash ${INSTALL_DIR}/setup-inference-supervisors.sh
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/dcp_daemon.py
Restart=always
RestartSec=10
Environment=HOME=$ACTUAL_HOME

[Install]
WantedBy=multi-user.target
SVC

    systemctl daemon-reload
    systemctl enable dc1-provider
    systemctl start dc1-provider
    echo "  systemd service created and started."

    # ── FIX #5c: boot persistence ────────────────────────────────────────
    # 1) loginctl enable-linger so the run-user's USER-scoped units
    #    (the llama.cpp dcp-llama-*.service supervisors) start at boot
    #    without an interactive login. Harmless if already on.
    if [ "$ACTUAL_USER" != "root" ]; then
        if ! loginctl show-user "$ACTUAL_USER" 2>/dev/null | grep -q '^Linger=yes'; then
            loginctl enable-linger "$ACTUAL_USER" 2>/dev/null \
                && echo "  Enabled linger for $ACTUAL_USER (user units survive reboot)." \
                || echo "  [WARN] enable-linger failed for $ACTUAL_USER — user-scoped engine units may not auto-start at boot."
        else
            echo "  Linger already enabled for $ACTUAL_USER."
        fi
    fi

    # 2) Enable the WireGuard tunnel unit(s) at boot so the mesh comes back
    #    after a reboot. We enable whichever wg<N>.conf exists in
    #    /etc/wireguard (wg0 primary, wg1 UDP/443 fallback). enable (not
    #    just start) is what makes them survive reboot.
    WG_BOOT_IFACE=""
    for _iface in wg0 wg1; do
        if [ -f "/etc/wireguard/${_iface}.conf" ]; then
            systemctl enable "wg-quick@${_iface}" 2>/dev/null \
                && echo "  Enabled wg-quick@${_iface} at boot." \
                || echo "  [WARN] could not enable wg-quick@${_iface} (unit may be managed elsewhere)."
            [ -z "$WG_BOOT_IFACE" ] && WG_BOOT_IFACE="$_iface"
        fi
    done
    if [ -z "$WG_BOOT_IFACE" ]; then
        echo "  [INFO] No /etc/wireguard/wg{0,1}.conf yet — wg-quick@ boot-enable skipped."
        echo "         (Tunnel config is provisioned separately; re-run after it lands.)"
    fi

    # 3) Make sure the detected engine unit is ENABLED (not just running).
    #    User-scoped llama.cpp units are enabled by setup-inference-supervisors.sh;
    #    here we only enable a system-scoped engine unit (e.g. ollama.service).
    if [ -n "$DCP_ENGINE_UNIT" ]; then
        systemctl enable "$DCP_ENGINE_UNIT" 2>/dev/null \
            && echo "  Enabled engine unit $DCP_ENGINE_UNIT at boot." \
            || echo "  [WARN] could not enable $DCP_ENGINE_UNIT at boot."
    fi

    # ── FIX #5e: post-install boot-persistence assertion ─────────────────
    # This runs at INSTALL time (not runtime) so failing loudly is correct:
    # a provider that "installs OK" but silently won't survive a reboot is
    # the exact foot-gun we are eliminating. We assert the daemon unit, the
    # engine unit (when one was detected), and the wg-quick@<iface> unit are
    # all `is-enabled`. Any miss aborts the install with a clear message.
    echo ""
    echo "  Verifying boot persistence (systemctl is-enabled)..."
    ASSERT_FAILED=0

    if systemctl is-enabled dc1-provider >/dev/null 2>&1; then
        echo "    [OK] dc1-provider enabled"
    else
        echo "    [FAIL] dc1-provider is NOT enabled — daemon will not start on reboot"
        ASSERT_FAILED=1
    fi

    # Engine unit assertion. System-scoped units use plain systemctl;
    # user-scoped llama.cpp units use `systemctl --user` run AS the run-user.
    if [ -n "$DCP_ENGINE_UNIT" ]; then
        if systemctl is-enabled "$DCP_ENGINE_UNIT" >/dev/null 2>&1; then
            echo "    [OK] engine unit $DCP_ENGINE_UNIT enabled"
        else
            echo "    [FAIL] engine unit $DCP_ENGINE_UNIT is NOT enabled"
            ASSERT_FAILED=1
        fi
    elif [ "$DCP_ENGINE_KIND" = "llamacpp" ] && [ "$ACTUAL_USER" != "root" ]; then
        # llama.cpp supervisors are user-scoped (dcp-llama-*.service). Check
        # that at least one is enabled in the run-user's manager.
        if sudo -u "$ACTUAL_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$ACTUAL_USER")" \
             systemctl --user list-unit-files 'dcp-llama-*.service' 2>/dev/null \
             | grep -q 'enabled'; then
            echo "    [OK] llama.cpp user supervisor unit enabled"
        else
            echo "    [FAIL] no enabled dcp-llama-*.service user unit — llama.cpp won't auto-start on reboot"
            ASSERT_FAILED=1
        fi
    else
        echo "    [SKIP] engine unit assertion (no engine detected yet — daemon will manage at runtime)"
    fi

    # wg-quick@<iface> assertion — only when a tunnel config exists.
    if [ -n "$WG_BOOT_IFACE" ]; then
        if systemctl is-enabled "wg-quick@${WG_BOOT_IFACE}" >/dev/null 2>&1; then
            echo "    [OK] wg-quick@${WG_BOOT_IFACE} enabled"
        else
            echo "    [FAIL] wg-quick@${WG_BOOT_IFACE} is NOT enabled — mesh won't reconnect on reboot"
            ASSERT_FAILED=1
        fi
    else
        echo "    [SKIP] wg-quick@ assertion (no /etc/wireguard/wg{0,1}.conf present yet)"
    fi

    if [ "$ASSERT_FAILED" -ne 0 ]; then
        echo ""
        echo "  ============================================"
        echo "  [INSTALL FAILED] One or more units are not enabled for boot."
        echo "  This provider would NOT recover after a reboot. Fix the units"
        echo "  flagged [FAIL] above (usually: re-run after WireGuard config and"
        echo "  the inference engine are in place), then re-run this installer."
        echo "  ============================================"
        exit 1
    fi
    echo "  Boot persistence verified."

elif [ "$(uname)" = "Darwin" ]; then
    ACTUAL_HOME="$HOME"
    PLIST_PATH="$ACTUAL_HOME/Library/LaunchAgents/com.dc1.provider.plist"
    mkdir -p "$ACTUAL_HOME/Library/LaunchAgents"
    cat > "$PLIST_PATH" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.dc1.provider</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>${INSTALL_DIR}/dcp_daemon.py</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${LOG_DIR}/daemon.log</string>
    <key>StandardErrorPath</key><string>${LOG_DIR}/daemon-error.log</string>
</dict>
</plist>
PLIST
    launchctl load "$PLIST_PATH" 2>/dev/null || true
    echo "  launchd agent created and loaded."
else
    echo "  [WARN] No service manager found. Run manually:"
    echo "    python3 ${INSTALL_DIR}/dcp_daemon.py"
fi

# Status
sleep 3
echo ""
echo "============================================"
echo "  DCP Provider Daemon v3.3.0 — INSTALLED"
echo "============================================"
echo "  Daemon:  ${INSTALL_DIR}/dcp_daemon.py"
echo "  Config:  ${INSTALL_DIR}/config.json"
echo "  Logs:    ${LOG_DIR}/daemon.log"
echo "  Key:     ${DC1_API_KEY:0:20}..."
echo ""
echo "  Docker:  $(docker --version 2>/dev/null || echo 'not installed')"
echo "  GPU:     $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo 'not detected')"
echo ""
echo "  Commands:"
echo "    Status: systemctl status dc1-provider"
echo "    Logs:   journalctl -u dc1-provider -f"
echo "    Stop:   systemctl stop dc1-provider"
echo ""
echo "  Dashboard: ${DC1_API_URL}/api/providers/status/${DC1_API_KEY}"
echo "============================================"
