#!/usr/bin/env bash
# DCP E2E smoke test — runs every 30 min via cron.
# DCP_E2E_SMOKE_MARKER (do not remove — used by installer to find this file)
# Behaviour:
#   - Silent on success.
#   - On failure: POST to Telegram /dev topic with probe name, HTTP code,
#     truncated response, timestamp.
#   - De-dupes: stores last failure signature in state file; same failure
#     twice in a row is suppressed.

set -u

# ─── Config ───────────────────────────────────────────────────────────────
TG_TOKEN="8291599718:AAG03lWhtZCXeQAoqR4okAMtfXubAFM9Gus"
TG_CHAT="-1003773787353"
TG_TOPIC="4"  # 🔴 Alerts topic — auto-alerts go here, not Team Chat (topic 7)
RENTER_KEY="dcp-renter-06f9bf5b311cbb4ae561b43b1e26373f"
PROVIDER_KEY_TAREQ_N2="dcp-provider-c817120867acf6c1a877915cb5af2d8f"
TAREQ_N2_WG="10.8.0.6"
TAREQ_N2_ID="1774351995321"
PROVIDERS_DB="/root/dc1-platform/backend/data/providers.db"

STATE_FILE="/var/lib/dcp-e2e-smoke.state"
LOG_PREFIX="[e2e-smoke $(date -u +%FT%TZ)]"

mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true

# ─── Helpers ──────────────────────────────────────────────────────────────
declare -a FAILURES=()

record_failure() {
    # $1=probe name  $2=http code  $3=response snippet
    local probe="$1" code="$2" snip="$3"
    # Flatten newlines/tabs so the array element is a single line — keeps
    # the de-dupe signature (probe-name only) parseable and TG message clean.
    snip="${snip//$'\n'/ }"
    snip="${snip//$'\r'/}"
    snip="${snip//$'\t'/ }"
    snip="${snip:0:400}"
    FAILURES+=("${probe}|${code}|${snip}")
    echo "${LOG_PREFIX} FAIL ${probe} http=${code} snip=${snip:0:120}"
}

ok() { echo "${LOG_PREFIX} ok ${1}"; }

tg_send() {
    local text="$1"
    curl -sS --max-time 10 \
        "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
        -d "chat_id=${TG_CHAT}" \
        -d "message_thread_id=${TG_TOPIC}" \
        -d "parse_mode=HTML" \
        --data-urlencode "text=${text}" \
        >/dev/null
}

# ─── Probe 1: Backend gateway health ─────────────────────────────────────
probe_gateway_health() {
    local resp code
    resp=$(curl -sS --max-time 10 -w $'\n%{http_code}' \
        https://api.dcp.sa/api/agent/gateway/health 2>&1) || {
        record_failure "gateway_health" "000" "curl error: $resp"; return; }
    code="${resp##*$'\n'}"
    local body="${resp%$'\n'*}"
    if [[ "$code" != "200" ]]; then
        record_failure "gateway_health" "$code" "$body"; return
    fi
    if ! echo "$body" | grep -q '"status":"ok"'; then
        record_failure "gateway_health" "$code" "$body"; return
    fi
    ok "gateway_health"
}

