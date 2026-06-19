#!/usr/bin/env python3
"""DCP burst pod launcher — RunPod-backed, vendor-invisible, reverse-SSH relayed.
Mirrors a Node-2 interactive pod: inline Jupyter+sshd, reverse tunnel out to the VPS,
TLS relay on api.dcp.sa, heartbeat for observability. Subcommands: launch / teardown.

--job-id <id> on launch wires the (slow, blocking) launch into the DCP backend job
row: on success it flips the job to running with access_url/ssh_command/started_at/
timeout_at/burst_external_id/pod_jpub/pod_spub; on failure it marks the job failed,
refunds the renter (once), and tears down any orphan external pod. The backend
spawns this DETACHED so the renter's HTTP request returns immediately.

WORKSPACE PERSISTENCE (portable tier, matches NATIVE mc-mirror semantics)
─────────────────────────────────────────────────────────────────────────────
The backend (pods.js) puts a portable `workspace_s3` block in a burst job's
HMAC-signed task_spec when the renter has rented a volume (per-renter MinIO bucket
dcp-vol-r<id> on Node-2 10.8.0.6:9000, in-Kingdom over WireGuard). The burst pod
itself CANNOT reach that WG IP, so — unlike native, which runs `mc mirror` in-pod —
we drive the sync VPS-SIDE over the already-established reverse-SSH tunnel:

  RESTORE on launch  : mc cat s3/<bucket>/workspace.tar.gz
                       | sshpass ssh -p <sloop> root@127.0.0.1 'tar -C /workspace -xzf -'
  SNAPSHOT on stop   : sshpass ssh -p <sloop> root@127.0.0.1 'tar -C /workspace -czf - .'
                       | mc pipe s3/<bucket>/workspace.tar.gz

The VPS reaches MinIO in ~1s; the pod is reached on the VPS loopback port the pod
reverse-forwarded (sloop) using the pod's root password (rpw). Secrets (S3 key/
secret, rpw) NEVER go on argv: S3 creds ride mc's MC_HOST_<alias> env, rpw rides
sshpass's SSHPASS env. First launch (no object yet) is a no-op restore."""
import sys, json, time, os, subprocess, secrets, sqlite3, urllib.request, urllib.error

def _read_key():
    """RunPod API key — never hardcoded in the repo. Read from RUNPOD_API_KEY
    or the sidecar /root/.dcp_runpod_key (mode 600), same pattern as TUNNEL_KEY
    below. Covers every spawn path: backend, reap/extend cron, interactive."""
    k = os.environ.get("RUNPOD_API_KEY", "").strip()
    if k:
        return k
    try:
        return open(os.environ.get("DCP_RUNPOD_KEY_FILE", "/root/.dcp_runpod_key")).read().strip()
    except Exception:
        return ""

KEY = _read_key()
VPS = "76.13.179.86"
TUNNEL_KEY = open("/root/.ssh/dcp_burst_tunnel").read().strip()
CERT = "/etc/letsencrypt/live/api.dcp.sa/fullchain.pem"
CKEY = "/etc/letsencrypt/live/api.dcp.sa/privkey.pem"
# Pre-loaded RunPod base: ships JupyterLab 4.1.3 + openssh-server/-client + curl
# + pip preinstalled (verified by throwaway probe 2026-06-18), so the in-pod init
# skips the ~1-2 min apt-get+pip boot install. Same ~7.1GB pull as the old base,
# CUDA 12.1.1 / Ubuntu 22.04. NAME never surfaces to the renter (scrubbed in-pod).
# This torch (2.2.1 / cu121) has NO Blackwell kernels — torch.cuda fails on
# sm_120 (RTX PRO 4500/6000 Blackwell) and sm_100 (B200). Those types must use
# the Blackwell image below instead.
IMAGE = "runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04"
# Blackwell-capable base for sm_120 / sm_100 cards: CUDA 12.8.1 + torch 2.8.0
# built with cu128 kernels (verified existing tag on Docker Hub 2026-06-19,
# 11.69GB stable, ships python3 + jupyter + sshd + curl so the inline entrypoint
# below runs unchanged; the entrypoint also self-heals any missing binary).
BLACKWELL_IMAGE = "runpod/pytorch:1.0.6-cu1281-torch280-ubuntu2204"
# RunPod gpuTypes.id substrings (lowercased) that are Blackwell and therefore
# REQUIRE the cu128 image. Matched as a case-insensitive substring of the
# burst_gpu_type_id passed to launch(), so any future "... Blackwell ..." /
# "B200" verbatim id resolves automatically.
BLACKWELL_NEEDLES = ("blackwell", "b200", "rtx pro 6000", "rtx pro 4500")
DB_PATH = os.environ.get("DC1_DB_PATH", "/root/dc1-platform/backend/data/providers.db")

# Where the pod's reverse-SSH tunnel terminates on the VPS: the pod forwards its
# own :22 to 127.0.0.1:<sloop> on the VPS, so we reach the pod over loopback.
TUNNEL_HOST = "127.0.0.1"
# Object key inside the renter's bucket that holds the /workspace snapshot. Same
# name native uses, so a renter's volume is interchangeable between burst/native.
WORKSPACE_OBJECT = "workspace.tar.gz"
# Hard cap on the VPS-side snapshot pipeline so a hung pod/tunnel can never wedge
# a teardown indefinitely (teardown is detached, but the reaper also calls it).
SNAPSHOT_TIMEOUT_S = 300
RESTORE_TIMEOUT_S = 300


