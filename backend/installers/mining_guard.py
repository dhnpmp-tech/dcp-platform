"""
Mining guard for DCP provider hosts and interactive pods.

Mechanisms:
1. Pod process scan: detect and kill GPU processes that are not known inference/training engines
2. Pod egress block: iptables rules on the pod container to block mining pool connections
3. Host-scope continuous scan: GPU processes, miner cmdline/conn heuristics, persistence hunt

Pod path is called from the pod hold loop. Host path is called from a daemon
background thread with a hard time budget so heartbeats never wedge.
"""
import subprocess
import os
import time
import logging
import re

log = logging.getLogger("dcp-daemon")

# Processes that are allowed to use the GPU inside pods
ALLOWED_POD_GPU_KEYWORDS = (
    "python", "python3", "jupyter", "ipython",
    "torch", "tensorflow", "tf-", "keras",
    "vllm", "tgi", "sglang", "lmdeploy", "aphrodite",
    "ollama", "llama-server", "llama.cpp",
    "transformers", "diffusers", "stable-diffusion",
    "xformers", "accelerate", "deepspeed",
    "flash_attn", "triton", "cupy", "numba",
    "nvcc", "nvidia", "cuda",
    "node", "npm",
    "bash", "sh", "zsh",
    "sshd", "sftp-server",
    "git", "pip", "wget", "curl",
    "tar", "unzip", "gzip",
    "java",
    "R", "Rscript",
    "julia",
    "stablediffusion", "comfyui", "automatic1111",
    "trainer", "train", "finetune", "lora",
    "benchmark", "matmul",
)

# Known mining process names/binaries — match against cmdline
KNOWN_MINER_PATTERNS = (
    "forge", "pearlhash", "kryptex",
    "xmrig", "stratum", "cpuminer", "cgminer", "bfgminer",
    "ethminer", "claymore", "phoenixminer", "trex", "t-rex",
    "lolminer", "gminer", "nbminer", "teamredminer", "srbminer",
    "cast-xmr", "xmr-stak", "cryptonight", "monero",
    "minerd", "ccminer", "dnrgate", "nezha",
    "qubit", "yescrypt", "scrypt", "sha256",
    "nicehash", "miningpool", "nanopool", "f2pool",
    "ethermine", "dwarfpool", "supportxmr",
    "ruby", "perlhash", "diamondhash",
    "progpow", "ethash", "kawpow", "autolykos",
    "octopus", "cuckoo", "kheavyhash",
)

# Mining pool domains to block at network level
MINING_POOL_DOMAINS = (
    "kryptex.network", "kryptex.com",
    "pool.minexmr.com", "pool.supportxmr.com",
    "xmr.pool.minergate.com", "monerohash.com",
    "xmr.crypto-pool.fr", "monero.crypto-pool.fr",
    "eth.2miners.com", "etc.2miners.com", "xmr.2miners.com",
    "ethereum.icemining.ca", "eth.ethermine.org",
    "us1.ethermine.org", "eu1.ethermine.org", "asia1.ethermine.org",
    "eth.f2pool.com", "xmr.f2pool.com",
    "btc.f2pool.com", "ltc.f2pool.com",
    "xmr.nanopool.org", "eth.nanopool.org",
    "btc.top", "antpool.com", "btc.com",
    "sparkpool.com", "beepool.org",
    "herominers.com", "minexmr.com",
    "monero-pool.com", "monero-pool.org",
    "prohashing.com", "hashvox.com",
    "luxor.tech", "nicehash.com",
    "flypool.org", "nanopool.org",
    "dwarfpool.com", "coinhive.com",
    "crypto-pool.fr", "minergate.com",
    "hashflare.io", "genesis-mining.com",
    "pool.binance.com", "pool.bitcoin.com",
)

# Mining pool ports commonly used
MINING_POOL_PORTS = (
    3333, 4444, 5555, 7777, 8888, 9999, 14444, 14433,
    14442, 14477, 3334, 3443, 4433, 45700,
    1400, 14041, 14042, 14043, 14044,
)


def get_container_pid(container_name):
    """Get the main PID of a container."""
    try:
        r = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Pid}}", container_name],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            return int(r.stdout.strip())
    except Exception:
        pass
    return None


