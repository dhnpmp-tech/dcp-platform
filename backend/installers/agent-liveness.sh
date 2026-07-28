#!/bin/sh
# DCP Hermes Agent Liveness Beacon
#
# Spec: dc1-platform/docs/hermes-liveness-spec.md
# Backend route: POST https://${DCP_API_BASE}/api/providers/:id/agent-liveness
# Backend handler: dc1-platform/backend/src/routes/providers.js (PR #398)
#
# Runs every 60s (driven by cron or the cron-orchestrator skill). Posts a small
# JSON liveness blob so the central platform can see whether the Hermes gateway
# is alive even when no inference is flowing.
#
# On ack, if `wants_logs_at` is non-null, uploads the tail of ~/.dcp/agent.log to
# /agent-logs (capped at 64 KB by the backend).
#
# Hard requirements (do not "improve" without re-reading the spec):
#   - never block / loop the host: a single curl with --max-time
#   - never ship secrets: log_excerpt is sent raw; backend redacts. We still
#     run a minimal client-side redact pass so a backend drift can't leak keys.
#   - Auth: x-provider-key header (Authorization: Bearer also accepted).
#
# Idempotent + safe to run from cron every minute.

set -u

DCP_DIR="${DCP_DIR:-$HOME/.dcp}"
HERMES_ENV="${HERMES_ENV:-$HOME/.hermes/.env}"
AGENT_ENV="${AGENT_ENV:-$DCP_DIR/agent/.env}"
AGENT_LOG="${AGENT_LOG:-$DCP_DIR/agent.log}"
AGENT_STATE="${AGENT_STATE:-$DCP_DIR/agent-state.json}"
BEACON_LOG="${BEACON_LOG:-$DCP_DIR/agent-liveness.log}"

mkdir -p "$DCP_DIR"

# ── Load config ────────────────────────────────────────────────────────────
# Prefer ~/.hermes/.env (the spec's contract), fall back to ~/.dcp/agent/.env
# which the current installer writes today.
if [ -f "$HERMES_ENV" ]; then
  # shellcheck disable=SC1090
  . "$HERMES_ENV"
fi
if [ -f "$AGENT_ENV" ]; then
  # shellcheck disable=SC1090
  . "$AGENT_ENV"
fi

DCP_API_BASE="${DCP_API_BASE:-https://api.dcp.sa}"
# strip trailing slash
DCP_API_BASE="${DCP_API_BASE%/}"

if [ -z "${DCP_PROVIDER_KEY:-}" ]; then
  echo "[$(date -u +%FT%TZ)] no DCP_PROVIDER_KEY — skipping" >> "$BEACON_LOG"
  exit 0
fi
if [ -z "${DCP_PROVIDER_ID:-}" ]; then
  echo "[$(date -u +%FT%TZ)] no DCP_PROVIDER_ID — skipping (run installer or register)" >> "$BEACON_LOG"
  exit 0
fi

# ── Gather liveness fields ─────────────────────────────────────────────────
AGENT="hermes"
PID="$(pgrep -f 'hermes gateway' 2>/dev/null | head -1 || true)"
[ -z "$PID" ] && PID=0

UPTIME_S=0
if [ "$PID" != "0" ] && [ -d "/proc/$PID" ]; then
  # Linux: process start in jiffies → seconds since boot.
  STARTED=$(awk '{print $22}' "/proc/$PID/stat" 2>/dev/null || echo 0)
  CLK_TCK=$(getconf CLK_TCK 2>/dev/null || echo 100)
  BOOT=$(awk '/btime/ {print $2}' /proc/stat 2>/dev/null || echo 0)
  NOW=$(date -u +%s)
  if [ "$STARTED" -gt 0 ] && [ "$BOOT" -gt 0 ]; then
    PROC_START=$(( BOOT + STARTED / CLK_TCK ))
    UPTIME_S=$(( NOW - PROC_START ))
  fi
elif [ "$PID" != "0" ] && [ "$(uname)" = "Darwin" ]; then
  # macOS: ps -o etime= gives elapsed time as [[dd-]hh:]mm:ss
  ET=$(ps -o etime= -p "$PID" 2>/dev/null | tr -d ' ')
  UPTIME_S=$(awk -v t="$ET" 'BEGIN {
    n=split(t, a, /[-:]/); s=0;
    if (n==4) { s=a[1]*86400 + a[2]*3600 + a[3]*60 + a[4] }
    else if (n==3) { s=a[1]*3600 + a[2]*60 + a[3] }
    else if (n==2) { s=a[1]*60 + a[2] }
    print s
  }')
  [ -z "$UPTIME_S" ] && UPTIME_S=0
