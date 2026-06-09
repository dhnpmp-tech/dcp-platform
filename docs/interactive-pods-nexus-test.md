# Interactive GPU Pods — Nexus Verification Runbook

**What this proves:** a renter can launch a real GPU pod (Jupyter + SSH) on a DCP
provider via the public API, reach it from the open internet, and tear it down —
with the provider's GPU automatically freed from idle inference first.

All steps are the **renter's-eye view** — no provider/SSH access needed. Run from
anywhere that can reach `api.dcp.sa` (the VPS works).

## Prereqs
- Funded test renter key: `dc1-renter-<REDACTED-ROTATED>`
- `sshpass` for the SSH step: `apt-get install -y sshpass` (optional; Jupyter step needs nothing extra)

## One-shot test script

```bash
cat > /tmp/nexus_pod_test.sh <<'SCRIPT'
#!/usr/bin/env bash
set -uo pipefail
API="https://api.dcp.sa/api"
RKEY="dc1-renter-<REDACTED-ROTATED>"

echo "== 1. CREATE pod =="
# image is optional — omitted here defaults to the pre-baked "pytorch" image.
# Swap in "vllm"|"cuda"|"ubuntu" (aliases) or any Docker ref to test other images.
C=$(curl -s -X POST "$API/pods" -H "x-renter-key: $RKEY" -H 'content-type: application/json' -d '{"gpu_count":1}')
echo "$C"
PID=$(echo "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
PW=$(echo  "$C" | python3 -c "import sys,json;print(json.load(sys.stdin)['root_password'])")
[ -z "$PID" ] && { echo "FAIL: no pod id (no Docker+CUDA provider online?)"; exit 1; }

echo "== 2. POLL until access_url (≤180s) =="
ACCESS=""; SSHCMD=""
for i in $(seq 1 36); do
  G=$(curl -s "$API/pods/$PID" -H "x-renter-key: $RKEY")
  ST=$(echo "$G" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
  AU=$(echo "$G" | python3 -c "import sys,json;v=json.load(sys.stdin).get('access_url');print(v or '')")
  echo "  t=$((i*5))s status=$ST url=${AU:-<none>}"
  [ -n "$AU" ] && { ACCESS="$AU"; SSHCMD=$(echo "$G" | python3 -c "import sys,json;print(json.load(sys.stdin).get('ssh_command') or '')"); break; }
  [ "$ST" = "failed" ] && { echo "FAIL: pod failed"; exit 1; }
  sleep 5
done
[ -z "$ACCESS" ] && { echo "FAIL: no access_url in 180s"; exit 1; }

echo "== 3. Jupyter reachable from internet =="
echo "  access_url=$ACCESS"
echo "  HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$ACCESS")  (200/302 = PASS)"

echo "== 4. SSH into pod, nvidia-smi (needs sshpass) =="
if command -v sshpass >/dev/null; then
  SPORT=$(echo "$SSHCMD" | sed -E 's/.*-p ([0-9]+).*/\1/')
  sshpass -p "$PW" ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password \
    -o PubkeyAuthentication=no -o ConnectTimeout=15 -p "$SPORT" root@api.dcp.sa \
    'whoami; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader' 2>&1 | sed 's/^/    /'
else echo "  (skip — sshpass not installed)"; fi

echo "== 5. STOP pod =="
curl -s -X DELETE "$API/pods/$PID" -H "x-renter-key: $RKEY" >/dev/null && echo "  deleted $PID"
SCRIPT
bash /tmp/nexus_pod_test.sh
```

## Expected output (PASS)
```
== 1. CREATE pod ==
{"id":"pod-…","status":"starting","provider_id":1774351995321,"root_password":"…","jupyter_token":"…"}
== 2. POLL until access_url ==
  …status=running url=http://api.dcp.sa:4100x/?token=…
== 3. Jupyter reachable from internet ==
  HTTP 302  (200/302 = PASS)
== 4. SSH into pod, nvidia-smi ==
    root
    NVIDIA GeForce RTX 3090, 24576 MiB
== 5. STOP pod ==
  deleted pod-…
```

## What each step verifies
| Step | Proves |
|---|---|
| 1 CREATE | renter-auth, `interactive_pod` job on the job rails, HMAC-signed, pinned to a **Docker+CUDA-capable** provider only (Apple-Silicon/non-CUDA providers are excluded). Honors the optional **`image`** field — a friendly alias (`pytorch`\|`vllm`\|`cuda`\|`ubuntu`) → pre-baked `dcp-compute:<alias>` (native sshd, fast start), or any other valid Docker ref → arbitrary image with daemon-injected sshd (`bootstrap_ssh=true`). Omitted → `pytorch`. |
| 2 POLL | daemon picked up the job, **evicted idle inference to free the GPU** (make-room), `docker run`, health-checked Jupyter, registered the public socat relay |
| 3 Jupyter | gateway relay (VPS:41xxx → provider mesh IP over WireGuard) serves the pod to the open internet |
| 4 SSH | gateway relay (VPS:42xxx → pod :22), root shell, GPU passthrough (`nvidia-smi` sees the real 3090) |
| 5 STOP | DELETE → daemon hold-loop + reaper `docker rm -f` (container gone in ≤~15s) |

## CLI equivalent (same thing, via the SDK)
```bash
# --image is optional (defaults to pytorch). Use an alias or any Docker ref.
dcp pod create --duration 60 --token <strong-token> --base-url https://api.dcp.sa          # default pytorch image
dcp pod create --duration 60 --token <strong-token> --image vllm --base-url https://api.dcp.sa            # pre-baked alias
dcp pod create --duration 60 --token <strong-token> --image ghcr.io/org/repo:tag --base-url https://api.dcp.sa   # arbitrary image
dcp pod list   --base-url https://api.dcp.sa
dcp pod get    <id> --base-url https://api.dcp.sa
dcp pod stop   <id> --base-url https://api.dcp.sa
```
`dcp pod create` prints id, Jupyter token, ssh root password, access_url, ssh_command.

> For the full renter-facing walkthrough (CLI, web `/renter/pods`, raw API, picking
> images, SSHing in, and a HF download-and-train example) see
> [`renter-quickstart.md`](renter-quickstart.md).

## Provider-side proof (optional, needs Node 2 access)
While a pod runs, on the provider you can confirm the make-room + container:
```bash
journalctl --user -u dcp-provider -n 200 | grep -E "free_gpu_for_pod|Executing job|freed GPU"
docker ps --filter name=dcp-pod-
```
Expect: `free_gpu_for_pod: evicting N idle Ollama model(s)` → `VRAM X -> Y MiB` (Y ≥ 4000)
→ `freed GPU` → `Executing job`, and a `dcp-pod-…` container `Up`.
