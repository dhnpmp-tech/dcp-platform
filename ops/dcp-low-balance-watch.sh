#!/usr/bin/env bash
# dcp-low-balance-watch.sh
#
# Hourly proactive watch for renters near a 402 wall. Posts to the
# Alerts topic (4) of the DCP Nexus Group when any active renter dips
# below the LOW_BALANCE_SAR threshold. Direct response to the audit
# finding that "first signal is a 402, which is too late."
#
# Dedup: at most one alert per renter per UTC day, tracked in a flat
# state file at $STATE_DIR/lowbal-alerts.log. Prevents spam if a
# renter stays low all day.
#
# Test-account filter: renter emails matching obvious internal
# patterns (dcp.local, example.com, smoke fixtures) are excluded so
# ops doesn't get paged for synthetic accounts.

set -uo pipefail

DB="/root/dc1-platform/backend/data/providers.db"
STATE_DIR="/var/lib/dcp-monitor"
STATE_FILE="$STATE_DIR/lowbal-alerts.log"
LOG_FILE="/var/log/dcp-low-balance-watch.log"

TG_TOKEN="${TG_DEV_BOT_TOKEN:-}"
TG_CHAT="${TG_ALERT_CHAT_ID:-}"
TG_TOPIC="4"  # 🔴 Alerts topic (per memory feedback_auto_alerts_topic.md)

LOW_BALANCE_HALALA="${LOW_BALANCE_HALALA:-1000}"   # 10 SAR
TODAY="$(date -u +%F)"

mkdir -p "$STATE_DIR"
touch "$STATE_FILE"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG_FILE" ; }

# Synthetic / smoke / proof / dx-quickstart accounts we don't want to
# wake ops for. Tuned to current prod data (2026-05-21).
EXCLUDE_PATTERNS=(
  "%@dcp.local"
  "%@example.com"
  "inference-smoke%"
  "quickstart-smoke%"
  "paperclip-proof%"
  "sdk-audit%"
  "dx-quickstart%"
  "ceo-smoke%"
  "proof+%"
  "%@dcp.test"
)

# Build the WHERE-clause exclusion list.
exclude_sql=""
for pat in "${EXCLUDE_PATTERNS[@]}"; do
  exclude_sql+=" AND email NOT LIKE '${pat}'"
done

# Plus: explicit names obviously internal.
exclude_sql+=" AND name NOT LIKE 'CEO Smoke%' AND name NOT LIKE 'DCP Test Renter%' AND name NOT LIKE 'DCP Proof Bot%'"

# Read low-balance renters as TSV.
rows="$(sqlite3 -separator $'\t' "$DB" "
  SELECT id, name, email, balance_halala
    FROM renters
   WHERE status = 'active'
     AND balance_halala IS NOT NULL
     AND balance_halala < ${LOW_BALANCE_HALALA}
     ${exclude_sql}
   ORDER BY balance_halala ASC
")"

if [ -z "$rows" ]; then
  log "no qualifying low-balance renters (< ${LOW_BALANCE_HALALA} halala)"
  exit 0
fi

new_alerts=0
batch_text=""

while IFS=$'\t' read -r rid rname remail rbal; do
  [ -z "$rid" ] && continue
  state_key="${rid}:${TODAY}"
  if grep -qF "$state_key" "$STATE_FILE" 2>/dev/null; then
    log "dedup: already alerted ${rname} (id=${rid}) today"
    continue
  fi
  sar=$(awk -v h="$rbal" 'BEGIN { printf "%.2f", h/100 }')
  batch_text+=$'\n'"• ${rname} (id ${rid}, ${remail}) — ${sar} SAR (${rbal} halala)"
  echo "$state_key" >> "$STATE_FILE"
  new_alerts=$((new_alerts + 1))
done <<<"$rows"

if [ "$new_alerts" -eq 0 ]; then
  log "no NEW low-balance alerts to send (all already alerted today)"
  exit 0
fi

# Compose alert payload + send to Telegram topic 4.
msg="⚠️ Low-balance renter watch (auto)
${new_alerts} active renter(s) under ${LOW_BALANCE_HALALA} halala (10 SAR). First signal would otherwise be a 402.
${batch_text}

Threshold: balance_halala < ${LOW_BALANCE_HALALA}. Dedup: 1 alert per renter per UTC day.
Source: /usr/local/bin/dcp-low-balance-watch.sh on VPS, runs hourly."

# URL-encode via python (no jq dependency issues).
payload="$(python3 -c "
import json, sys
print(json.dumps({
  'chat_id': int('${TG_CHAT}'),
  'message_thread_id': int('${TG_TOPIC}'),
  'text': '''${msg}''',
  'disable_web_page_preview': True,
}))
")"

resp_code=$(curl -sS -m 10 --fail-with-body -o /tmp/lowbal-tg-resp.json -w '%{http_code}' \
  -H "Content-Type: application/json" \
  "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  --data "$payload" || echo "curl-failed")

if [ "$resp_code" = "200" ]; then
  log "alerted ${new_alerts} renter(s); HTTP 200"
else
  log "Telegram send FAILED (http=${resp_code}); body: $(head -c 300 /tmp/lowbal-tg-resp.json 2>/dev/null)"
  exit 1
fi