def image_for_gpu(gpu):
    """Pick the container image for a RunPod gpuTypes.id. Blackwell cards
    (sm_120/sm_100) need a cu128 torch; everything else keeps the fast cu121
    base. Substring match keeps it robust to vendor suffixes."""
    g = str(gpu or "").lower()
    if any(n in g for n in BLACKWELL_NEEDLES):
        return BLACKWELL_IMAGE
    return IMAGE

def is_blackwell(gpu):
    g = str(gpu or "").lower()
    return any(n in g for n in BLACKWELL_NEEDLES)

def rp(method, path, body=None):
    req = urllib.request.Request("https://rest.runpod.io/v1"+path,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json",
                 "User-Agent":"dcp-burst/1.0"}, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=30); return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"runpod {method} {path} -> {e.code}: {e.read().decode()[:200]}")

def gql(query, variables=None):
    """RunPod GraphQL (api.runpod.io). Used for two things REST can't do:
    (1) live per-DC secure-cloud availability so we steer a create to a DC that
    actually has the card right now, and (2) deploying gpuTypes that exist in
    GraphQL but are absent from the REST PodCreateInput.gpuTypeIds enum (e.g.
    'NVIDIA RTX PRO 4500 Blackwell'). Raises SystemExit with the body on error so
    the launch fail+refund path captures the real RunPod message."""
    body = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request("https://api.runpod.io/graphql",
        data=json.dumps(body).encode(),
        headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json",
                 "User-Agent":"dcp-burst/1.0"}, method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=40); out = json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"runpod graphql -> {e.code}: {e.read().decode()[:300]}")
    if out.get("errors"):
        raise SystemExit("runpod graphql errors: " + json.dumps(out["errors"])[:300])
    return out.get("data", {})

# RunPod REST PodCreateInput.dataCenterIds is an ENUM (NOT free-form): a create
# that names a DC outside this set is HTTP-400-rejected before scheduling. Some
# DCs that GraphQL availability reports for a card (e.g. US-MO-2/US-NE-1/US-PA-1/
# US-NC-2 for PRO6000) are NOT in this enum, so we must intersect availability
# against it before steering a REST create. Sourced from rest.runpod.io
# /v1/openapi.json (verified 2026-06-20, 28 entries).
REST_DC_ENUM = {
    "EU-RO-1","CA-MTL-1","EU-SE-1","US-IL-1","EUR-IS-1","EU-CZ-1","US-TX-3",
    "EUR-IS-2","US-KS-2","US-GA-2","US-WA-1","US-TX-1","CA-MTL-3","EU-NL-1",
    "US-TX-4","US-CA-2","US-NC-1","OC-AU-1","US-DE-1","EUR-IS-3","CA-MTL-2",
    "AP-JP-1","EUR-NO-1","EU-FR-1","US-KS-3","US-GA-1","AP-IN-1","US-MD-1",
}

# RunPod REST PodCreateInput.gpuTypeIds is ALSO an enum (49 entries, verified
# 2026-06-20). A gpuTypes.id that is a valid GraphQL id but absent here (the
# RTX PRO 4500 Blackwell, today) is HTTP-400-rejected by REST /v1/pods and MUST
# be deployed through the GraphQL podFindAndDeployOnDemand mutation instead.
REST_GPU_ENUM = {
    "NVIDIA A100 80GB PCIe","NVIDIA A100-SXM4-80GB","NVIDIA A100-SXM4-40GB",
    "NVIDIA A30","NVIDIA A40","NVIDIA B200","NVIDIA GeForce RTX 3070",
    "NVIDIA GeForce RTX 3080","NVIDIA GeForce RTX 3080 Ti","NVIDIA GeForce RTX 3090",
    "NVIDIA GeForce RTX 3090 Ti","NVIDIA GeForce RTX 4070 Ti","NVIDIA GeForce RTX 4080",
    "NVIDIA GeForce RTX 4080 SUPER","NVIDIA GeForce RTX 4090","NVIDIA GeForce RTX 5080",
    "NVIDIA GeForce RTX 5090","NVIDIA H100 80GB HBM3","NVIDIA H100 NVL",
    "NVIDIA H100 PCIe","NVIDIA H200","NVIDIA L4","NVIDIA L40","NVIDIA L40S",
    "NVIDIA RTX 2000 Ada Generation","NVIDIA RTX 4000 Ada Generation",
    "NVIDIA RTX 4000 SFF Ada Generation","NVIDIA RTX 5000 Ada Generation",
    "NVIDIA RTX 6000 Ada Generation","NVIDIA RTX A2000","NVIDIA RTX A4000",
    "NVIDIA RTX A4500","NVIDIA RTX A5000","NVIDIA RTX A6000",
    "NVIDIA RTX PRO 6000 Blackwell Server Edition",
}

# Probe the same per-DC availability the console reads. We do NOT trust a static
# list: stock for the Blackwell cards is mostly "Low" and a DC that had a machine
# a minute ago may not now, which is exactly what produced the original HTTP-500
# "machine does not have the resources to deploy". stock_rank lets us try the
# fullest DC first.
_STOCK_RANK = {"High": 0, "Medium": 1, "Low": 2}

