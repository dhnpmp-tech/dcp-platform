#!/bin/bash
# dcp-deploy-watch.sh — Vercel frontend + api.dcp.sa backend deploy-health watcher.
#
# Why this exists: dcp.sa (the frontend) is Vercel-served and auto-deploys from
# `main` on every push. `next build` runs TypeScript type-check + ESLint on Vercel,
# so a single type error fails the build and blocks EVERY subsequent deploy
# silently — while the VPS backend (api.dcp.sa, pm2) stays green. The two surfaces
# are independent deploy planes, so backend smoke can be 100% healthy while the
# frontend has been broken for hours. This burned us 2026-07-01: Vercel errored
# on every deploy from c753f01 through #684 (hours), caught only when a human
# opened Vercel. This watcher makes that class of silent failure impossible.
#
# What it watches (edge-triggered — alerts only on state CHANGE, dedup via state file):
#   1. Vercel: latest Production deploy state. ERROR → 🔴 alert (once per deploy uid)
#      with the deploy URL + commit + the exact `vercel inspect` command to read logs.
#      A new READY deploy after an error → ✅ recovery. BUILDING/QUEUED >10min → 🟡 stuck.
#   2. Backend: https://api.dcp.sa/api/health. Non-200 for 2 consecutive polls → 🔴 alert;
#      200 after a down spell → ✅ recovery.
#
# Alerts go to Telegram topic 4 (🔴 Alerts), edge-triggered (only on state change),
# matching dcp-fleet-watchdog.sh conventions.
#
# Secrets come from /root/dc1-platform/ops/.watchdog-env (chmod 600), NOT this file:
#   TG_DEV_BOT_TOKEN=...        # @dcp_dev_bot token
#   TG_CHAT_ID=-1003773787353
#   TG_ALERT_TOPIC=4
#   VERCEL_TOKEN=...            # Vercel API bearer token (scoped to the project if possible)
#
# Install: */3 * * * * /root/dc1-platform/ops/dcp-deploy-watch.sh >> /var/log/dcp-deploy-watch.log 2>&1
set -uo pipefail

ENV_FILE="/root/dc1-platform/ops/.watchdog-env"
STATE_DIR="/var/lib/dcp-watch"
STATE_FILE="$STATE_DIR/state.json"
VERCEL_PROJECT_ID="prj_J9azwCgD666b52V0sz1q4XKCHa7W"
VERCEL_API="https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1&target=production"
BACKEND_HEALTH_URL="https://api.dcp.sa/api/health"
BACKEND_FAIL_THRESHOLD=2
STUCK_BUILD_SEC=600   # 10 min — a normal build is ~40s

# ── load secrets ──
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${TG_DEV_BOT_TOKEN:?missing TG_DEV_BOT_TOKEN in $ENV_FILE}"
: "${TG_CHAT_ID:?missing TG_CHAT_ID in $ENV_FILE}"
: "${TG_ALERT_TOPIC:?missing TG_ALERT_TOPIC in $ENV_FILE}"
: "${VERCEL_TOKEN:?missing VERCEL_TOKEN in $ENV_FILE}"

mkdir -p "$STATE_DIR"
# (re)init state if missing or corrupt — never let a bad state file crash the watcher
if ! jq -e . "$STATE_FILE" >/dev/null 2>&1; then
  echo '{"vercel":{"last_uid":"","last_state":"","alerted_error_uid":"","alerted_stuck_uid":""},"backend":{"state":"up","fail_count":0}}' > "$STATE_FILE"
fi

