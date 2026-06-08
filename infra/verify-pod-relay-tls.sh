#!/usr/bin/env bash
# Smoke-test the HTTPS pod relay end to end on the VPS.
set -uo pipefail
FAIL=0
note(){ echo "[verify] $*"; }

# 1) socat must support OPENSSL (some minimal builds don't — OPENSSL-LISTEN fails silently otherwise).
if socat -V 2>&1 | grep -qi 'OPENSSL'; then note 'OK socat has OPENSSL'; else note 'FAIL socat lacks OPENSSL — apt-get install socat (full build)'; FAIL=1; fi

# 2) Relay env wired.
if pm2 env 0 2>/dev/null | grep -q 'DCP_RELAY_TLS=1'; then note 'OK DCP_RELAY_TLS=1 in pm2 env'; else note 'WARN DCP_RELAY_TLS not 1 — relay will serve http'; fi

# 3) Cert readable by the relay user (run as that user).
C="${DCP_RELAY_TLS_CERT:-/etc/dcp/pod-relay-tls/fullchain.pem}"
K="${DCP_RELAY_TLS_KEY:-/etc/dcp/pod-relay-tls/privkey.pem}"
if [[ -r "$C" && -r "$K" ]]; then note "OK cert+key readable ($C)"; else note "FAIL cert/key not readable by $(whoami)"; FAIL=1; fi

# 4) Dry-run the relay against a throwaway local listener to prove TLS terminates.
TESTPORT=8911; TESTJOB="verify-$(date +%s)"
python3 -m http.server "$TESTPORT" --bind 127.0.0.1 >/tmp/relay-verify-http.log 2>&1 &
HTTP_PID=$!
sleep 1
# pod-relay.sh's mesh guard requires 10.8/10.9 — add a temp loopback alias (10.8.255.254 passes the ^10\.(8|9)\. regex).
sudo ip addr add 10.8.255.254/32 dev lo 2>/dev/null || true
sudo socat TCP-LISTEN:9099,fork,reuseaddr,bind=10.8.255.254 TCP:127.0.0.1:$TESTPORT >/dev/null 2>&1 &
BRIDGE_PID=$!
sleep 1
OUT=$(DCP_RELAY_TLS=1 bash "$(dirname "$0")/../backend/scripts/pod-relay.sh" start "$TESTJOB" 10.8.255.254 9099 9099 2>/dev/null)
note "relay start → $OUT"
JPUB=$(echo "$OUT" | grep -oE '"jpub":[0-9]+' | grep -oE '[0-9]+')
SCHEME=$(echo "$OUT" | grep -oE '"scheme":"[a-z]+"' | cut -d'"' -f4)
if [[ "$SCHEME" == "https" ]]; then
  if curl -sk --max-time 5 "https://127.0.0.1:${JPUB}/" >/dev/null; then note 'OK https relay terminates TLS and forwards'; else note 'FAIL https relay did not answer'; FAIL=1; fi
else
  note 'WARN relay reported http (TLS not usable) — check cert readability'; FAIL=1
fi

# cleanup
bash "$(dirname "$0")/../backend/scripts/pod-relay.sh" stop "$TESTJOB" >/dev/null 2>&1 || true
kill "$HTTP_PID" "$BRIDGE_PID" 2>/dev/null || true
sudo ip addr del 10.8.255.254/32 dev lo 2>/dev/null || true

[[ $FAIL -eq 0 ]] && note 'ALL CHECKS PASSED' || note 'SOME CHECKS FAILED'
exit $FAIL