def datacenters_for(gpu):
    """Return DCs that have `gpu` available in SECURE cloud RIGHT NOW, best-stock
    first. Two lists: `rest_ok` (intersected with the REST dataCenterIds enum, so
    they can be passed to REST /v1/pods) and `all_avail` (every available DC,
    used by the GraphQL deploy path which has no DC enum). Best-effort: on any
    GraphQL hiccup returns ([],[]) and the caller falls back to no-DC steering."""
    try:
        data = gql("query{dataCenters{id gpuAvailability(input:{gpuCount:1,"
                   "secureCloud:true}){gpuTypeId available stockStatus}}}")
    except SystemExit as e:
        sys.stderr.write(f"datacenters_for warn: {e}\n")
        return [], []
    rows = []
    for dc in (data.get("dataCenters") or []):
        for ga in (dc.get("gpuAvailability") or []):
            if ga.get("gpuTypeId") == gpu and ga.get("available"):
                rows.append((dc["id"], ga.get("stockStatus") or "Low"))
    rows.sort(key=lambda r: _STOCK_RANK.get(r[1], 3))
    all_avail = [dc for dc, _ in rows]
    rest_ok = [dc for dc in all_avail if dc in REST_DC_ENUM]
    return rest_ok, all_avail

# ── DB helpers (only used when --job-id is supplied) ──────────────────────────
def _db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.execute("PRAGMA busy_timeout=15000")
    return conn

def job_credentials(job_id):
    """Return (jupyter_token, root_password, max_duration_seconds, workspace_s3)
    from the job's HMAC-signed task_spec so the access_url we publish matches what
    the backend handed the renter at launch, and so the VPS-side workspace sync
    uses the SAME per-renter bucket + S3 creds the backend signed in.

    workspace_s3 is None for an ephemeral/free-tier burst pod (no rented volume).
    Falls back to fresh secrets + no-workspace_s3 if the row is unreadable."""
    try:
        conn = _db()
        row = conn.execute(
            "SELECT task_spec, max_duration_seconds FROM jobs WHERE job_id=?", (job_id,)
        ).fetchone()
        conn.close()
        if row:
            spec = json.loads(row[0] or "{}")
            return (spec.get("jupyter_token"), spec.get("root_password"),
                    int(row[1] or 21600), spec.get("workspace_s3"))
    except Exception as e:
        sys.stderr.write(f"job_credentials warn: {e}\n")
    return (None, None, 21600, None)

def job_success(job_id, out, dur_s):
    """Flip the job row to running with access details. timeout_at is started_at +
    duration so the backend's enforceJobTimeouts completes the pod on schedule."""
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    timeout_at = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time()+dur_s))
    conn = _db()
    try:
        conn.execute(
            """UPDATE jobs SET status='running', access_url=?, ssh_command=?,
                 started_at=COALESCE(started_at, ?), timeout_at=?,
                 burst_external_id=?, pod_jpub=?, pod_spub=?, progress_phase='serving',
                 progress_updated_at=?
               WHERE job_id=? AND status IN ('pulling','queued','assigned')""",
            (out["access_url"], out["ssh_command"], now, timeout_at,
             str(out["podid"]), int(out["jpub"]), int(out["spub"]), now, job_id))
        conn.commit()
    finally:
        conn.close()

def job_fail(job_id, reason):
    """Mark the job failed and refund the renter ONCE. Mirrors the backend's
    timeout-refund: balance_halala += cost_halala, refunded_at stamped."""
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    conn = _db()
    try:
        row = conn.execute(
            "SELECT id, renter_id, cost_halala, refunded_at, status FROM jobs WHERE job_id=?",
            (job_id,)).fetchone()
        if not row:
            return
        jid, renter_id, cost_halala, refunded_at, status = row
        if status in ("completed", "failed", "stopped", "cancelled"):
            return
        conn.execute(
            "UPDATE jobs SET status='failed', error=?, completed_at=? WHERE id=?",
            (reason, now, jid))
        if renter_id and cost_halala and not refunded_at:
            conn.execute(
                "UPDATE renters SET balance_halala = balance_halala + ? WHERE id=?",
                (cost_halala, renter_id))
            conn.execute("UPDATE jobs SET refunded_at=? WHERE id=?", (now, jid))
        conn.commit()
        sys.stderr.write(f"job_fail: {job_id} -> failed, refunded {cost_halala} halala\n")
    finally:
        conn.close()

# ── Workspace persistence (VPS-side sync over the reverse-SSH tunnel) ─────────
def _mc_host_env(ws):
    """Build the process env that lets `mc` reach the renter's MinIO bucket
    WITHOUT secrets on argv: mc honours MC_HOST_<alias>=scheme://KEY:SECRET@host.
    Returns (env, alias) or (None, None) when the workspace_s3 block is unusable."""
    if not ws:
        return None, None
    endpoint = str(ws.get("endpoint") or "").strip()
    bucket = str(ws.get("bucket") or "").strip()
    ak = str(ws.get("access_key") or "").strip()
    sk = str(ws.get("secret_key") or "").strip()
    if not (endpoint and bucket and ak and sk):
        return None, None
    # endpoint is http://host:port — splice the creds into the authority.
    scheme, _, host = endpoint.partition("://")
    if not host:
        return None, None
    alias = "dcpvol"
    env = dict(os.environ)
    env[f"MC_HOST_{alias}"] = f"{scheme}://{ak}:{sk}@{host}"
    return env, alias

