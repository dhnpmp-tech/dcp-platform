#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Interactive-pod public relay (VPS side).
#
# An interactive_pod (job_type) runs as a Docker container on a provider
# machine, reachable from the VPS ONLY over the WireGuard mesh (10.8.0.0/24
# or 10.9.0.0/24). The renter, however, needs a PUBLIC api.dcp.sa:<port> for
# Jupyter (HTTP) and SSH. This script bridges that gap: for one pod it
# allocates a free public VPS port in each of the two reserved ranges and
# spawns a detached `socat` forwarder per port:
#
#     api.dcp.sa:<jpub>  →  <wg_mesh_ip>:<jport>   (Jupyter, container :8888)
#     api.dcp.sa:<spub>  →  <wg_mesh_ip>:<sport>   (SSH,     container :22)
#
# The backend's endpoint-ready handler (jobs.js) calls:
#     pod-relay.sh start <job_id> <wg_mesh_ip> <jport> <sport>
# and parses the single-line JSON {"jpub":N,"spub":N} printed to stdout, then
# builds access_url=http://api.dcp.sa:<jpub>/?token=<jupyter_token> and
# ssh_command='ssh -p <spub> root@api.dcp.sa'. On teardown (DELETE /api/pods)
# the backend calls `pod-relay.sh stop <job_id>`.
#
# CONTRACT / safety:
#   * Public port ranges are RESERVED for pods: jpub 41000-41999,
#     spub 42000-42999. We NEVER grab a port that is already listening — a
#     prior PoC killed a live service by binding an in-use port. Each
#     candidate is checked free with `ss -tlnH "sport = :$p"` first.
#   * Per-pod state lives in /tmp/dcp-pods/<job_id>.json (ports + socat PIDs)
#     so `stop` is deterministic and `start` is idempotent (re-`start` of an
#     existing job tears the old relay down first, then re-allocates).
#   * Forwarders are `setsid socat …,fork,reuseaddr` detached from this shell
#     so they survive the backend process and request lifecycle.
#
# Operator prereq:  apt-get install -y socat   (and `ss` from iproute2,
#   present on every default Debian/Ubuntu VPS).
#
# Usage:
#   pod-relay.sh start <job_id> <wg_mesh_ip> <jupyter_host_port> <ssh_host_port>
#   pod-relay.sh stop  <job_id>
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

STATE_DIR="/tmp/dcp-pods"

JPUB_MIN=41000
JPUB_MAX=41999
SPUB_MIN=42000
SPUB_MAX=42999

# TLS for the public Jupyter forwarder. We terminate TLS on the VPS using the
# existing api.dcp.sa Let's Encrypt cert (relay runs as root → key is readable)
# so the Jupyter token never crosses the public internet in cleartext. The
# VPS→provider hop stays plain TCP but rides inside the WireGuard mesh, so the
# token is never exposed on an untrusted network. Path is overridable; if the
# cert is unreadable we fall back to plain TCP (see spawn_forwarder) so a node
# without the cert still works on http.
DCP_POD_TLS_CERT_DIR="${DCP_POD_TLS_CERT_DIR:-/etc/letsencrypt/live/api.dcp.sa}"

log() { echo "[pod-relay] $*" >&2; }
die() { echo "[pod-relay] FATAL: $*" >&2; exit 1; }

# ── helpers ────────────────────────────────────────────────────────────────

# Numeric guard for untrusted positional args (job_id may be alnum + dashes).
is_uint() { [[ "${1:-}" =~ ^[0-9]+$ ]]; }