state_set() { # jq options + filter — writes atomically. Usage: state_set [--arg name val|--argjson name val]... 'filter'
  jq "$@" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

tg_alert() { # message text
  local msg="$1"
  curl -sS --max-time 15 "https://api.telegram.org/bot${TG_DEV_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TG_CHAT_ID}" -d "message_thread_id=${TG_ALERT_TOPIC}" \
    --data-urlencode "text=${msg}" >/dev/null 2>&1 || true
}

# ── Vercel frontend check ──
vercel_check() {
  local resp uid state url sha msg created_ms
  resp=$(curl -sS --max-time 20 -H "Authorization: Bearer ${VERCEL_TOKEN}" "$VERCEL_API" 2>/dev/null) || return 0
  # bail quietly on API error (auth, network) — don't spam; a persistent API outage
  # is a separate problem and we don't want false deploy-failure alerts from it
  if echo "$resp" | jq -e '.error' >/dev/null 2>&1; then return 0; fi

  uid=$(echo "$resp"   | jq -r '.deployments[0].uid // empty')
  state=$(echo "$resp" | jq -r '.deployments[0].state // empty')
  url=$(echo "$resp"   | jq -r '.deployments[0].url // empty')
  sha=$(echo "$resp"   | jq -r '.deployments[0].meta.githubCommitSha // "?"')
  msg=$(echo "$resp"   | jq -r '.deployments[0].meta.githubCommitMessage // "?"' | head -1)
  created_ms=$(echo "$resp" | jq -r '.deployments[0].createdAt // 0')
  [ -z "$uid" ] && return 0

  local short_sha=${sha:0:7}
  local prev_uid alerted_err alerted_stuck
  prev_uid=$(jq -r '.vercel.last_uid'        "$STATE_FILE")
  alerted_err=$(jq -r '.vercel.alerted_error_uid' "$STATE_FILE")
  alerted_stuck=$(jq -r '.vercel.alerted_stuck_uid' "$STATE_FILE")

  # new deploy appeared → reset per-deploy stuck tracker
  if [ "$uid" != "$prev_uid" ] && [ -n "$prev_uid" ]; then
    state_set '.vercel.alerted_stuck_uid = ""'
    alerted_stuck=""
  fi

  case "$state" in
    ERROR)
      if [ "$alerted_err" != "$uid" ]; then
        tg_alert "🔴 Vercel Production deploy ERROR
commit: ${short_sha} — ${msg}
url:   https://${url}
fix:   vercel inspect https://${url} --logs | tail -60
       (run locally; TS type errors + ESLint are the usual cause)"
        state_set --arg u "$uid" '.vercel.alerted_error_uid = $u'
      fi
      ;;
    READY)
      if [ -n "$alerted_err" ] && [ "$alerted_err" != "$uid" ]; then
        tg_alert "✅ Vercel recovered — Production deploy READY
commit: ${short_sha} — ${msg}
url:   https://${url}"
        state_set '.vercel.alerted_error_uid = ""'
      fi
      ;;
    BUILDING|QUEUED|INITIALIZING|CREATING)
      local now_sec created_sec elapsed
      now_sec=$(date +%s)
      created_sec=$(( created_ms / 1000 ))
      if [ "$created_sec" -gt 0 ]; then
        elapsed=$(( now_sec - created_sec ))
        if [ "$elapsed" -gt "$STUCK_BUILD_SEC" ] && [ "$alerted_stuck" != "$uid" ]; then
          tg_alert "🟡 Vercel build stuck >$(( STUCK_BUILD_SEC / 60 ))min
state: ${state}
commit: ${short_sha} — ${msg}
url:   https://${url}"
          state_set --arg u "$uid" '.vercel.alerted_stuck_uid = $u'
        fi
      fi
      ;;
    CANCELED)
      # not actionable for alerting; just record
      ;;
  esac

  state_set --arg u "$uid" --arg s "$state" '.vercel.last_uid = $u | .vercel.last_state = $s'
}

# ── Backend health check ──
backend_check() {
  local code bstate fcount
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BACKEND_HEALTH_URL" 2>/dev/null || echo 000)
  bstate=$(jq -r '.backend.state'      "$STATE_FILE")
  fcount=$(jq -r '.backend.fail_count' "$STATE_FILE")

  if [ "$code" = "200" ]; then
    if [ "$bstate" = "down" ]; then
      tg_alert "✅ Backend api.dcp.sa recovered — /api/health 200"
    fi
    state_set '.backend.state = "up" | .backend.fail_count = 0'
  else
    fcount=$(( fcount + 1 ))
    if [ "$fcount" -ge "$BACKEND_FAIL_THRESHOLD" ] && [ "$bstate" != "down" ]; then
      tg_alert "🔴 Backend api.dcp.sa down — /api/health returned ${code:-000} (after ${fcount} polls)
check: ssh root@76.13.179.86 'pm2 describe dc1-provider-onboarding; curl -s localhost:8083/api/health'"
      state_set --argjson c "$fcount" '.backend.state = "down" | .backend.fail_count = $c'
    else
      state_set --argjson c "$fcount" '.backend.fail_count = $c'
    fi
  fi
}

vercel_check
backend_check