def restore_workspace(ws, sloop, rpw):
    """RESTORE the renter's /workspace snapshot from MinIO INTO the pod, driven
    from the VPS: stream the bucket object through the reverse tunnel and untar it
    in the pod. A missing object (first-ever launch) is a clean no-op. Best-effort:
    a restore failure must never fail the launch — the renter just gets an empty
    /workspace, exactly like a fresh pod. Secrets stay off argv (S3 via MC_HOST,
    rpw via SSHPASS)."""
    env, alias = _mc_host_env(ws)
    if not env:
        return {"restored": False, "reason": "no_workspace_s3"}
    bucket = ws["bucket"]
    obj = f"{alias}/{bucket}/{WORKSPACE_OBJECT}"
    # No object yet → nothing to restore (first launch for this volume).
    if sh_env("mc stat " + _q(obj) + " >/dev/null 2>&1", env).returncode != 0:
        return {"restored": False, "reason": "no_snapshot_yet"}
    env["SSHPASS"] = str(rpw)
    cmd = (
        "mc cat " + _q(obj) + " | "
        "sshpass -e ssh -p " + str(int(sloop)) +
        " -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
        " -o ConnectTimeout=15 root@" + TUNNEL_HOST +
        " 'mkdir -p /workspace && tar -C /workspace -xzf -'"
    )
    r = sh_env(f"timeout {RESTORE_TIMEOUT_S} bash -c {_q(cmd)}", env)
    ok = r.returncode == 0
    if not ok:
        sys.stderr.write(f"restore_workspace WARN rc={r.returncode}: {r.stderr[:200]}\n")
    return {"restored": ok, "bucket": bucket, "rc": r.returncode}

def snapshot_workspace(ws, sloop, rpw):
    """SNAPSHOT the pod's /workspace INTO MinIO, driven from the VPS: tar the pod's
    /workspace through the reverse tunnel and pipe it straight into the bucket
    object. Hard-capped by `timeout` so a hung pod can't wedge teardown. Returns a
    small dict for logging. Secrets stay off argv (S3 via MC_HOST, rpw via
    SSHPASS)."""
    env, alias = _mc_host_env(ws)
    if not env:
        return {"snapshotted": False, "reason": "no_workspace_s3"}
    bucket = ws["bucket"]
    obj = f"{alias}/{bucket}/{WORKSPACE_OBJECT}"
    env["SSHPASS"] = str(rpw)
    cmd = (
        "sshpass -e ssh -p " + str(int(sloop)) +
        " -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
        " -o ConnectTimeout=15 root@" + TUNNEL_HOST +
        " 'tar -C /workspace -czf - .' | "
        "mc pipe " + _q(obj)
    )
    r = sh_env(f"timeout {SNAPSHOT_TIMEOUT_S} bash -c {_q(cmd)}", env)
    ok = r.returncode == 0
    if not ok:
        sys.stderr.write(f"snapshot_workspace WARN rc={r.returncode}: {r.stderr[:200]}\n")
    return {"snapshotted": ok, "bucket": bucket, "rc": r.returncode}

def _q(s):
    """Single-quote a string for safe embedding in a bash -c command."""
    return "'" + str(s).replace("'", "'\\''") + "'"

