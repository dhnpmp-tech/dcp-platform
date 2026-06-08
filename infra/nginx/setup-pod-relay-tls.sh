#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# Make the Let's Encrypt cert readable by the pod relay so DCP_RELAY_TLS=1 can
# TLS-terminate the public Jupyter leg (see backend/scripts/pod-relay.sh).
#
# The relay runs as the SAME user as the backend (pm2). That user normally
# cannot read /etc/letsencrypt/live (root:root, 0700 on archive/). Rather than
# loosen /etc/letsencrypt (which would expose ALL site keys), we copy ONLY the
# api.dcp.sa fullchain+privkey into a dedicated, tightly-scoped dir owned by the
# relay user, and install a certbot deploy-hook so renewals refresh the copy.
#
# Run as root on the VPS:  sudo bash infra/nginx/setup-pod-relay-tls.sh <relay_user>
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

RELAY_USER="${1:-${SUDO_USER:-www-data}}"
DOMAIN="api.dcp.sa"
LE_DIR="/etc/letsencrypt/live/${DOMAIN}"
DEST_DIR="/etc/dcp/pod-relay-tls"
HOOK="/etc/letsencrypt/renewal-hooks/deploy/dcp-pod-relay-tls.sh"

[[ $EUID -eq 0 ]] || { echo "must run as root" >&2; exit 1; }
id "${RELAY_USER}" >/dev/null 2>&1 || { echo "unknown user: ${RELAY_USER}" >&2; exit 1; }
[[ -r "${LE_DIR}/fullchain.pem" ]] || { echo "cert not found at ${LE_DIR}" >&2; exit 1; }

install -d -m 0750 -o "${RELAY_USER}" -g "${RELAY_USER}" "${DEST_DIR}"

sync_cert() {
  install -m 0644 -o "${RELAY_USER}" -g "${RELAY_USER}" "${LE_DIR}/fullchain.pem" "${DEST_DIR}/fullchain.pem"
  # Private key: readable ONLY by the relay user.
  install -m 0400 -o "${RELAY_USER}" -g "${RELAY_USER}" "${LE_DIR}/privkey.pem"  "${DEST_DIR}/privkey.pem"
}
sync_cert

# Persist the deploy hook so cert renewals re-copy automatically.
install -d -m 0755 "$(dirname "${HOOK}")"
cat > "${HOOK}" <<HOOK_EOF
#!/usr/bin/env bash
set -e
install -m 0644 -o ${RELAY_USER} -g ${RELAY_USER} ${LE_DIR}/fullchain.pem ${DEST_DIR}/fullchain.pem
install -m 0400 -o ${RELAY_USER} -g ${RELAY_USER} ${LE_DIR}/privkey.pem  ${DEST_DIR}/privkey.pem
HOOK_EOF
chmod 0755 "${HOOK}"

cat <<DONE
[pod-relay-tls] cert staged for relay user '${RELAY_USER}' at ${DEST_DIR}
[pod-relay-tls] renewal deploy-hook installed at ${HOOK}

Now set these in the backend (pm2) environment and restart it:
    DCP_RELAY_TLS=1
    DCP_RELAY_TLS_CERT=${DEST_DIR}/fullchain.pem
    DCP_RELAY_TLS_KEY=${DEST_DIR}/privkey.pem

Then launch a pod and confirm access_url starts with https://.
DONE