def get_gpu_process_pids():
    """Get PIDs of processes using the GPU via nvidia-smi pmon."""
    try:
        r = subprocess.run(
            ["nvidia-smi", "pmon", "-c", "1", "-s", "u"],
            capture_output=True, text=True, timeout=10
        )
        if r.returncode != 0:
            return {}
        pids = {}
        for line in r.stdout.strip().split("\n"):
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 4:
                try:
                    pid = int(parts[3])
                    mem = int(parts[4]) if parts[4] != "-" else 0
                    if pid > 0:
                        pids[pid] = max(pids.get(pid, 0), mem)
                except (ValueError, IndexError):
                    continue
        return pids
    except Exception:
        return {}


def get_container_cgroup_pids(container_name):
    """Get all PIDs inside a container's cgroup."""
    try:
        r = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Pid}}", container_name],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode != 0:
            return set()
        main_pid = int(r.stdout.strip())
        if main_pid <= 0:
            return set()
        cgroup_pids = set()
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            try:
                pid = int(entry)
                with open(f"/proc/{pid}/cgroup", "r") as f:
                    cg = f.read()
                if container_name in cg:
                    cgroup_pids.add(pid)
            except (OSError, IOError):
                continue
        if cgroup_pids:
            return cgroup_pids
        cgroup_pids.add(main_pid)
        def get_children(ppid):
            try:
                r2 = subprocess.run(
                    ["pgrep", "-P", str(ppid)],
                    capture_output=True, text=True, timeout=3
                )
                for line in r2.stdout.strip().split("\n"):
                    if line.strip():
                        cpid = int(line.strip())
                        cgroup_pids.add(cpid)
                        get_children(cpid)
            except Exception:
                pass
        get_children(main_pid)
        return cgroup_pids
    except Exception:
        return set()


def get_process_cmdline(pid):
    """Get command line of a process."""
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            return f.read().replace(b"\x00", b" ").decode("utf-8", "ignore").strip()
    except Exception:
        return ""


def is_miner_process(cmdline):
    """Check if a command line looks like a mining process."""
    if not cmdline:
        return False
    low = cmdline.lower()
    for pattern in KNOWN_MINER_PATTERNS:
        if pattern in low:
            return True
    mining_flags = ["--algorithm", "--pool", "--wallet",
                    "--rig-id", "--cpu-priority", "--no-cpu",
                    "stratum+tcp://", "stratum+ssl://",
                    "--algo", "--url=stry", "--user=wallet"]
    mining_flag_count = sum(1 for flag in mining_flags if flag in low)
    if mining_flag_count >= 2:
        return True
    return False


def is_allowed_pod_process(cmdline):
    """Check if a GPU process is an allowed ML/inference workload."""
    if not cmdline:
        return True
    low = cmdline.lower()
    for keyword in ALLOWED_POD_GPU_KEYWORDS:
        if keyword in low:
            return True
    return False