def entrypoint(jt, rpw, jloop, sloop, apikey):
    return f"""exec > /tmp/burst.log 2>&1
set -x
for v in $(env | grep -oE "^(RUNPOD|RP)[A-Z0-9_]*" || true); do unset "$v"; done
rm -f /etc/rp_environment 2>/dev/null || true
sed -i "/rp_environment/d;/RUNPOD/d" /root/.bashrc /etc/bash.bashrc /etc/profile 2>/dev/null || true
echo dcp-pod > /etc/hostname 2>/dev/null || true
hostname dcp-pod 2>/dev/null || true
: > /etc/motd 2>/dev/null || true; rm -f /etc/update-motd.d/* 2>/dev/null || true
command -v runpodctl >/dev/null 2>&1 && rm -f "$(command -v runpodctl)" 2>/dev/null || true
export DEBIAN_FRONTEND=noninteractive
JUP=$(command -v jupyter || ls /opt/conda/bin/jupyter 2>/dev/null)
# Happy path: the base image already ships sshd + jupyter + curl + ssh, so we
# install NOTHING. Guard only: if an unexpected image is missing a binary, pull
# the minimum just for that gap so launch never hard-fails. autossh is not used
# anymore (replaced by a built-in-ssh reconnect loop below).
MISS=""
command -v sshd >/dev/null 2>&1 || [ -x /usr/sbin/sshd ] || MISS="$MISS openssh-server"
command -v ssh  >/dev/null 2>&1 || MISS="$MISS openssh-client"
command -v curl >/dev/null 2>&1 || MISS="$MISS curl"
if [ -n "$MISS" ]; then
  apt-get update -qq && apt-get install -y -qq $MISS >/tmp/dep.log 2>&1
fi
[ -z "$JUP" ] && {{ pip install --no-cache-dir jupyterlab >/tmp/jup.log 2>&1; JUP=$(command -v jupyter || ls /opt/conda/bin/jupyter 2>/dev/null || echo jupyter); }}
mkdir -p /workspace
mkdir -p /root/.ssh
cat > /root/.ssh/dcp_tunnel <<'K'
{TUNNEL_KEY}
K
chmod 600 /root/.ssh/dcp_tunnel
mkdir -p /run/sshd; echo "root:{rpw}" | chpasswd
sed -i "s/^#\\?PermitRootLogin.*/PermitRootLogin yes/; s/^#\\?PrintMotd.*/PrintMotd no/" /etc/ssh/sshd_config 2>/dev/null || true
# Start sshd, jupyter, and the reverse tunnel in PARALLEL (no long serial sleep).
ssh-keygen -A 2>/dev/null || true
/usr/sbin/sshd
PATH=/opt/conda/bin:/usr/local/bin:$PATH nohup $JUP lab --ip=0.0.0.0 --port=8888 --allow-root --no-browser --ServerApp.token={jt} --ServerApp.allow_remote_access=True --ServerApp.disable_check_xsrf=True --notebook-dir=/workspace >/var/log/jupyter.log 2>&1 &
# Built-in ssh in a self-healing reconnect loop (autossh is not in this image).
# -N no command, -R reverse-forwards jupyter(8888) + ssh(22) out to the VPS,
# ExitOnForwardFailure so a half-open forward exits and the loop re-dials.
( while true; do
   ssh -N -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o ConnectTimeout=15 -i /root/.ssh/dcp_tunnel -R 127.0.0.1:{jloop}:localhost:8888 -R 127.0.0.1:{sloop}:localhost:22 dcpburst@{VPS} >/tmp/tunnel.log 2>&1
   sleep 5
 done ) &
( while true; do
   G=$(nvidia-smi --query-gpu=name,memory.total,memory.free,utilization.gpu,temperature.gpu,driver_version --format=csv,noheader,nounits 2>/dev/null | head -1)
   N=$(echo "$G"|cut -d, -f1|sed "s/^ //"); VT=$(echo "$G"|cut -d, -f2|tr -d " "); VF=$(echo "$G"|cut -d, -f3|tr -d " "); UT=$(echo "$G"|cut -d, -f4|tr -d " "); TP=$(echo "$G"|cut -d, -f5|tr -d " "); DV=$(echo "$G"|cut -d, -f6|sed "s/^ //")
   [ -n "{apikey}" ] && curl -s -X POST "https://api.dcp.sa/api/providers/heartbeat" -H "Content-Type: application/json" -d "{{\\"api_key\\":\\"{apikey}\\",\\"gpu_status\\":{{\\"gpu_name\\":\\"$N\\",\\"gpu_vram_mib\\":${{VT:-0}},\\"free_vram_mib\\":${{VF:-0}},\\"gpu_util_pct\\":${{UT:-0}},\\"temp_c\\":${{TP:-0}},\\"driver_version\\":\\"$DV\\",\\"daemon_version\\":\\"burst-1.0\\"}},\\"accepting_jobs\\":true}}" >/dev/null 2>&1
   sleep 30
 done ) &
sleep infinity
"""

def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def sh_env(cmd, env):
    """sh() but with an explicit env (so we can pass MC_HOST_*/SSHPASS without
    ever putting the secret on the argv that ps/audit logs would capture)."""
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)

def _relay_pids(pattern):
    """PIDs of the socat relay processes whose argv contains `pattern`.

    We read /proc/<pid>/cmdline for every socat process rather than `pgrep -f`,
    because `pgrep -f` matches the FULL command line of ANY process — including
    the transient `sh -c "pgrep -f 'socat...OPENSSL-LISTEN:43110'"` wrapper that
    subprocess spawns to run the check, whose own argv contains both 'socat' and
    the pattern. That self-match made the post-kill confirm see a phantom
    survivor and report a false leak even though the real relay was dead. Reading
    each socat's cmdline (and only socat) is immune to that."""
    pids = []
    for pid in sh("pgrep -x socat").stdout.split():
        pid = pid.strip()
        if not pid:
            continue
        try:
            cmd = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode("utf-8", "replace")
        except Exception:
            continue
        if pattern in cmd:
            pids.append(pid)
    return pids

def _port_listening(pattern):
    """True if a socket is still LISTENing on the public port inside `pattern`
    (e.g. 'OPENSSL-LISTEN:43110' -> :43110). Ground-truth that the relay is gone,
    independent of any process-table matching."""
    m = pattern.rsplit(":", 1)
    if len(m) != 2 or not m[1].isdigit():
        return False
    return sh(f"ss -tlnH 'sport = :{m[1]}' | grep -q .").returncode == 0

def kill_relay(pattern, grace=2.0):
    """Kill every socat relay matching `pattern` (e.g. 'OPENSSL-LISTEN:41785' or
    'TCP-LISTEN:42221') with a SIGTERM grace period then SIGKILL escalation, and
    confirm the public port is no longer listening. Returns True if gone.

    The old teardown ran both pkills as one shell string with no escalation, so
    the SSH-side TCP-LISTEN socat intermittently survived a stopped burst pod
    (one leaked relay socat per teardown). Killing each relay on its own with a
    -9 backstop and a socket-level post-check closes that leak."""
    pids = _relay_pids(pattern)
    if pids:
        sh("kill -TERM " + " ".join(pids))
    time.sleep(grace)
    # Escalate to SIGKILL for any socat that ignored the TERM.
    survivors = _relay_pids(pattern)
    if survivors:
        sh("kill -9 " + " ".join(survivors))
        time.sleep(0.5)
    # Ground truth: the relay is gone when nothing listens on its port AND no
    # matching socat process remains.
    gone = (not _port_listening(pattern)) and (not _relay_pids(pattern))
    if not gone:
        sys.stderr.write(f"kill_relay WARN: relay still up for {pattern!r}\n")
    return gone