fi

MEM_RSS_MB=0
if [ "$PID" != "0" ]; then
  RSS_KB=$(ps -o rss= -p "$PID" 2>/dev/null | tr -d ' ')
  [ -n "$RSS_KB" ] && MEM_RSS_MB=$(( RSS_KB / 1024 ))
fi

# Gateway state + dashboard port + active agents come from agent-state.json
# if the gateway writes them; otherwise leave null (backend tolerates null).
GATEWAY_STATE="null"
DASHBOARD_PORT="null"
ACTIVE_AGENTS=0
LAST_ERROR_EXCERPT=""
LAST_ERROR_AT="null"
if [ -f "$AGENT_STATE" ] && command -v python3 >/dev/null 2>&1; then
  STATE_VARS=$(AGENT_STATE="$AGENT_STATE" python3 - <<'PY' 2>/dev/null || true
import json, os, sys
try:
    with open(os.environ["AGENT_STATE"]) as f:
        s = json.load(f)
except Exception:
    s = {}
def _q(v):
    import shlex
    return "null" if v is None else shlex.quote(json.dumps(v))
print("GATEWAY_STATE=" + _q(s.get("gateway_state") or s.get("status") or "running"))
print("DASHBOARD_PORT=" + _q(s.get("dashboard_port")))
print("ACTIVE_AGENTS=" + str(int(s.get("active_agents") or 0)))
err = s.get("last_error_excerpt") or ""
import shlex; print("LAST_ERROR_EXCERPT=" + shlex.quote(json.dumps(err[:2000])))
print("LAST_ERROR_AT=" + _q(s.get("last_error_at")))
PY
)
  if [ -n "$STATE_VARS" ]; then
    eval "$STATE_VARS"
  fi
fi
# If gateway_state wasn't set, default to "running" only when we actually
# found a gateway PID, else "stopped".
if [ "$GATEWAY_STATE" = "null" ]; then
  if [ "$PID" != "0" ]; then
    GATEWAY_STATE='"running"'
  else
    GATEWAY_STATE='"stopped"'
  fi
fi
# Default LAST_ERROR_EXCERPT to empty JSON string
[ -z "${LAST_ERROR_EXCERPT:-}" ] && LAST_ERROR_EXCERPT='""'

# Platforms: very small detection — cuda / mps / cpu.
PLATFORMS_JSON='["cpu"]'
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  PLATFORMS_JSON='["cuda","cpu"]'
elif [ "$(uname)" = "Darwin" ]; then
  PLATFORMS_JSON='["mps","cpu"]'
fi

# log_tail_sha256: sha256 of last 64 KB of agent.log.
LOG_TAIL_SHA="null"
if [ -f "$AGENT_LOG" ]; then
  if command -v shasum >/dev/null 2>&1; then
    SHA=$(tail -c 65536 "$AGENT_LOG" 2>/dev/null | shasum -a 256 | awk '{print $1}')
  elif command -v sha256sum >/dev/null 2>&1; then
    SHA=$(tail -c 65536 "$AGENT_LOG" 2>/dev/null | sha256sum | awk '{print $1}')
  else
    SHA=""
  fi
  [ -n "$SHA" ] && LOG_TAIL_SHA="\"$SHA\""
fi

# ── Build + send liveness payload ──────────────────────────────────────────
BODY=$(cat <<JSON
{
  "agent": "$AGENT",
  "pid": $PID,
  "uptime_s": $UPTIME_S,
  "dashboard_port": $DASHBOARD_PORT,
  "gateway_state": $GATEWAY_STATE,
  "active_agents": $ACTIVE_AGENTS,
  "platforms": $PLATFORMS_JSON,
  "last_error_excerpt": $LAST_ERROR_EXCERPT,
  "last_error_at": $LAST_ERROR_AT,
  "mem_rss_mb": $MEM_RSS_MB,
  "log_tail_sha256": $LOG_TAIL_SHA
}
JSON
)

