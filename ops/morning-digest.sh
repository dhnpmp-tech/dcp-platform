#!/usr/bin/env bash
# DCP morning digest → Telegram topic 7 (Team Chat)
# Daily 06:00 UTC. Reads token from /root/dc1-platform/backend/.env so rotations
# don't require editing this file.
set -uo pipefail

# ---------- load env ---------------------------------------------------------
ENV_FILE="/root/dc1-platform/backend/.env"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

TG_TOKEN="${TG_DEV_BOT_TOKEN:?TG_DEV_BOT_TOKEN missing from $ENV_FILE}"
TG_CHAT="-1003773787353"
TG_TOPIC="7"
DB="/root/dc1-platform/backend/data/providers.db"
SMOKE_LOG="/var/log/e2e-smoke.log"
REPO_DIR="/root/dc1-platform"

NOW_UTC=$(date -u +"%a, %b %d · %H:%MZ")

# ---------- helpers ----------------------------------------------------------
q() { sqlite3 -separator '|' "$DB" "$@" 2>/dev/null; }
n() { local v="${1:-0}"; [ -z "$v" ] && echo "0" || echo "$v"; }

# ---------- 1. Top-line state -----------------------------------------------
PROV_ONLINE=$(n "$(q "SELECT COUNT(*) FROM providers WHERE COALESCE(deleted_at,'')='' AND COALESCE(approval_status,'pending')='approved' AND last_heartbeat IS NOT NULL AND (strftime('%s','now') - strftime('%s', last_heartbeat)) <= 600")")
PROV_TOTAL=$(n "$(q "SELECT COUNT(*) FROM providers WHERE COALESCE(deleted_at,'')='' AND COALESCE(approval_status,'pending')='approved'")")

# Distinguish synthetic heartbeats. Tareq Node 2 has the local-cron-keepalive
# masking its true state, so we cross-check with backend liveness verdict.
NODE2_VERIFIED=$(q "SELECT COALESCE(verified_online,'unknown') FROM providers WHERE id=1774351995321 LIMIT 1")
NODE2_VERIFIED="${NODE2_VERIFIED:-unknown}"

JOBS_18H=$(n "$(q "SELECT COUNT(*) FROM jobs WHERE created_at >= datetime('now','-18 hours')")")
JOBS_OK=$(n "$(q "SELECT COUNT(*) FROM jobs WHERE created_at >= datetime('now','-18 hours') AND status IN ('completed','done','succeeded')")")
JOBS_FAIL=$(n "$(q "SELECT COUNT(*) FROM jobs WHERE created_at >= datetime('now','-18 hours') AND status IN ('failed','error','timeout','cancelled')")")

if [ "$PROV_ONLINE" -ge 1 ] && [ "$NODE2_VERIFIED" = "1" ]; then
  VERDICT="[OK]      ${PROV_ONLINE}/${PROV_TOTAL} providers serving"
elif [ "$PROV_ONLINE" -ge 1 ]; then
  VERDICT="[DEGRADED] ${PROV_ONLINE}/${PROV_TOTAL} reporting heartbeats; backend-liveness verdict unconfirmed"
else
  VERDICT="[DEGRADED] ${PROV_ONLINE}/${PROV_TOTAL} providers serving — marketplace idle"
fi

# ---------- 2. Yesterday's wins (last 24h) ----------------------------------
( cd "$REPO_DIR" && git fetch -q origin 2>/dev/null )  # PR/commit counts reflect origin/main (merged), not the parked local checkout
COMMITS_24H=$(cd "$REPO_DIR" && git log origin/main --since="24 hours ago" --pretty=format:"%h %s" --no-merges 2>/dev/null | head -8)
PRS_MERGED=$(cd "$REPO_DIR" && git log origin/main --since="24 hours ago" --pretty=format:"%s" 2>/dev/null | grep -oE "#[0-9]+" | sort -u | tr '\n' ' ' | sed 's/  */, /g; s/, $//')
PR_COUNT=$(echo "$PRS_MERGED" | tr ',' '\n' | grep -c "#" || echo 0)

TASKS_CLOSED=$(n "$(q "SELECT COUNT(*) FROM mission_tasks WHERE status='done' AND completed_at >= datetime('now','-24 hours')")")
TASKS_CLOSED_SAMPLE=$(q "SELECT '  · ' || substr(title,1,90) FROM mission_tasks WHERE status='done' AND completed_at >= datetime('now','-24 hours') ORDER BY priority, completed_at DESC LIMIT 3")