def _start_cmd(b64):
    return ["bash","-lc","echo "+b64+" | base64 -d > /init.sh && bash /init.sh"]

def create_pod(gpu, b64):
    """Create a SECURE-cloud GPU pod and return its id, STEERING the create to a
    datacenter that actually has `gpu` available right now.

    Why this exists (the bug this fixes): the old create sent gpuTypeIds + cloudType
    and NOTHING for placement, so RunPod REST fell back to its broad default DC
    list and the scheduler repeatedly landed on a DC that could not fulfil the
    create at that instant — HTTP 500 "machine does not have the resources to
    deploy" for the RTX PRO 6000. The console worked because it pinned a live DC.
    We now query live per-DC availability and pin the create the same way.

    Two paths, chosen by REST gpuTypeIds enum membership:
      • gpu IS in the REST enum (PRO 6000, H100, 4090, ...): REST /v1/pods with
        dataCenterIds = available∩REST-enum (best-stock first), dataCenterPriority
        "availability". Retry each DC individually on a 500/no-resources so one
        dead DC can't fail the launch.
      • gpu is NOT in the REST enum (RTX PRO 4500 Blackwell today): deploy via the
        GraphQL podFindAndDeployOnDemand mutation, which accepts the full
        gpuTypes.id set. Try each available DC in turn.

    Blackwell cards keep the cu128 BLACKWELL_IMAGE (image_for_gpu) but we do NOT
    pin allowedCudaVersions — that collapses the host pool to SUPPLY_CONSTRAINT.
    """
    img = image_for_gpu(gpu)
    rest_dcs, all_dcs = datacenters_for(gpu)

    if gpu in REST_GPU_ENUM:
        base = {"name":"dcp-burst","imageName":img,"cloudType":"SECURE",
                "computeType":"GPU","gpuTypeIds":[gpu],"gpuCount":1,
                "containerDiskInGb":20,"volumeInGb":20,"volumeMountPath":"/workspace",
                "dataCenterPriority":"availability",
                "dockerStartCmd":_start_cmd(b64)}
        # NB: we deliberately do NOT pin allowedCudaVersions for Blackwell. The
        # cu128 torch lives INSIDE the container image (the wheel bundles CUDA);
        # the host only needs a new-enough driver. Pinning the host CUDA version
        # narrows the secure-cloud Blackwell host pool to ~zero and triggers
        # SUPPLY_CONSTRAINT ("no instances available") even when the card shows
        # High stock — verified 2026-06-20: dropping it deploys the 4500 in
        # EU-RO-1 first try, adding it back fails across every available DC.
        # Try each live DC on its own first (kills the 500-on-dead-DC), then a
        # combined steered call, then a last-ditch unsteered call.
        attempts = [{**base, "dataCenterIds":[dc]} for dc in rest_dcs]
        if rest_dcs:
            attempts.append({**base, "dataCenterIds":rest_dcs})
        attempts.append(base)  # no steering — RunPod picks (legacy behaviour)
        last_err = None
        for body in attempts:
            try:
                pod = rp("POST","/pods",body)
            except SystemExit as e:
                last_err = str(e); sys.stderr.write(f"create_pod REST attempt failed: {e}\n")
                continue
            pid = pod.get("id")
            if pid:
                dc = (body.get("dataCenterIds") or ["<auto>"])
                sys.stderr.write(f"create_pod REST ok: {pid} via {dc}\n")
                return pid
            last_err = "no pod id in REST response"
        raise RuntimeError(f"REST create failed across DCs {rest_dcs or '[auto]'}: {last_err}")

    # ── GraphQL deploy path: gpu not in the REST gpuTypeIds enum ──────────────
    # podFindAndDeployOnDemand accepts the full gpuTypes.id set. It has no
    # dataCenterIds enum, so we walk every available DC (best-stock first). The
    # resulting pod id lives in the same id-space and is torn down via REST DELETE.
    m = ("mutation($input: PodFindAndDeployOnDemandInput!){"
         "podFindAndDeployOnDemand(input:$input){ id costPerHr desiredStatus "
         "machine{ dataCenterId gpuTypeId } } }")
    # podFindAndDeployOnDemand takes a single dockerArgs STRING as the container
    # command (REST's dockerStartCmd is an array). Build the exact same one-liner
    # the REST path runs: decode the base64 init payload and exec it under bash.
    docker_args = "bash -lc 'echo " + b64 + " | base64 -d > /init.sh && bash /init.sh'"
    dc_targets = all_dcs or [None]
    last_err = None
    for dc in dc_targets:
        inp = {"cloudType":"SECURE","gpuCount":1,"gpuTypeId":gpu,"name":"dcp-burst",
               "imageName":img,"containerDiskInGb":20,"volumeInGb":20,
               "volumeMountPath":"/workspace","minVcpuCount":1,"minMemoryInGb":1,
               "ports":"8888/http,22/tcp","startSsh":True,
               "dockerArgs":docker_args}
        if dc:
            inp["dataCenterId"] = dc
        # No allowedCudaVersions for Blackwell here either — see the REST path
        # note above: the cu128 runtime is in the image, and pinning host CUDA
        # collapses the host pool to a SUPPLY_CONSTRAINT failure.
        try:
            data = gql(m, {"input":inp})
        except SystemExit as e:
            last_err = str(e); sys.stderr.write(f"create_pod GraphQL attempt {dc} failed: {e}\n")
            continue
        node = (data or {}).get("podFindAndDeployOnDemand") or {}
        pid = node.get("id")
        if pid:
            sys.stderr.write(f"create_pod GraphQL ok: {pid} via {dc}\n")
            return pid
        last_err = "no pod id in GraphQL response"
    raise RuntimeError(f"GraphQL deploy failed across DCs {all_dcs or '[auto]'}: {last_err}")

