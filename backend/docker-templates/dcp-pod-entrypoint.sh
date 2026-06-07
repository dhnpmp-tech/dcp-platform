#!/bin/sh
# DCP pre-baked pod entrypoint (POSIX sh).
#
# Pre-baked dcp-compute:<alias> images ship sshd already installed, so the
# daemon launches them with bootstrap_ssh=false and never injects SSH. This
# entrypoint therefore does the same per-launch setup the daemon's bootstrap
# does for arbitrary images: set the root password, enable root password login,
# generate host keys, and start sshd. Because no apt runs at launch, these pods
# come up in seconds.
#
# Contract (kept in lockstep with the daemon's injected bootstrap):
#   - $ROOT_PASSWORD : password set for root SSH login
#   - $JUPYTER_TOKEN : token for Jupyter Lab on :8888 (only if jupyter is present)
# Every pod is reachable over SSH on :22; Jupyter on :8888 is best-effort and
# surfaced by the daemon via access_url only when the image ships it.
set -eu

# 1. sshd needs its privilege-separation dir to exist.
mkdir -p /run/sshd /var/run/sshd

# 2. Set the root password from the daemon-supplied env (default keeps a pod
#    usable if the var is somehow unset rather than leaving a blank password).
echo "root:${ROOT_PASSWORD:-dcp}" | chpasswd

# 3. Permit root + password auth so the renter can SSH in with ROOT_PASSWORD.
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config

# 4. Generate host keys (idempotent; -A only creates missing key types).
ssh-keygen -A >/dev/null 2>&1

# 5. Start the SSH daemon in the background.
/usr/sbin/sshd -D >/tmp/dcp-sshd.log 2>&1 &

# 6. Best-effort Jupyter Lab: only the pytorch image ships it. Surfaced via
#    access_url by the daemon when present.
if command -v jupyter >/dev/null 2>&1; then
  jupyter lab \
    --ip=0.0.0.0 \
    --port=8888 \
    --allow-root \
    --no-browser \
    --ServerApp.token="${JUPYTER_TOKEN:-}" \
    --ServerApp.password="" \
    >/var/log/dcp-jupyter.log 2>&1 &
fi

# 7. Expose a conda Python to non-login SSH shells. `ssh host cmd` runs a
#    non-login shell that never sources conda init, so python/pip would appear
#    "not found" even when installed. /usr/local/bin is on PATH everywhere.
if [ -d /opt/conda ]; then
  for bin in python python3 pip pip3; do
    if [ -x "/opt/conda/bin/$bin" ]; then
      ln -sf "/opt/conda/bin/$bin" "/usr/local/bin/$bin"
    fi
  done
fi

# 8. Keep PID 1 alive so the container (and its sshd/jupyter children) persists.
exec tail -f /dev/null