# ---------- 3. Smoke tests: real failures, grouped --------------------------
# Skip dedupe-skip ACK lines. Bucket by (suite, http_code). Report the suite
# name, last seen, and consecutive-run count.
SMOKE_REPORT=""
SMOKE_FAIL_GROUPS=0
if [ -f "$SMOKE_LOG" ]; then
  CUTOFF=$(date -u -d '18 hours ago' '+%Y-%m-%dT%H:%M' 2>/dev/null || date -u -v-18H '+%Y-%m-%dT%H:%M')
  # Pull only real FAIL lines (not dedupe-skip), extract suite+http, count.
  SMOKE_REPORT=$(awk -v c="$CUTOFF" '
    /\[e2e-smoke / && / FAIL / && !/dedupe:/ {
      gsub(/[][]/,"",$2); ts=$2
      if (ts < c) next
      suite=$4; http=$5; gsub("http=","",http)
      key=suite "|" http
      cnt[key]++
      last[key]=ts
      next
    }
    END {
      for (k in cnt) printf "%s|%d|%s\n", k, cnt[k], last[k]
    }' "$SMOKE_LOG" 2>/dev/null | sort -t'|' -k3 -nr)
  SMOKE_FAIL_GROUPS=$(echo -n "$SMOKE_REPORT" | grep -c "|" || echo 0)
fi

if [ "$SMOKE_FAIL_GROUPS" -eq 0 ]; then
  SMOKE_BLOCK="  · all suites passing"
else
  SMOKE_BLOCK=$(echo "$SMOKE_REPORT" | awk -F'|' '{printf "  · %-18s %s × in 18h · http=%s\n", $1, $3, $2}')
fi

OK_18H=$(awk '/\[e2e-smoke / && / ok / && !/dedupe:/ {n++} END{print n+0}' "$SMOKE_LOG" 2>/dev/null)

# ---------- 4. Mission Control numbers --------------------------------------
MC_TODO=$(n "$(q "SELECT COUNT(*) FROM mission_tasks WHERE status='todo'")")
MC_INPROG=$(n "$(q "SELECT COUNT(*) FROM mission_tasks WHERE status='in_progress'")")
MC_BLOCKED=$(n "$(q "SELECT COUNT(*) FROM mission_tasks WHERE status='blocked'")")
MC_DONE=$(n "$(q "SELECT COUNT(*) FROM mission_tasks WHERE status='done'")")

BLOCKED_TOP=$(q "SELECT '  · [' || priority || '] ' || substr(title,1,80) FROM mission_tasks WHERE status='blocked' ORDER BY CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 ELSE 3 END, updated_at DESC LIMIT 4")

# ---------- 5. Synthetic-heartbeat caveat -----------------------------------
KEEPALIVE_NOTE=""
if [ -f /etc/cron.d/tareq-keepalive ]; then
  KEEPALIVE_NOTE="
Note: a synthetic-heartbeat cron is masking Node 2's true state in the
   heartbeat-only path. Use \`verified_online\` + backend liveness probe for
   real signal until Node 2 is back. (/etc/cron.d/tareq-keepalive)"
fi

# ---------- Compose ---------------------------------------------------------
PR_S=$([ "${PR_COUNT:-0}" = "1" ] || echo "s"); SMOKE_S=$([ "${SMOKE_FAIL_GROUPS:-0}" = "1" ] || echo "s"); TASKS_S=$([ "${TASKS_CLOSED:-0}" = "1" ] || echo "s")
MSG="DCP morning digest · ${NOW_UTC}
─────────────────────────────────

State of the platform
  ${VERDICT}
  Inference 18h: ${JOBS_18H} jobs (${JOBS_OK} ok / ${JOBS_FAIL} fail)
  Smoke suites: ${OK_18H} ok · ${SMOKE_FAIL_GROUPS} failing signature${SMOKE_S}

Yesterday's wins (24h)
  · ${PR_COUNT} PR${PR_S} merged${PRS_MERGED:+: ${PRS_MERGED}}
  · ${TASKS_CLOSED} mission task${TASKS_S} closed
${TASKS_CLOSED_SAMPLE}

Smoke tests · 18h
${SMOKE_BLOCK}

Open blockers (mission control)
${BLOCKED_TOP:-  · none}

Numbers
  Mission tasks: ${MC_TODO} todo · ${MC_INPROG} in progress · ${MC_BLOCKED} blocked · ${MC_DONE} done
${KEEPALIVE_NOTE}
─────────────────────────────────
api.dcp.sa · dcp.sa/mission · /var/log/morning-digest.log"

# Telegram hard cap 4096; leave headroom.
MSG=$(printf "%s" "$MSG" | head -c 3800)

RESP=$(curl -fsS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TG_CHAT}" \
  --data-urlencode "message_thread_id=${TG_TOPIC}" \
  --data-urlencode "text=${MSG}" \
  --data-urlencode "disable_web_page_preview=true" 2>&1)

echo "[$(date -u +%FT%TZ)] sent digest: $(printf "%s" "$RESP" | head -c 200)"
