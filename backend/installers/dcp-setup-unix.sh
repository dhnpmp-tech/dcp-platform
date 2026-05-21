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