# Job ids are used verbatim in a file path — keep them to a safe charset so a
# crafted id can't escape STATE_DIR.
sanitize_job_id() {
  local raw="${1:-}"
  [[ "${raw}" =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid job_id: ${raw}"
  printf '%s' "${raw}"
}

state_file() { printf '%s/%s.json' "${STATE_DIR}" "$1"; }

# True (exit 0) when TCP port $1 has NO local listener. Header-less `ss`
# output is empty exactly when nothing is bound to that port.
port_is_free() {
  local p="$1"
  [[ -z "$(ss -tlnH "sport = :${p}" 2>/dev/null)" ]]
}

# Echo the first free port in [$1,$2]; non-zero exit if the range is exhausted.
alloc_port() {
  local lo="$1" hi="$2" p
  for (( p = lo; p <= hi; p++ )); do
    if port_is_free "${p}"; then
      printf '%s' "${p}"
      return 0
    fi
  done
  return 1
}

# Spawn a detached socat forwarder pub-port → mesh:host-port. Echoes its PID.
# A truthy 4th arg requests TLS termination on the public side: we listen with
# OPENSSL-LISTEN using the api.dcp.sa LE cert so the (cleartext-on-mesh) upstream
# is fronted by https. The SSH forwarder passes no 4th arg and stays raw TCP —
# SSH is already encrypted. If TLS is requested but the cert/key are unreadable
# (node without the LE cert) we log a warning and fall back to plain TCP-LISTEN
# so the pod still works over http instead of failing to start.
spawn_forwarder() {
  local pub="$1" mesh_ip="$2" host_port="$3" use_tls="${4:-}"
  local cert="${DCP_POD_TLS_CERT_DIR}/fullchain.pem"
  local key="${DCP_POD_TLS_CERT_DIR}/privkey.pem"
  if [[ -n "${use_tls}" ]]; then
    if [[ -r "${cert}" && -r "${key}" ]]; then
      setsid socat \
        "OPENSSL-LISTEN:${pub},cert=${cert},key=${key},fork,reuseaddr,verify=0" \
        "TCP:${mesh_ip}:${host_port}" \
        </dev/null >/dev/null 2>&1 &
      printf '%s' "$!"
      return 0
    fi
    log "WARN: TLS requested but cert unreadable (${cert}) — falling back to plain TCP-LISTEN:${pub} (http)"
  fi
  setsid socat \
    "TCP-LISTEN:${pub},fork,reuseaddr" \
    "TCP:${mesh_ip}:${host_port}" \
    </dev/null >/dev/null 2>&1 &
  printf '%s' "$!"
}

# Kill a socat we started, but only if it still looks like our forwarder, so a
# recycled PID belonging to something else is never signalled.
kill_forwarder() {
  local pid="$1" pub="$2"
  is_uint "${pid}" || return 0
  kill -0 "${pid}" 2>/dev/null || return 0
  if grep -qaE "(TCP-LISTEN|OPENSSL-LISTEN):${pub}," "/proc/${pid}/cmdline" 2>/dev/null \
     || ! [[ -r "/proc/${pid}/cmdline" ]]; then
    kill "${pid}" 2>/dev/null || true
  fi
}

# Read a numeric field from a pod state file (jq if present, else grep). Empty
# string when absent so callers can guard with is_uint.
state_field() {
  local file="$1" key="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg k "${key}" '.[$k] // empty' "${file}" 2>/dev/null
  else
    grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*[0-9]+" "${file}" 2>/dev/null \
      | head -1 | grep -oE '[0-9]+$' || true
  fi
}

# ── stop ─────────────────────────────────────────────────────────────────--

cmd_stop() {
  local job_id; job_id="$(sanitize_job_id "${1:?job_id required}")"
  local file; file="$(state_file "${job_id}")"

  if [[ ! -f "${file}" ]]; then
    log "stop ${job_id}: no state file — already stopped"
    echo '{"stopped":true}'
    return 0
  fi

  local jpid spid jpub spub
  jpid="$(state_field "${file}" jpid)"
  spid="$(state_field "${file}" spid)"
  jpub="$(state_field "${file}" jpub)"
  spub="$(state_field "${file}" spub)"

  kill_forwarder "${jpid}" "${jpub:-0}"
  kill_forwarder "${spid}" "${spub:-0}"

  rm -f "${file}"
  log "stop ${job_id}: relay torn down (jpub=${jpub:-?} spub=${spub:-?})"
  echo '{"stopped":true}'
}

# ── start ────────────────────────────────────────────────────────────────--

cmd_start() {
  local job_id mesh_ip jport sport
  job_id="$(sanitize_job_id "${1:?job_id required}")"
  mesh_ip="${2:?wg_mesh_ip required}"
  jport="${3:?jupyter_host_port required}"
  sport="${4:?ssh_host_port required}"

  is_uint "${jport}" || die "jupyter_host_port not numeric: ${jport}"
  is_uint "${sport}" || die "ssh_host_port not numeric: ${sport}"
  [[ "${mesh_ip}" =~ ^10\.(8|9)\.[0-9]+\.[0-9]+$ ]] \
    || die "wg_mesh_ip outside the WG mesh (10.8/10.9): ${mesh_ip}"

  command -v socat >/dev/null 2>&1 || die "socat not installed (apt-get install -y socat)"
  command -v ss    >/dev/null 2>&1 || die "ss not found (install iproute2)"

  mkdir -p "${STATE_DIR}"

  # Idempotent: a re-start replaces any prior relay for this job so we never
  # leak forwarders or double-bind.
  if [[ -f "$(state_file "${job_id}")" ]]; then
    log "start ${job_id}: existing relay found — replacing"
    cmd_stop "${job_id}" >/dev/null
  fi

  local jpub spub
  jpub="$(alloc_port "${JPUB_MIN}" "${JPUB_MAX}")" \
    || die "no free Jupyter public port in ${JPUB_MIN}-${JPUB_MAX}"
  spub="$(alloc_port "${SPUB_MIN}" "${SPUB_MAX}")" \
    || die "no free SSH public port in ${SPUB_MIN}-${SPUB_MAX}"

  local jpid spid
  # Jupyter forwarder terminates TLS (4th arg 'tls'); SSH stays raw TCP.
  jpid="$(spawn_forwarder "${jpub}" "${mesh_ip}" "${jport}" tls)"
  spid="$(spawn_forwarder "${spub}" "${mesh_ip}" "${sport}")"

  local file; file="$(state_file "${job_id}")"
  cat > "${file}" <<JSON
{"job_id":"${job_id}","mesh_ip":"${mesh_ip}","jport":${jport},"sport":${sport},"jpub":${jpub},"spub":${spub},"jpid":${jpid},"spid":${spid}}
JSON

  log "start ${job_id}: ${mesh_ip}:${jport}→:${jpub} (pid ${jpid}), ${mesh_ip}:${sport}→:${spub} (pid ${spid})"
  printf '{"jpub":%s,"spub":%s}\n' "${jpub}" "${spub}"
}

# ── dispatch ─────────────────────────────────────────────────────────────--

main() {
  local action="${1:-}"
  case "${action}" in
    start) shift; cmd_start "$@" ;;
    stop)  shift; cmd_stop  "$@" ;;
    *)     die "usage: pod-relay.sh start <job_id> <wg_mesh_ip> <jport> <sport> | stop <job_id>" ;;
  esac
}

main "$@"
