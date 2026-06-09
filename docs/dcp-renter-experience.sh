#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DCP renter experience — rent a real GPU container, do anything, tear it down.
# Same flow three ways: CLI, raw API, website.  Self-contained. Just run it.
#   needs: bash, curl, python3, sshpass   (apt-get install -y sshpass)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
KEY="${DCP_RENTER_KEY:?set DCP_RENTER_KEY to a funded renter API key (never commit one)}"
API="https://api.dcp.sa/api"
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PreferredAuthentications=password -o PubkeyAuthentication=no -o ConnectTimeout=20"
jget(){ python3 -c "import sys,json;print(json.load(sys.stdin).get('$1') or '')"; }
port(){ grep -oE '[0-9]{3,}' | head -1; }   # the ssh port is the first long number

# Do REAL work inside the container: full GPU, torch compute, install anything.
in_pod(){ # $1=ssh_port  $2=root_password
  sshpass -p "$2" ssh $SSHO -p "$1" root@api.dcp.sa bash -s 2>/dev/null <<'POD'
echo "    whoami       : $(whoami)   (root — the whole box is yours)"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/    GPU          : /'
python3 - <<'PY'
import torch, time
print("    torch / CUDA :", torch.__version__, "/", torch.version.cuda, "->", torch.cuda.get_device_name(0))
n=4096; x=torch.randn(n,n,device="cuda",dtype=torch.float16)
for _ in range(5): x@x
torch.cuda.synchronize(); t=time.time()
for _ in range(100): x@x
torch.cuda.synchronize()
print("    compute      : %.1f TFLOPS fp16 (real matmul on the GPU)" % (2*n**3*100/(time.time()-t)/1e12))
PY
pip install -q cowsay 2>/dev/null && python3 -c 'import cowsay; cowsay.cow("I can install + run ANYTHING in here")' | sed 's/^/    /'
POD
}

echo "═════════════ 1) CLI — renter spins up a container ═════════════"
rm -rf /tmp/dcp && mkdir -p /tmp/dcp
curl -s "https://api.dcp.sa/installers/dc1-sdk.tar.gz" | tar xz -C /tmp/dcp   # the dcp CLI, stdlib-only
dcp(){ PYTHONPATH=/tmp/dcp python3 -m dc1.cli --base-url https://api.dcp.sa "$@"; }
export DCP_API_KEY="$KEY"
TOK=$(python3 -c "import secrets;print(secrets.token_hex(12))")
echo "  \$ dcp pod create --image pytorch --duration 20"
OUT=$(dcp pod create --image pytorch --duration 20 --token "$TOK" --timeout 300)
echo "$OUT" | sed 's/^/  /'
CID=$(echo "$OUT" | awk -F': *' '/^id:/{print $2}')
CPW=$(echo "$OUT" | awk -F': *' '/^root_password:/{print $2}')
CPORT=$(echo "$OUT" | grep -i ssh_command | port)
echo "  ── do something in it ──"
in_pod "$CPORT" "$CPW"
echo "  \$ dcp pod list";       dcp pod list | sed 's/^/  /'
echo "  \$ dcp pod stop $CID";  dcp pod stop "$CID" | sed 's/^/  /'
echo

echo "═════════════ 2) API — the exact same thing over raw HTTP ═════════════"
echo "  \$ curl -X POST $API/pods -d '{\"image\":\"pytorch\"}'"
C=$(curl -s -X POST "$API/pods" -H "x-renter-key: $KEY" -H 'content-type: application/json' \
       -d '{"image":"pytorch","duration_minutes":20}')
AID=$(echo "$C" | jget id); APW=$(echo "$C" | jget root_password)
echo "  created $AID — booting…"
for i in $(seq 1 60); do
  G=$(curl -s "$API/pods/$AID" -H "x-renter-key: $KEY")
  AS=$(echo "$G" | jget ssh_command); AU=$(echo "$G" | jget access_url)
  [ -n "$AS" ] && break; sleep 5
done
APORT=$(echo "$AS" | port)
echo "  Jupyter : $AU"
echo "  ssh     : $AS"
echo "  ── do something in it ──"
in_pod "$APORT" "$APW"
echo "  \$ curl -X DELETE $API/pods/$AID"
curl -s -X DELETE "$API/pods/$AID" -H "x-renter-key: $KEY" >/dev/null && echo "  stopped."
echo

echo "═════════════ 3) WEBSITE — same flow, point-and-click ═════════════"
echo "  https://dcp.sa/v2/renter/pods"
echo "  Pick image (PyTorch / vLLM / CUDA / Ubuntu / custom) → set duration →"
echo "  LAUNCH GPU POD → Jupyter opens in a tab → work → Stop."
echo
echo "DONE —  CLI ✓   API ✓   Website ✓"