def launch(gpu, jloop, sloop, jpub, spub, apikey="", job_id=None):
    # When wired to a job, reuse the renter's task_spec credentials so the
    # access_url we publish matches what the backend already handed the renter.
    dur = int(os.environ.get("BURST_DUR_S", "21600"))
    workspace_s3 = None
    if job_id:
        jt0, rpw0, dur0, workspace_s3 = job_credentials(job_id)
        jt = jt0 or secrets.token_hex(16)
        rpw = rpw0 or secrets.token_hex(12)
        if "BURST_DUR_S" not in os.environ:
            dur = dur0
    else:
        jt = secrets.token_hex(16); rpw = secrets.token_hex(12)

    try:
        init = entrypoint(jt, rpw, jloop, sloop, apikey)
        b64 = subprocess.run(["base64","-w0"], input=init.encode(), capture_output=True).stdout.decode()
        # Steer the create to a DC that actually has this card now (REST path),
        # or deploy via GraphQL for gpuTypes outside the REST enum (RTX PRO 4500).
        pid = create_pod(gpu, b64)
        if not pid:
            raise RuntimeError("no pod id")
        # wait for reverse tunnel (jloop listening on VPS loopback)
        up=False
        for _ in range(40):
            time.sleep(10)
            if sh(f"ss -tlnH 'sport = :{jloop}' | grep -q .").returncode==0: up=True; break
        if not up:
            try: rp("DELETE",f"/pods/{pid}")
            except Exception: pass
            raise RuntimeError(f"tunnel_timeout (pod {pid})")
        # start TLS relay (jupyter) + raw relay (ssh). Clear any prior relay on
        # these ports first, each killed explicitly with the grace/-9 escalation
        # so a stale listener can't block the new bind.
        kill_relay(f"OPENSSL-LISTEN:{jpub}"); kill_relay(f"TCP-LISTEN:{spub}")
        sh(f"setsid socat OPENSSL-LISTEN:{jpub},cert={CERT},key={CKEY},fork,reuseaddr,verify=0 TCP:127.0.0.1:{jloop} >/tmp/socatj_{jpub}.log 2>&1 &")
        sh(f"setsid socat TCP-LISTEN:{spub},fork,reuseaddr TCP:127.0.0.1:{sloop} >/tmp/socats_{spub}.log 2>&1 &")
        time.sleep(2)
        # ── RESTORE /workspace from the renter's volume (portable tier only) ──
        # The reverse tunnel + sshd are confirmed up (jloop listening, sloop is
        # the SSH leg of the same tunnel). Stream the snapshot VPS->pod. Missing
        # object (first launch) is a clean no-op; failure never blocks the launch.
        restore_info = {"restored": False, "reason": "no_workspace_s3"}
        if workspace_s3:
            # Give the SSH leg of the tunnel a moment to register on the VPS.
            for _ in range(6):
                if sh(f"ss -tlnH 'sport = :{sloop}' | grep -q .").returncode == 0:
                    break
                time.sleep(2)
            try:
                restore_info = restore_workspace(workspace_s3, sloop, rpw)
            except Exception as e:
                sys.stderr.write(f"restore_workspace exception (non-fatal): {e}\n")
                restore_info = {"restored": False, "reason": "exception"}
        out={"ok":True,"podid":pid,"gpu":gpu,"jpub":jpub,"spub":spub,"jloop":jloop,"sloop":sloop,
             "access_url":f"https://api.dcp.sa:{jpub}/?token={jt}","ssh_command":f"ssh -p {spub} root@api.dcp.sa","root_password":rpw,
             "workspace_restored": bool(restore_info.get("restored"))}
        os.makedirs("/root/dcp-burst/active",exist_ok=True)
        # Persist sloop, rpw, and workspace_s3 so teardown/reap can SNAPSHOT the
        # pod's /workspace back into the renter's volume before the RunPod DELETE.
        json.dump({**out,"deadline":time.time()+dur, "job_id": job_id,
                   "rpw": rpw, "workspace_s3": workspace_s3},
                  open(f"/root/dcp-burst/active/{pid}.json","w"))
        if job_id:
            try:
                job_success(job_id, out, dur)
            except Exception as e:
                # Relay is up but we failed to record it — tear down so the renter
                # is not charged for a pod the backend cannot see, then fail+refund.
                sys.stderr.write(f"job_success error, tearing down {pid}: {e}\n")
                teardown(str(pid), str(jpub), str(spub))
                try: os.remove(f"/root/dcp-burst/active/{pid}.json")
                except Exception: pass
                job_fail(job_id, "Burst pod started but backend write failed")
                raise SystemExit(json.dumps({"ok":False,"error":"job_write_failed","podid":pid}))
        print(json.dumps(out))
    except SystemExit:
        raise
    except Exception as e:
        # Any launch failure: fail+refund the job (if wired). No external pod
        # should survive — tunnel-timeout path already deleted it; nothing else
        # created one. The reap cron is the final backstop.
        if job_id:
            job_fail(job_id, f"Burst launch failed: {str(e)[:160]}")
        raise SystemExit(json.dumps({"ok":False,"error":str(e)[:200]}))

