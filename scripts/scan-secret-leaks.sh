#!/usr/bin/env bash
# Guardrail: fail if a provider/renter key or Jupyter token is logged or put in a URL.
set -uo pipefail
cd "$(dirname "$0")/.." 2>/dev/null || cd .
RC=0
hit(){ echo "LEAK: $1"; RC=1; }

# 1) access_url (token-bearing) must never be console.log'd.
if grep -rnE 'console\.(log|error|warn)\([^)]*accessUrl' backend/src 2>/dev/null; then
  hit 'access_url (contains ?token=) logged in backend/src'
fi

# 2) Raw jupyter_token / root_password must not be logged.
if grep -rnE 'console\.(log|error|warn)\([^)]*(jupyter_token|root_password|jupyterToken|rootPassword)' backend/src 2>/dev/null; then
  hit 'jupyter_token/root_password logged in backend/src'
fi

# 3) Daemon: API_KEY slice in logs (API_KEY[:N]).
if grep -rnE 'API_KEY\[:[0-9]+\]' backend/installers/dcp_daemon.py 2>/dev/null; then
  hit 'API_KEY[:N] sliced into a daemon log line'
fi

# 4) DCP API_KEY placed in a URL query string (?key={API_KEY} / ?api_key={API_KEY}),
#    excluding third-party runpod calls which are not our keys.
if grep -rnE '(\?key=|\?api_key=)\{?API_KEY' backend/installers/dcp_daemon.py 2>/dev/null | grep -v 'runpod'; then
  hit 'DCP API_KEY placed in a URL query string'
fi

[[ $RC -eq 0 ]] && echo 'scan-secret-leaks: clean' || echo 'scan-secret-leaks: FAILURES above'
exit $RC