URL="$DCP_API_BASE/api/providers/$DCP_PROVIDER_ID/agent-liveness"
RESP=$(curl -sS --max-time 10 -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-provider-key: $DCP_PROVIDER_KEY" \
  -H "Authorization: Bearer $DCP_PROVIDER_KEY" \
  -d "$BODY" 2>&1) || {
    echo "[$(date -u +%FT%TZ)] beacon POST failed: $RESP" >> "$BEACON_LOG"
    exit 0
  }

echo "[$(date -u +%FT%TZ)] ack=$RESP" >> "$BEACON_LOG"

# ── Honour fleet recovery channel (one-shot, local allowlist) ──────────────
# The backend fleet watcher can set recover.action in the ack. The beacon is
# an independent cron, so this path works even when the daemon is dead —
# that's the whole point. We validate locally: ONLY start_daemon, and ONLY
# when no daemon process is running. Anything else is ignored and logged.
RECOVER=$(printf '%s' "$RESP" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  r=d.get("recover") or {}
  print(r.get("action") or "")
except Exception:
  print("")
' 2>/dev/null || echo "")
if [ -n "$RECOVER" ]; then
  case "$RECOVER" in
    start_daemon)
      DAEMON_DIR="${DCP_DAEMON_DIR:-$HOME/dcp-provider}"
      if pgrep -f "dcp_daemon.py" >/dev/null 2>&1; then
        echo "[$(date -u +%FT%TZ)] recover start_daemon skipped: daemon already running" >> "$BEACON_LOG"
      elif [ -f "$DAEMON_DIR/dcp_daemon.py" ]; then
        cd "$DAEMON_DIR" && nohup python3 dcp_daemon.py >> daemon.log 2>&1 &
        echo "[$(date -u +%FT%TZ)] recover start_daemon: launched from $DAEMON_DIR" >> "$BEACON_LOG"
      else
        echo "[$(date -u +%FT%TZ)] recover start_daemon failed: $DAEMON_DIR/dcp_daemon.py not found" >> "$BEACON_LOG"
      fi
      ;;
    *)
      echo "[$(date -u +%FT%TZ)] recover action '$RECOVER' not in local allowlist — ignored" >> "$BEACON_LOG"
      ;;
  esac
fi

# ── Honour wants_logs_at pull-trigger ──────────────────────────────────────
WANTS=$(printf '%s' "$RESP" | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin)
  v=d.get("wants_logs_at")
  print(v if v else "")
except Exception:
  print("")
' 2>/dev/null || echo "")

if [ -n "$WANTS" ] && [ -f "$AGENT_LOG" ]; then
  EXCERPT=$(tail -c 65536 "$AGENT_LOG" 2>/dev/null | python3 -c 'import sys,json
data=sys.stdin.buffer.read().decode("utf-8","replace")
# match backend redactions so we never ship secrets even if backend rules drift
import re
patterns=[
  (re.compile(r"(bearer\s+)([A-Za-z0-9._\-]{8,})", re.I), r"\1[REDACTED]"),
  (re.compile(r"(api[_\-]?key[\"\x27\s:=]+)([^\s\"\x27,]+)", re.I), r"\1[REDACTED]"),
  (re.compile(r"(password[\"\x27\s:=]+)([^\s\"\x27,]+)", re.I), r"\1[REDACTED]"),
  (re.compile(r"eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}"), "[REDACTED_JWT]"),
  (re.compile(r"\bdcp-provider-[A-Za-z0-9_\-]{6,}"), "dcp-provider-[REDACTED]"),
  (re.compile(r"\bdcp-renter-[A-Za-z0-9_\-]{6,}"), "dcp-renter-[REDACTED]"),
]
for p,r in patterns: data=p.sub(r,data)
print(json.dumps({"log_excerpt": data}))' 2>/dev/null || echo "")
  if [ -n "$EXCERPT" ]; then
    LOG_URL="$DCP_API_BASE/api/providers/$DCP_PROVIDER_ID/agent-logs"
    LOG_RESP=$(curl -sS --max-time 15 -X POST "$LOG_URL" \
      -H "Content-Type: application/json" \
      -H "x-provider-key: $DCP_PROVIDER_KEY" \
      -H "Authorization: Bearer $DCP_PROVIDER_KEY" \
      -d "$EXCERPT" 2>&1) || LOG_RESP="curl-failed"
    echo "[$(date -u +%FT%TZ)] log-upload ack=$LOG_RESP" >> "$BEACON_LOG"
  fi
fi

exit 0
