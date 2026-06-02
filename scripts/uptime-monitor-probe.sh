#!/usr/bin/env bash
set -u

# External uptime probe used by .github/workflows/uptime-monitor.yml.
# Writes GitHub step outputs when GITHUB_OUTPUT is set:
#   log, overall_ok, overall_status, has_warning

API_BASE="${DCP_API_BASE:-https://api.dcp.sa}"
FRONTEND_URL="${DCP_FRONTEND_URL:-https://dcp.sa/}"
SENTINEL_KEY="${SENTINEL_KEY:-${DCP_SENTINEL_RENTER_KEY:-}}"
FORCE_FAIL_VAR="${FORCE_FAIL_VAR:-}"
FORCE_FAIL_INPUT="${FORCE_FAIL_INPUT:-}"

PROBE_LOG="${PROBE_LOG:-$(mktemp)}"
OVERALL_OK=1
OVERALL_STATUS="ok"
HAS_WARNING=0
SENTINEL_WARN_REASON=""

force_fail="false"
if [ "${FORCE_FAIL_VAR:-}" = "true" ] || [ "${FORCE_FAIL_INPUT:-}" = "true" ]; then
  force_fail="true"
fi

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

mark_fail() {
  OVERALL_OK=0
  OVERALL_STATUS="fail"
}

mark_warn() {
  HAS_WARNING=1
  if [ "$OVERALL_STATUS" = "ok" ]; then
    OVERALL_STATUS="warn"
  fi
}

record_probe() {
  local name="$1"
  local status="$2"
  local code="$3"
  local latency="$4"
  local detail="${5:-}"

  case "$status" in
    fail) mark_fail ;;
    warn) mark_warn ;;
  esac

  echo "$name $status $code ${latency} ${detail}" >> "$PROBE_LOG"
}

probe() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local expect_substr="${4:-}"
  local body_file="${5:-}"
  shift 5 || true
  local extra_curl=("$@")

  if [ "$force_fail" = "true" ] && [ "$name" = "api_models" ]; then
    url="${API_BASE}/__forced_404_for_drill__"
  fi

  local own_body_file=0
  if [ -z "$body_file" ]; then
    body_file="$(mktemp)"
    own_body_file=1
  fi

  local start_ms end_ms latency code status detail
  start_ms=$(now_ms)
  code=$(curl -sS -m 15 -o "$body_file" -w "%{http_code}" \
    -X "$method" ${extra_curl[@]+"${extra_curl[@]}"} "$url" || echo "000")
  end_ms=$(now_ms)
  latency=$(( end_ms - start_ms ))

  status="ok"
  detail=""
  case "$code" in
    2*) ;;
    *) status="fail"; detail="http=$code" ;;
  esac

  if [ "$status" = "ok" ] && [ -n "$expect_substr" ]; then
    if ! grep -q -- "$expect_substr" "$body_file" 2>/dev/null; then
      status="fail"
      detail="missing_substr=$expect_substr"
    fi
  fi

  record_probe "$name" "$status" "$code" "$latency" "$detail"

  if [ "$own_body_file" = "1" ]; then
    rm -f "$body_file"
  fi
}

models_body="$(mktemp)"

# 3.1 api.dcp.sa /v1/models (no auth required)
probe "api_models" \
  "${API_BASE}/v1/models" \
  "GET" \
  '"object":"list"' \
  "$models_body"

# 3.2 dcp.sa frontend
probe "frontend_root" \
  "$FRONTEND_URL" \
  "GET" \
  "" \
  ""

# 3.4 sentinel inference (provider mesh health)
if [ -z "${SENTINEL_KEY:-}" ]; then
  SENTINEL_WARN_REASON="no_sentinel_key_configured"
  record_probe "sentinel_chat" "warn" "000" "0" "$SENTINEL_WARN_REASON"
else
  sentinel_model="$(jq -r '
    [.data[]? | select(((.provider_count // 0) | tonumber? // 0) >= 1) | .id][0] // empty
  ' "$models_body" 2>/dev/null || true)"

  if [ -z "$sentinel_model" ]; then
    SENTINEL_WARN_REASON="no_model_with_provider_count_ge_1"
    record_probe "sentinel_chat" "warn" "000" "0" "$SENTINEL_WARN_REASON"
  else
    body="$(jq -nc --arg model "$sentinel_model" '{
      model: $model,
      messages: [{role:"user", content:"ping"}],
      max_tokens: 4,
      stream: false
    }')"
    sentinel_body="$(mktemp)"
    probe "sentinel_chat" \
      "${API_BASE}/v1/chat/completions" \
      "POST" \
      '"choices"' \
      "$sentinel_body" \
      -H "Authorization: Bearer ${SENTINEL_KEY}" \
      -H "Content-Type: application/json" \
      --data "$body"
    rm -f "$sentinel_body"
    echo "sentinel_model ok 000 0 model=${sentinel_model}" >> "$PROBE_LOG"
  fi
fi

rm -f "$models_body"

echo "=== probe log ==="
cat "$PROBE_LOG"
echo "=== end ==="

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "log<<EOF"
    cat "$PROBE_LOG"
    echo "EOF"
    echo "overall_ok=$OVERALL_OK"
    echo "overall_status=$OVERALL_STATUS"
    echo "has_warning=$HAS_WARNING"
    echo "sentinel_warn_reason=$SENTINEL_WARN_REASON"
  } >> "$GITHUB_OUTPUT"
fi
