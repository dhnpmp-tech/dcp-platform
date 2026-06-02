#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"

write_fake_curl() {
  local mode="$1"
  cat > "$TMP/bin/curl" <<EOF
#!/usr/bin/env bash
set -euo pipefail
mode="$mode"
out=""
method="GET"
url=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in
    -o) out="\$2"; shift 2 ;;
    -X) method="\$2"; shift 2 ;;
    -w|-m|-H|--data) shift 2 ;;
    -sS) shift ;;
    *) url="\$1"; shift ;;
  esac
done

case "\$url" in
  */v1/models)
    if [ "\$mode" = "no_providers" ]; then
      printf '{"object":"list","data":[{"id":"ALLaM-AI/ALLaM-7B-Instruct-preview","provider_count":0}]}' > "\$out"
    else
      printf '{"object":"list","data":[{"id":"dead-model","provider_count":0},{"id":"qwen2.5vl:3b","provider_count":2}]}' > "\$out"
    fi
    printf '200'
    ;;
  */v1/chat/completions)
    printf '{"choices":[{"message":{"content":"ok"}}]}' > "\$out"
    printf '200'
    ;;
  https://dcp.sa/)
    printf '<html>DCP</html>' > "\$out"
    printf '200'
    ;;
  *)
    printf 'not found' > "\$out"
    printf '404'
    ;;
esac
EOF
  chmod +x "$TMP/bin/curl"
}

run_probe() {
  local mode="$1"
  local key="${2:-}"
  write_fake_curl "$mode"
  local output="$TMP/out"
  local stdout="$TMP/stdout"
  : > "$output"
  PATH="$TMP/bin:$PATH" \
    DCP_API_BASE="https://api.dcp.sa" \
    DCP_FRONTEND_URL="https://dcp.sa/" \
    SENTINEL_KEY="$key" \
    GITHUB_OUTPUT="$output" \
    bash "$ROOT/scripts/uptime-monitor-probe.sh" > "$stdout"
  cat "$output"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if ! grep -Fq "$needle" <<< "$haystack"; then
    echo "Expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

out="$(run_probe ok dcp-renter-test)"
assert_contains "$out" "overall_status=ok"
assert_contains "$out" "has_warning=0"
assert_contains "$out" "sentinel_model ok 000 0 model=qwen2.5vl:3b"

out="$(run_probe ok '')"
assert_contains "$out" "overall_status=warn"
assert_contains "$out" "overall_ok=1"
assert_contains "$out" "sentinel_chat warn 000 0 no_sentinel_key_configured"

out="$(run_probe no_providers dcp-renter-test)"
assert_contains "$out" "overall_status=warn"
assert_contains "$out" "sentinel_chat warn 000 0 no_model_with_provider_count_ge_1"

echo "uptime-monitor-probe tests passed"