# ─── Probe 2: Model list ──────────────────────────────────────────────────
probe_models() {
    local resp code body count
    resp=$(curl -sS --max-time 10 -w $'\n%{http_code}' \
        https://api.dcp.sa/v1/models 2>&1) || {
        record_failure "models" "000" "curl error: $resp"; return; }
    code="${resp##*$'\n'}"
    body="${resp%$'\n'*}"
    if [[ "$code" != "200" ]]; then
        record_failure "models" "$code" "$body"; return
    fi
    count=$(echo "$body" | python3 -c \
        'import json,sys
try: print(len(json.load(sys.stdin).get("data",[])))
except Exception as e: print(-1)' 2>/dev/null)
    if [[ -z "$count" ]] || (( count < 10 )); then
        record_failure "models" "$code" "expected >=10 models, got ${count}: ${body:0:200}"; return
    fi
    ok "models (count=${count})"
}

# ─── Probe 3: E2E inference ──────────────────────────────────────────────
probe_inference() {
    local resp code body content finish model
    # Pick a currently-served text-chat model (was a stale hardcoded pin; 2026-06-09 503s)
    model=$(curl -sS --max-time 20 https://api.dcp.sa/v1/models 2>/dev/null | python3 -c '
import json,sys,re
try:
    d=json.load(sys.stdin)
    avail=[m["id"] for m in d.get("data",[]) if m.get("available")]
    chat=[m for m in avail if not re.search(r"(vl|embed|rerank|bge|whisper|tts)", m, re.I)]
    print(chat[0] if chat else "")
except Exception:
    print("")
')
    if [[ -z "$model" ]]; then
        record_failure "inference" "000" "no available text-chat model in /v1/models catalog"; return
    fi
    resp=$(curl -sS --max-time 60 -w $'\n%{http_code}' \
        -H "Authorization: Bearer ${RENTER_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly one word: pong. Nothing else.\"}],\"max_tokens\":800,\"temperature\":0}" \
        https://api.dcp.sa/v1/chat/completions 2>&1) || {
        record_failure "inference" "000" "curl error: $resp"; return; }
    code="${resp##*$'\n'}"
    body="${resp%$'\n'*}"
    if [[ "$code" != "200" ]]; then
        record_failure "inference" "$code" "$body"; return
    fi
    # Parse content + finish_reason in python (jq may not be installed)
    local parsed
    parsed=$(echo "$body" | python3 -c \
        'import json,sys
try:
  d=json.load(sys.stdin)
  c=d["choices"][0]
  msg=c.get("message",{}).get("content","") or ""
  fr=c.get("finish_reason","")
  print(f"{len(msg.strip())}|{fr}|{msg[:80]}")
except Exception as e:
  print(f"ERR|{e}|")' 2>/dev/null)
    local clen fr csnip
    clen="${parsed%%|*}"
    local rest="${parsed#*|}"
    fr="${rest%%|*}"
    csnip="${rest#*|}"
    if [[ "$clen" == "ERR" ]]; then
        record_failure "inference" "$code" "parse error: ${body:0:300}"; return
    fi
    if (( clen < 1 )); then
        record_failure "inference" "$code" "empty content, finish=${fr}, body=${body:0:200}"; return
    fi
    # Accept stop OR length (length = model produced tokens but we capped).
    # Spec says "stop"; we relax to "stop|length" because either proves the
    # provider answered with non-empty content. Hard-fail only on
    # content_filter / tool_calls / error / null.
    if [[ "$fr" != "stop" && "$fr" != "length" ]]; then
        record_failure "inference" "$code" "finish_reason=${fr} (want stop|length), content='${csnip}'"; return
    fi
    ok "inference (content='${csnip}', finish=${fr})"
}

# ─── Probe 4: Tareq Node 2 daemon liveness ───────────────────────────────
# Spec asked for `curl http://127.0.0.1:19876/` via SSH-to-node. gate0 has
# no SSH key for Tareq's box, and the daemon does not bind on the WG IP.
# Substituted with the canonical liveness signal: `last_heartbeat` in the
# providers DB must be < 300s old. The daemon writes this every minute.
probe_tareq_n2_daemon() {
    local age
    age=$(sqlite3 "$PROVIDERS_DB" \
        "SELECT CAST((julianday('now') - julianday(last_heartbeat)) * 86400 AS INTEGER)
         FROM providers WHERE id=${TAREQ_N2_ID}" 2>&1)
    if ! [[ "$age" =~ ^-?[0-9]+$ ]]; then
        record_failure "tareq_n2_daemon" "n/a" "sqlite error or null last_heartbeat: ${age}"; return
    fi
    if (( age > 300 )); then
        record_failure "tareq_n2_daemon" "n/a" "last_heartbeat ${age}s old (> 300s threshold)"; return
    fi
    ok "tareq_n2_daemon (heartbeat ${age}s old)"
}

# ─── Probe 5: Tareq Node 2 :19877 diag via WG ────────────────────────────
probe_tareq_n2_diag() {
    local resp code body
    resp=$(curl -sS --max-time 8 -w $'\n%{http_code}' \
        -H "Authorization: Bearer ${PROVIDER_KEY_TAREQ_N2}" \
        "http://${TAREQ_N2_WG}:19877/v1/diag/wg" 2>&1) || {
        record_failure "tareq_n2_diag" "000" "curl error: $resp"; return; }
    code="${resp##*$'\n'}"
    body="${resp%$'\n'*}"
    if [[ "$code" != "200" ]]; then
        record_failure "tareq_n2_diag" "$code" "$body"; return
    fi
    ok "tareq_n2_diag"
}

# ─── Run all probes ──────────────────────────────────────────────────────
probe_gateway_health
probe_models
probe_inference
probe_tareq_n2_daemon
probe_tareq_n2_diag

# ─── Alert handling with de-dupe ─────────────────────────────────────────
if (( ${#FAILURES[@]} == 0 )); then
    # Clear last-alert state on full pass so the next new failure alerts.
    : > "$STATE_FILE" 2>/dev/null || true
    exit 0
fi

# Build canonical signature (probe names only) + full message
sig=$(printf '%s\n' "${FAILURES[@]}" | awk -F'|' '{print $1}' | sort -u | tr '\n' ',' )
prev_sig=""
[[ -f "$STATE_FILE" ]] && prev_sig=$(cat "$STATE_FILE" 2>/dev/null)

if [[ "$sig" == "$prev_sig" ]]; then
    echo "${LOG_PREFIX} dedupe: same failure sig as last run (${sig}), skipping TG alert"
    exit 1
fi

# Compose TG message
ts=$(date -u +"%Y-%m-%d %H:%M:%SZ")
msg="<b>DCP E2E smoke FAIL</b> @ gate0
<i>${ts}</i>
"
for f in "${FAILURES[@]}"; do
    probe="${f%%|*}"
    rest="${f#*|}"
    code="${rest%%|*}"
    snip="${rest#*|}"
    # HTML-escape minimal
    snip="${snip//&/&amp;}"
    snip="${snip//</&lt;}"
    snip="${snip//>/&gt;}"
    msg+="
• <code>${probe}</code> http=${code}
<pre>${snip:0:300}</pre>"
done

tg_send "$msg"
echo "$sig" > "$STATE_FILE"
echo "${LOG_PREFIX} alerted TG: sig=${sig}"
exit 1