def teardown(pid, jpub, spub, job_id=None):
    # ── SNAPSHOT /workspace BEFORE the RunPod DELETE (portable tier only) ──────
    # Idempotency guard: the active record is the single source of truth for the
    # tunnel port (sloop), the pod's root password (rpw), and the renter's bucket
    # (workspace_s3). If it's already gone, another teardown/reap already ran —
    # do NOT snapshot again (the pod may already be deleted, the tunnel down) and
    # fall through to the relay cleanup, which is itself idempotent.
    active_path = f"/root/dcp-burst/active/{pid}.json"
    snap_info = {"snapshotted": False, "reason": "no_active_record"}
    st = None
    if os.path.exists(active_path):
        try:
            st = json.load(open(active_path))
        except Exception as e:
            sys.stderr.write(f"teardown: active record unreadable for {pid}: {e}\n")
            st = None
    # Fallback for pods launched before storage-persistence shipped: the active
    # record predates workspace_s3/rpw, so recover the renter's bucket + creds
    # from the HMAC-signed task_spec via --job-id. rpw is also in the task_spec
    # (root_password), and sloop is on the (older) active record.
    if st and not st.get("workspace_s3") and job_id:
        try:
            _jt, _rpw, _dur, ws = job_credentials(job_id)
            if ws:
                st["workspace_s3"] = ws
                if not st.get("rpw") and _rpw:
                    st["rpw"] = _rpw
        except Exception as e:
            sys.stderr.write(f"teardown: task_spec fallback failed for {pid}: {e}\n")
    if st and st.get("workspace_s3") and st.get("sloop") and st.get("rpw"):
        # The reverse tunnel is still up here (we have NOT deleted the pod yet),
        # so the VPS can reach the pod's /workspace over loopback:sloop. Hard
        # 300s cap inside snapshot_workspace keeps a hung pod from wedging stop.
        try:
            snap_info = snapshot_workspace(st["workspace_s3"], st["sloop"], st["rpw"])
        except Exception as e:
            sys.stderr.write(f"snapshot_workspace exception (non-fatal): {e}\n")
            snap_info = {"snapshotted": False, "reason": "exception"}
        sys.stderr.write(f"teardown snapshot {pid}: {json.dumps(snap_info)}\n")
    elif st:
        snap_info = {"snapshotted": False, "reason": "ephemeral"}

    try: rp("DELETE",f"/pods/{pid}")
    except SystemExit as e: print("delete warn:",e)
    # Kill each relay socat on its own with a grace-then-SIGKILL escalation and a
    # post-check, so the SSH-side TCP-LISTEN socat can no longer survive a stopped
    # burst pod and leak. jpub is the OPENSSL (Jupyter) relay; spub the raw SSH one.
    j_gone = kill_relay(f"OPENSSL-LISTEN:{jpub}")
    s_gone = kill_relay(f"TCP-LISTEN:{spub}")
    # drop the active-pod record so the reaper does not retry a torn-down pod
    try: os.remove(active_path)
    except Exception: pass
    print(json.dumps({"ok":True,"torn_down":pid,
                      "jupyter_relay_gone":j_gone,"ssh_relay_gone":s_gone,
                      "workspace_snapshotted":bool(snap_info.get("snapshotted")),
                      "snapshot":snap_info}))


def reap():
    d="/root/dcp-burst/active"; now=time.time(); reaped=[]
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if not fn.endswith(".json"): continue
            p=os.path.join(d,fn); st=json.load(open(p))
            if now > float(st.get("deadline",0)):
                # teardown() reads the active record itself to snapshot /workspace
                # before the DELETE, so the reaper path inherits persistence.
                teardown(str(st["podid"]), str(st["jpub"]), str(st["spub"]))
                try: os.remove(p)
                except Exception: pass
                reaped.append(st["podid"])
    print(json.dumps({"reaped":reaped}))

def extend(pid, add_s):
    p=f"/root/dcp-burst/active/{pid}.json"; st=json.load(open(p))
    st["deadline"]=max(float(st.get("deadline",time.time())),time.time())+int(add_s)
    json.dump(st,open(p,"w")); print(json.dumps({"ok":True,"podid":pid,"new_deadline":st["deadline"]}))

def _parse_launch_args(argv):
    """Extract optional --job-id <id> from positional launch args."""
    job_id = None
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] == "--job-id" and i+1 < len(argv):
            job_id = argv[i+1]; i += 2; continue
        pos.append(argv[i]); i += 1
    return pos, job_id

if __name__=="__main__":
    c=sys.argv[1]
    if c=="launch":
        pos, job_id = _parse_launch_args(sys.argv[2:])
        launch(*pos, job_id=job_id)
    elif c=="teardown":
        pos, job_id = _parse_launch_args(sys.argv[2:])
        teardown(*pos, job_id=job_id)
    elif c=="reap": reap()
    elif c=="extend": extend(*sys.argv[2:])
    else: print("usage: burst.py launch <gpu> <jloop> <sloop> <jpub> <spub> [apikey] [--job-id <id>] | teardown <pid> <jpub> <spub>")