def kill_process_in_container(container_name, pid):
    """Kill a process inside a container."""
    try:
        r = subprocess.run(
            ["docker", "exec", container_name, "kill", "-9", str(pid)],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0:
            return True
    except Exception:
        pass
    try:
        os.kill(pid, 9)
        return True
    except Exception:
        pass
    return False


def scan_and_kill_miners(container_name):
    """
    Scan GPU processes inside a pod container.
    Kill any that match mining patterns.
    Returns list of killed processes.
    """
    killed = []
    container_pids = get_container_cgroup_pids(container_name)
    if not container_pids:
        return killed

    gpu_pids = get_gpu_process_pids()
    if not gpu_pids:
        return killed

    for pid, vram_mib in gpu_pids.items():
        if pid not in container_pids:
            continue
        if vram_mib < 100:
            continue

        cmdline = get_process_cmdline(pid)
        if not cmdline:
            continue

        if is_miner_process(cmdline):
            log.warning(
                "MINING DETECTED in pod %s: PID=%d VRAM=%dMB cmd=%s — KILLING",
                container_name, pid, vram_mib, cmdline[:100]
            )
            if kill_process_in_container(container_name, pid):
                killed.append({
                    "pid": pid, "cmd": cmdline[:120],
                    "reason": "known_miner_pattern",
                    "vram_mib": vram_mib
                })

    return killed


def setup_pod_egress_rules(container_name):
    """
    Set up iptables rules to block mining pool connections from the pod.
    Uses nsenter to enter the container's network namespace.
    """
    pid = get_container_pid(container_name)
    if not pid:
        return False

    blocked_ips = set()
    # Resolve a subset of mining pool domains
    for domain in MINING_POOL_DOMAINS[:15]:
        try:
            r = subprocess.run(
                ["dig", "+short", domain],
                capture_output=True, text=True, timeout=5
            )
            if r.returncode == 0:
                for line in r.stdout.strip().split("\n"):
                    line = line.strip()
                    if line and not line.startswith("127.") and "." in line:
                        blocked_ips.add(line)
        except Exception:
            continue

    rules_applied = 0
    try:
        for ip in blocked_ips:
            r = subprocess.run(
                ["nsenter", "-t", str(pid), "-n", "--",
                 "iptables", "-A", "OUTPUT", "-d", ip, "-j", "DROP"],
                capture_output=True, text=True, timeout=5
            )
            if r.returncode == 0:
                rules_applied += 1

        for port in MINING_POOL_PORTS:
            for proto in ("tcp", "udp"):
                r = subprocess.run(
                    ["nsenter", "-t", str(pid), "-n", "--",
                     "iptables", "-A", "OUTPUT", "-p", proto,
                     "--dport", str(port), "-j", "DROP"],
                    capture_output=True, text=True, timeout=5
                )
                if r.returncode == 0:
                    rules_applied += 1

        log.info("Pod %s: %d egress rules applied (%d IPs + %d ports blocked)",
                 container_name, rules_applied, len(blocked_ips), len(MINING_POOL_PORTS))
        return rules_applied > 0
    except Exception as e:
        log.warning("Failed to set egress rules for pod %s: %s", container_name, e)
        return False


def cleanup_pod_egress_rules(container_name):
    """Remove iptables rules when pod is destroyed."""
    pid = get_container_pid(container_name)
    if not pid:
        return
    try:
        subprocess.run(
            ["nsenter", "-t", str(pid), "-n", "--",
             "iptables", "-F", "OUTPUT"],
            capture_output=True, text=True, timeout=5
        )
        log.info("Pod %s: egress rules cleaned up", container_name)
    except Exception:
        pass




# ── Host-scope allowlist (stricter than pod allowlist) ──────────────────
# GPU compute on the provider HOST should only be DCP inference engines or
# explicit training tools run by the provider operator — not arbitrary bins.
ALLOWED_HOST_GPU_KEYWORDS = (
    "llama-server", "llama.cpp", "ollama", "vllm", "sglang", "tgi", "lmdeploy",
    "aphrodite", "text-generation-server", "tritonserver",
    "python", "python3",  # further filtered by is_allowed_host_gpu_process
    "dcp_daemon", "dcp-daemon",
    "nvidia-smi", "nv-hostengine", "nvidia-cuda-mps",
    "dockerd", "containerd", "containerd-shim", "runc", "docker-proxy",
    "Xorg", "gnome-shell",  # desktop providers
)

# Training/inference markers required when binary is generic "python"
HOST_PYTHON_OK_MARKERS = (
    "torch", "vllm", "transformers", "diffusers", "train", "finetune",
    "lora", "axolotl", "unsloth", "trl", "deepspeed", "lightning",
    "jupyter", "ipython", "uvicorn", "gunicorn", "fastapi",
    "llama", "ollama", "sglang", "comfy", "inference",
)


def is_allowed_host_gpu_process(cmdline):
    """Stricter allowlist for HOST GPU processes (not pod)."""
    if not cmdline:
        return True
    low = cmdline.lower()
    # Always block known miners even if they contain an allowed keyword
    if is_miner_process(cmdline):
        return False
    hit = False
    for keyword in ALLOWED_HOST_GPU_KEYWORDS:
        if keyword.lower() in low:
            hit = True
            break
    if not hit:
        return False
    # Generic python on host GPU must look like ML work
    if re.search(r"(^|/)python3?(\s|$)", low) or low.strip().startswith("python"):
        if not any(m in low for m in HOST_PYTHON_OK_MARKERS):
            # bare python holding VRAM is suspicious on provider hosts
            return False
    return True


def _read_text(path, max_bytes=256_000):
    try:
        with open(path, "r", errors="ignore") as f:
            return f.read(max_bytes)
    except Exception:
        return ""


def scan_host_gpu_processes(min_vram_mib=100):
    """
    Flag host GPU processes that are not on the host inference allowlist.
    Returns list of finding dicts (does not kill).
    """
    findings = []
    gpu_pids = get_gpu_process_pids()
    for pid, vram_mib in gpu_pids.items():
        if vram_mib < min_vram_mib:
            continue
        cmdline = get_process_cmdline(pid)
        if not cmdline:
            continue
        # Skip processes inside docker containers (pod path handles those)
        try:
            cg = _read_text(f"/proc/{pid}/cgroup", 8192)
            if "docker" in cg or "containerd" in cg:
                continue
        except Exception:
            pass
        if is_miner_process(cmdline):
            findings.append({
                "pid": pid, "cmd": cmdline[:200], "vram_mib": vram_mib,
                "reason": "known_miner_pattern", "scope": "host_gpu",
            })
        elif not is_allowed_host_gpu_process(cmdline):
            findings.append({
                "pid": pid, "cmd": cmdline[:200], "vram_mib": vram_mib,
                "reason": "host_gpu_not_allowlisted", "scope": "host_gpu",
            })
    return findings


def scan_host_process_table():
    """Scan /proc for miner cmdline patterns (CPU or GPU)."""
    findings = []
    try:
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            pid = int(entry)
            cmdline = get_process_cmdline(pid)
            if not cmdline:
                continue
            if is_miner_process(cmdline):
                findings.append({
                    "pid": pid, "cmd": cmdline[:200],
                    "reason": "known_miner_pattern", "scope": "host_proc",
                })
    except Exception as e:
        log.debug("host process table scan error: %s", e)
    return findings


def scan_host_connections():
    """
    Look for established TCP connections to common mining pool ports.
    Uses /proc/net/tcp (no ss/netstat dependency). Best-effort.
    """
    findings = []
    pool_ports = set(MINING_POOL_PORTS)
    try:
        for netf in ("/proc/net/tcp", "/proc/net/tcp6"):
            data = _read_text(netf, 2_000_000)
            if not data:
                continue
            for line in data.splitlines()[1:]:
                parts = line.split()
                if len(parts) < 4:
                    continue
                # state 01 = ESTABLISHED
                if parts[3] != "01":
                    continue
                remote = parts[2]
                try:
                    port_hex = remote.rsplit(":", 1)[-1]
                    port = int(port_hex, 16)
                except Exception:
                    continue
                if port in pool_ports:
                    findings.append({
                        "remote": remote, "port": port,
                        "reason": "mining_pool_port_connection",
                        "scope": "host_conn",
                    })
    except Exception as e:
        log.debug("host connection scan error: %s", e)
    return findings


def hunt_persistence():
    """Scan common persistence locations for miner re-launchers."""
    findings = []
    paths = []
    # user + system crontabs
    paths.append("/etc/crontab")
    for d in ("/etc/cron.d", "/var/spool/cron/crontabs", "/var/spool/cron"):
        if os.path.isdir(d):
            try:
                for name in os.listdir(d):
                    paths.append(os.path.join(d, name))
            except Exception:
                pass
    # shell rc / profile
    home = os.path.expanduser("~")
    for name in (".bashrc", ".profile", ".bash_profile", ".zshrc"):
        paths.append(os.path.join(home, name))
    paths.append("/etc/rc.local")
    # systemd user + system unit drop-ins (limited)
    for d in (
        "/etc/systemd/system",
        os.path.join(home, ".config/systemd/user"),
        "/lib/systemd/system",
    ):
        if os.path.isdir(d):
            try:
                for root, _dirs, files in os.walk(d):
                    # bound walk
                    if root.count(os.sep) - d.count(os.sep) > 2:
                        continue
                    for fn in files:
                        if fn.endswith((".service", ".timer", ".sh")):
                            paths.append(os.path.join(root, fn))
            except Exception:
                pass

    seen = set()
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        body = _read_text(path)
        if not body:
            continue
        low = body.lower()
        hit = None
        for pattern in KNOWN_MINER_PATTERNS:
            if pattern in low:
                hit = pattern
                break
        if hit is None:
            # mining flags combo in a unit/script
            flags = ["--pool", "--stratum", "stratum+tcp", "stratum+ssl", "--wallet"]
            if sum(1 for f in flags if f in low) >= 2:
                hit = "mining_flags"
        if hit:
            findings.append({
                "path": path, "reason": f"persistence:{hit}",
                "scope": "persistence", "snippet": body[:240].replace("\n", " "),
            })
    return findings


def kill_host_pid(pid):
    """Best-effort SIGKILL of a host PID. Returns True if signal sent."""
    try:
        os.kill(pid, 9)
        return True
    except Exception:
        return False


def run_host_miner_sweep(kill=True, min_vram_mib=100):
    """
    Full host-scope sweep. Returns dict with findings + killed list.
    Designed to be called from a timed daemon thread.
    """
    import time as _time
    started = _time.time()
    findings = []
    killed = []
    try:
        findings.extend(scan_host_gpu_processes(min_vram_mib=min_vram_mib))
        findings.extend(scan_host_process_table())
        findings.extend(scan_host_connections())
        findings.extend(hunt_persistence())
    except Exception as e:
        log.warning("host miner sweep error: %s", e)

    # Dedup by (scope, pid/path, reason)
    deduped = []
    seen = set()
    for f in findings:
        key = (f.get("scope"), f.get("pid"), f.get("path"), f.get("reason"), f.get("port"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(f)
    findings = deduped

    if kill:
        for f in findings:
            if f.get("scope") in ("host_gpu", "host_proc") and f.get("reason") == "known_miner_pattern":
                pid = f.get("pid")
                if pid and kill_host_pid(pid):
                    killed.append(pid)
                    log.warning("HOST MINER KILLED pid=%s cmd=%s", pid, str(f.get("cmd", ""))[:100])

    return {
        "findings": findings,
        "killed": killed,
        "elapsed_ms": int((_time.time() - started) * 1000),
        "finding_count": len(findings),
    }


def integrity_baseline_paths():
    """Paths to fingerprint for basic tamper signal."""
    paths = []
    # self
    try:
        paths.append(os.path.abspath(__file__))
    except Exception:
        pass
    # common nvidia driver userspace
    for p in (
        "/usr/bin/nvidia-smi",
        "/usr/lib/x86_64-linux-gnu/libcuda.so.1",
        "/proc/driver/nvidia/version",
    ):
        if os.path.exists(p):
            paths.append(p)
    return paths


def compute_integrity_baseline():
    """Return {path: sha256} for integrity_baseline_paths()."""
    import hashlib
    out = {}
    for path in integrity_baseline_paths():
        try:
            if path.startswith("/proc/"):
                out[path] = hashlib.sha256(_read_text(path, 65536).encode()).hexdigest()
            else:
                h = hashlib.sha256()
                with open(path, "rb") as f:
                    for chunk in iter(lambda: f.read(1024 * 1024), b""):
                        h.update(chunk)
                out[path] = h.hexdigest()
        except Exception as e:
            out[path] = f"error:{e}"
    return out




def _test_detection():
    """Test the mining detection logic."""
    test_cases = [
        ("./forge --algorithm pearlhash --pool prl.kryptex.network:7048 --wallet krxYRPV4WQ.1", True, "forge miner"),
        ("python3 train.py --model bert --epochs 10", False, "training script"),
        ('python -c "import torch; print(torch.cuda.is_available())"', False, "pytorch check"),
        ("xmrig --url=stry+tcp://pool.supportxmr.com:3333 --user=wallet", True, "xmrig"),
        ("/usr/bin/python3 /opt/jupyter/jupyter-lab --no-browser", False, "jupyter"),
        ("./ccminer -a sha256d -o stratum+tcp://btc.f2pool.com:3333", True, "ccminer"),
        ("python3 -m vllm.entrypoints.openai.api_server --model Qwen/Qwen3-30B", False, "vllm serve"),
        ("./t-rex -a ethash -o stratum+tcp://eth.f2pool.com:6688 -u wallet", True, "t-rex miner"),
    ]
    host_cases = [
        ("/usr/local/bin/llama-server -m model.gguf --port 8080", True, "llama-server allow"),
        ("python3 -m vllm.entrypoints.openai.api_server --model x", True, "vllm python allow"),
        ("python3 /tmp/evil.py", False, "bare python deny"),
        ("./forge --algorithm pearlhash --pool prl.kryptex.network:7048 --wallet x", False, "forge deny"),
    ]
    passed = 0
    for cmd, expected, desc in test_cases:
        result = is_miner_process(cmd)
        ok = result == expected
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print("  [{}] {}: is_miner={} (expected={})".format(status, desc, result, expected))
    for cmd, expected_allowed, desc in host_cases:
        # for miners expected_allowed=False means is_allowed_host should be False
        result = is_allowed_host_gpu_process(cmd)
        ok = result == expected_allowed
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print("  [{}] host {}: allowed={} (expected={})".format(status, desc, result, expected_allowed))
    total = len(test_cases) + len(host_cases)
    print("\n{}/{} tests passed".format(passed, total))
    return passed == total


if __name__ == "__main__":
    _test_detection()