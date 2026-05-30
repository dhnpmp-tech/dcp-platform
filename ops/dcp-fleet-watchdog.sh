#!/bin/bash
# dcp-fleet-watchdog.sh — REAL offline/serving detection for DCP.
#
# Why this exists: the app heartbeat can be faked (see the tareq-keepalive cron),
# and the GitHub uptime monitor skips its inference sentinel. This watchdog uses
# signals that CANNOT be forged:
#   1. WireGuard handshake age (kernel truth) for Node 2's peer
#   2. A real /v1/chat/completions against a model the catalog reports as served
#      (model is DISCOVERED, never hardcoded — if another model is installed or
#       a model drops, this auto-adapts)
# Alerts go to Telegram topic 4 (Alerts), edge-triggered (only on state change).
#
# Secrets come from /root/dc1-platform/ops/.watchdog-env (chmod 600), NOT this file:
#   TG_DEV_BOT_TOKEN=...        # @dcp_dev_bot token  (ROTATE + update here)
#   TG_CHAT_ID=-1003773787353
#   TG_ALERT_TOPIC=4
#   DCP_MONITOR_RENTER_KEY=dcp-renter-...   # active renter key with a little balance
#
# Install: */2 * * * * root /root/dc1-platform/ops/dcp-fleet-watchdog.sh
set -uo pipefail

ENVF="${DCP_WATCHDOG_ENV:-/root/dc1-platform/ops/.watchdog-env}"
[ -f "$ENVF" ] && . "$ENVF"
API="${DCP_API:-https://api.dcp.sa}"
CHAT="${TG_CHAT_ID:--1003773787353}"
TOPIC="${TG_ALERT_TOPIC:-4}"
NODE2_PEER="${NODE2_WG_PEER:-vHFwGo4EvyQ8AFrC04YYQBRQYjk7iDH8hc22yon/PhM=}"
WG_STALE_S="${WG_STALE_S:-180}"
STATE="${DCP_WATCHDOG_STATE:-/var/lib/dcp-monitor/fleet-state}"
mkdir -p "$(dirname "$STATE")"; touch "$STATE"

_tg() { # $1 = text
  [ -n "${TG_DEV_BOT_TOKEN:-}" ] || { echo "[watchdog] no TG token; would alert: $1" >&2; return; }
  local body
  body=$(python3 - "$CHAT" "$TOPIC" "$1" <<'PY'
import json,sys
print(json.dumps({"chat_id":sys.argv[1],"message_thread_id":int(sys.argv[2]),
                  "text":sys.argv[3],"disable_web_page_preview":True}))
PY
)
  curl -sf -m 10 -X POST "https://api.telegram.org/bot${TG_DEV_BOT_TOKEN}/sendMessage" \
       -H 'Content-Type: application/json' -d "$body" >/dev/null 2>&1
}

# edge-triggered alert: only fires when $key transitions to a new state
edge() { # $1=key $2=state $3=text
  local prev; prev=$(grep "^$1=" "$STATE" 2>/dev/null | tail -1 | cut -d= -f2-)
  if [ "$prev" != "$2" ]; then
    _tg "$3"
    { grep -v "^$1=" "$STATE" 2>/dev/null; echo "$1=$2"; } > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
  fi
}

# 1) WireGuard handshake age (network truth)
now=$(date +%s)
hs=$(wg show wg0 latest-handshakes 2>/dev/null | grep -F "$NODE2_PEER" | awk '{print $2}')
if [ -z "$hs" ] || [ "$hs" = "0" ]; then
  edge wg down "🔴 Node 2: no WireGuard handshake on record — mesh peer down. — [fleet-watchdog]"
else
  age=$(( now - hs ))
  if [ "$age" -gt "$WG_STALE_S" ]; then
    edge wg down "🔴 Node 2: WG handshake ${age}s stale (>$((WG_STALE_S/60))m) — tunnel down, node off the mesh. — [fleet-watchdog]"
  else
    edge wg up "🟢 Node 2: WG handshake fresh (${age}s) — tunnel up. — [fleet-watchdog]"
  fi
fi

# 2) Real serving check: discover a served model, then actually infer
served=$(curl -sf -m 8 "$API/v1/models" 2>/dev/null | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print(""); sys.exit()
ms=[m.get("id") for m in d.get("data",[]) if (m.get("provider_count") or 0)>0]
print(ms[0] if ms else "")' 2>/dev/null)

if [ -z "$served" ]; then
  edge serve down "🔴 DCP serving DOWN: 0 of the catalog has an online provider — no inference is possible right now. — [fleet-watchdog]"
elif [ -z "${DCP_MONITOR_RENTER_KEY:-}" ]; then
  echo "[watchdog] served=$served but no DCP_MONITOR_RENTER_KEY; skipping inference probe" >&2
else
  code=$(curl -sf -m 60 -o /tmp/wd-inf.json -w '%{http_code}' -X POST "$API/v1/chat/completions" \
    -H "Authorization: Bearer ${DCP_MONITOR_RENTER_KEY}" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$served\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":4,\"temperature\":0,\"stream\":false}" 2>/dev/null)
  if [ "$code" = "200" ] && grep -q '"choices"' /tmp/wd-inf.json 2>/dev/null; then
    edge serve up "🟢 DCP serving OK: live inference on \`$served\` returned a completion. — [fleet-watchdog]"
  else
    edge serve down "🔴 DCP serving DOWN: inference on \`$served\` returned HTTP $code with no completion. — [fleet-watchdog]"
  fi
fi
