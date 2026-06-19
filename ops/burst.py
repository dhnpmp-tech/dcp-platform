#!/usr/bin/env python3
"""DCP burst pod launcher — RunPod-backed, vendor-invisible, reverse-SSH relayed.
Mirrors a Node-2 interactive pod: inline Jupyter+sshd, reverse tunnel out to the VPS,
TLS relay on api.dcp.sa, heartbeat for observability. Subcommands: launch / teardown.

--job-id <id> on launch wires the (slow, blocking) launch into the DCP backend job
row: on success it flips the job to running with access_url/ssh_command/started_at/
timeout_at/burst_external_id/pod_jpub/pod_spub; on failure it marks the job failed,
refunds the renter (once), and tears down any orphan external pod. The backend
spawns this DETACHED so the renter's HTTP request returns immediately."""
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


def image_for_gpu(gpu):
    """Pick the container image for a RunPod gpuTypes.id. Blackwell cards
    (sm_120/sm_100) need a cu128 torch; everything else keeps the fast cu121
    base. Substring match keeps it robust to vendor suffixes."""
    g = str(gpu or "").lower()
    if any(n in g for n in BLACKWELL_NEEDLES):
        return BLACKWELL_IMAGE
    return IMAGE

def rp(method, path, body=None):
    req = urllib.request.Request("https://rest.runpod.io/v1"+path,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"}, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=30); return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"runpod {method} {path} -> {e.code}: {e.read().decode()[:200]}")

# ── DB helpers (only used when --job-id is supplied) ──────────────────────────
def _db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.execute("PRAGMA busy_timeout=15000")
    return conn

def job_credentials(job_id):
    """Return (jupyter_token, root_password, max_duration_seconds) from the job's
    HMAC-signed task_spec so the access_url we publish matches what the backend
    handed the renter at launch. Falls back to fresh secrets if unreadable."""
    try:
        conn = _db()
        row = conn.execute(
            "SELECT task_spec, max_duration_seconds FROM jobs WHERE job_id=?", (job_id,)
        ).fetchone()
        conn.close()
        if row:
            spec = json.loads(row[0] or "{}")
            return (spec.get("jupyter_token"), spec.get("root_password"),
                    int(row[1] or 21600))
    except Exception as e:
        sys.stderr.write(f"job_credentials warn: {e}\n")
    return (None, None, 21600)

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
PATH=/opt/conda/bin:/usr/local/bin:$PATH nohup $JUP lab --ip=0.0.0.0 --port=8888 --allow-root --no-browser --ServerApp.token={jt} --ServerApp.allow_remote_access=True --ServerApp.disable_check_xsrf=True >/var/log/jupyter.log 2>&1 &
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

def launch(gpu, jloop, sloop, jpub, spub, apikey="", job_id=None):
    # When wired to a job, reuse the renter's task_spec credentials so the
    # access_url we publish matches what the backend already handed the renter.
    dur = int(os.environ.get("BURST_DUR_S", "21600"))
    if job_id:
        jt0, rpw0, dur0 = job_credentials(job_id)
        jt = jt0 or secrets.token_hex(16)
        rpw = rpw0 or secrets.token_hex(12)
        if "BURST_DUR_S" not in os.environ:
            dur = dur0
    else:
        jt = secrets.token_hex(16); rpw = secrets.token_hex(12)

    try:
        init = entrypoint(jt, rpw, jloop, sloop, apikey)
        b64 = subprocess.run(["base64","-w0"], input=init.encode(), capture_output=True).stdout.decode()
        pod = rp("POST","/pods",{"name":"dcp-burst","imageName":image_for_gpu(gpu),"cloudType":"SECURE","computeType":"GPU",
            "gpuTypeIds":[gpu],"gpuCount":1,"containerDiskInGb":20,"volumeInGb":20,"volumeMountPath":"/workspace",
            "dockerStartCmd":["bash","-lc","echo "+b64+" | base64 -d > /init.sh && bash /init.sh"]})
        pid = pod.get("id")
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
        out={"ok":True,"podid":pid,"gpu":gpu,"jpub":jpub,"spub":spub,"jloop":jloop,"sloop":sloop,
             "access_url":f"https://api.dcp.sa:{jpub}/?token={jt}","ssh_command":f"ssh -p {spub} root@api.dcp.sa","root_password":rpw}
        os.makedirs("/root/dcp-burst/active",exist_ok=True)
        json.dump({**out,"deadline":time.time()+dur, "job_id": job_id}, open(f"/root/dcp-burst/active/{pid}.json","w"))
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

def teardown(pid, jpub, spub):
    try: rp("DELETE",f"/pods/{pid}")
    except SystemExit as e: print("delete warn:",e)
    # Kill each relay socat on its own with a grace-then-SIGKILL escalation and a
    # post-check, so the SSH-side TCP-LISTEN socat can no longer survive a stopped
    # burst pod and leak. jpub is the OPENSSL (Jupyter) relay; spub the raw SSH one.
    j_gone = kill_relay(f"OPENSSL-LISTEN:{jpub}")
    s_gone = kill_relay(f"TCP-LISTEN:{spub}")
    # drop the active-pod record so the reaper does not retry a torn-down pod
    try: os.remove(f"/root/dcp-burst/active/{pid}.json")
    except Exception: pass
    print(json.dumps({"ok":True,"torn_down":pid,
                      "jupyter_relay_gone":j_gone,"ssh_relay_gone":s_gone}))


def reap():
    d="/root/dcp-burst/active"; now=time.time(); reaped=[]
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if not fn.endswith(".json"): continue
            p=os.path.join(d,fn); st=json.load(open(p))
            if now > float(st.get("deadline",0)):
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
    elif c=="teardown": teardown(*sys.argv[2:])
    elif c=="reap": reap()
    elif c=="extend": extend(*sys.argv[2:])
    else: print("usage: burst.py launch <gpu> <jloop> <sloop> <jpub> <spub> [apikey] [--job-id <id>] | teardown <pid> <jpub> <spub>")
