"""
Mining guard for DCP provider hosts and interactive pods.

Mechanisms:
1. Pod process scan: detect and kill GPU processes that are not known inference/training engines
2. Pod egress block: iptables rules on the pod container to block mining pool connections
3. Host-scope continuous scan: GPU processes, miner cmdline/conn heuristics, persistence hunt

Pod path is called from the pod hold loop. Host path is called from a daemon
background thread with a hard time budget so heartbeats never wedge.

False-positive policy (PR #963 review):
- Bare ambiguous tokens (ruby, sha256, scrypt, nezha, stratum, forge, ethash, …)
  are supporting signals only — never sufficient alone for kill/quarantine.
- Kill requires definite miner binary OR mining-flag corroboration (pool/wallet/stratum).
- host_conn port-only findings are low-severity and must NOT quarantine.
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

# High-confidence miner binaries / product names. Substring match is OK —
# these are specific enough that a hit alone warrants action.
DEFINITE_MINER_PATTERNS = (
    "xmrig", "cpuminer", "cgminer", "bfgminer",
    "ethminer", "claymore", "phoenixminer",
    "lolminer", "gminer", "nbminer", "teamredminer", "srbminer",
    "cast-xmr", "xmr-stak", "minerd", "ccminer",
    "t-rex", "trex-miner", "trexminer",
    "kryptex", "pearlhash", "perlhash", "diamondhash",
    "nicehashminer", "nicehash",
    "coinhive", "cryptonight",
    "miningpoolhub",
)

# Ambiguous tokens — NEVER kill/quarantine on these alone. They only count
# as supporting signals when combined with mining flags or definite names.
# (ruby web servers, sha256sum, nezha monitoring, forgejo, stratum as word, …)
WEAK_MINER_TOKENS = (
    "stratum", "scrypt", "sha256", "ruby", "nezha", "forge",
    "ethash", "progpow", "kawpow", "autolykos", "octopus", "cuckoo",
    "kheavyhash", "yescrypt", "qubit", "dnrgate",
    "monero", "miningpool", "nanopool", "f2pool", "ethermine",
    "dwarfpool", "supportxmr", "minergate", "herominers",
    "hashflare", "prohashing", "hashvox",
)

# Back-compat alias used by older callers / docs
KNOWN_MINER_PATTERNS = DEFINITE_MINER_PATTERNS + WEAK_MINER_TOKENS

# Explicit mining CLI flags / URI schemes (corroborating evidence)
MINING_FLAGS = (
    "--algorithm", "--pool", "--wallet", "--stratum",
    "--rig-id", "--cpu-priority", "--no-cpu",
    "stratum+tcp", "stratum+ssl", "stratum+tcp://", "stratum+ssl://",
    "--algo", "--url=stry", "--user=",
    "-o stratum", "-o stratum+tcp", "-o stratum+ssl",
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

# Mining pool ports commonly used (host_conn alone is NOT quarantine-worthy —
# 8888=Jupyter, 5555=NCCL/MPI, etc.)
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


def mining_flag_count(cmdline):
    """Count corroborating mining CLI flags / URI schemes in cmdline."""
    if not cmdline:
        return 0
    low = cmdline.lower()
    return sum(1 for flag in MINING_FLAGS if flag in low)


def _has_definite_miner(low):
    return any(p in low for p in DEFINITE_MINER_PATTERNS)


def _has_weak_miner_token(low):
    return any(p in low for p in WEAK_MINER_TOKENS)


def is_miner_process(cmdline):
    """
    True only with high confidence:
      - definite miner binary/product name, OR
      - >=2 mining flags, OR
      - weak token + >=1 mining flag (corroborated)

    Bare 'ruby' / 'sha256sum' / 'nezha-agent' / 'forgejo' / lone 'stratum'
    must return False.
    """
    if not cmdline:
        return False
    low = cmdline.lower()
    if _has_definite_miner(low):
        return True
    flags = mining_flag_count(cmdline)
    if flags >= 2:
        return True
    if _has_weak_miner_token(low) and flags >= 1:
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
    "llama-server", "llama.cpp", "llama-cli", "ollama", "vllm", "sglang", "tgi",
    "lmdeploy", "aphrodite", "text-generation-server", "text-generation-inference",
    "tritonserver", "triton-server",
    "prism", "huggingface", "hf-text", "open-webui", "open_webui",
    "comfyui", "automatic1111", "stable-diffusion", "diffusers",
    "python", "python3",  # further filtered by is_allowed_host_gpu_process
    "dcp_daemon", "dcp-daemon",
    "nvidia-smi", "nv-hostengine", "nvidia-cuda-mps", "nvidia-persistenced",
    "dockerd", "containerd", "containerd-shim", "runc", "docker-proxy",
    "Xorg", "gnome-shell",  # desktop providers
    "tensorrt", "onnxruntime", "faster-whisper", "whisper",
)

# Training/inference markers required when binary is generic "python"
HOST_PYTHON_OK_MARKERS = (
    "torch", "vllm", "transformers", "diffusers", "train", "finetune",
    "lora", "axolotl", "unsloth", "trl", "deepspeed", "lightning",
    "jupyter", "ipython", "uvicorn", "gunicorn", "fastapi",
    "llama", "ollama", "sglang", "comfy", "inference", "gradio",
    "tensorrt", "onnx", "whisper", "open_webui", "open-webui",
)

# Host process-table allowlist — never flag these even if weak tokens appear.
# Checked with substring against full cmdline (lowercased).
ALLOWED_HOST_PROCESS_KEYWORDS = (
    "sha256sum", "sha1sum", "md5sum", "openssl",
    "nezha-agent", "nezha_agent", "/nezha/",
    "forgejo", "cargo forge", "cargo-forge",
    "ruby", "gem ", "bundle ", "rails", "puma", "sidekiq", "rake ",
    "dcp_daemon", "dcp-daemon", "mining_guard",
    "sshd", "systemd", "docker", "containerd",
    "nvidia-smi", "nv-hostengine",
)


def is_allowed_host_process(cmdline):
    """
    Allowlist gate for host process-table scan.
    True → do not emit host_proc finding for this cmdline.
    Known high-confidence miners still win (caller should check is_miner first
    with definite patterns — this gate is for weak-token collisions).
    """
    if not cmdline:
        return True
    low = cmdline.lower()
    # Definite miner never allowlisted
    if _has_definite_miner(low):
        return False
    # Corroborated mining flags never allowlisted
    if mining_flag_count(cmdline) >= 2:
        return False
    if _has_weak_miner_token(low) and mining_flag_count(cmdline) >= 1:
        return False
    for keyword in ALLOWED_HOST_PROCESS_KEYWORDS:
        if keyword.lower() in low:
            return True
    # Common system paths that are never miners
    if low.startswith(("/usr/bin/", "/bin/", "/usr/sbin/", "/sbin/")):
        base = low.rsplit("/", 1)[-1].split()[0] if low else ""
        if base in (
            "sha256sum", "sha1sum", "md5sum", "openssl", "bash", "sh",
            "python", "python3", "perl", "ruby", "node", "java",
        ):
            return True
    return False


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
                "severity": "critical", "quarantine": True,
            })
        elif not is_allowed_host_gpu_process(cmdline):
            findings.append({
                "pid": pid, "cmd": cmdline[:200], "vram_mib": vram_mib,
                "reason": "host_gpu_not_allowlisted", "scope": "host_gpu",
                "severity": "warning", "quarantine": False,
            })
    return findings


def scan_host_process_table():
    """
    Scan /proc for high-confidence miner cmdline patterns (CPU or GPU).
    Allowlist gate + corroborated is_miner_process only — never bare weak tokens.
    """
    findings = []
    try:
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            pid = int(entry)
            cmdline = get_process_cmdline(pid)
            if not cmdline:
                continue
            if not is_miner_process(cmdline):
                continue
            # Belt-and-suspenders: skip allowlisted non-miners if logic drifts
            if is_allowed_host_process(cmdline) and not (
                _has_definite_miner(cmdline.lower()) or mining_flag_count(cmdline) >= 2
            ):
                continue
            findings.append({
                "pid": pid, "cmd": cmdline[:200],
                "reason": "known_miner_pattern", "scope": "host_proc",
                "severity": "critical", "quarantine": True,
            })
    except Exception as e:
        log.debug("host process table scan error: %s", e)
    return findings


def scan_host_connections():
    """
    Look for established TCP connections to common mining pool ports.
    Uses /proc/net/tcp (no ss/netstat dependency). Best-effort.

    IMPORTANT: port-only evidence is LOW severity and must NOT quarantine.
    8888=Jupyter, 5555=NCCL/MPI are legitimate GPU-rental workloads.
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
                        "severity": "info", "quarantine": False,
                    })
    except Exception as e:
        log.debug("host connection scan error: %s", e)
    return findings


def _persistence_hit_reason(body):
    """
    Return hit label for persistence content, or None.
    Bare weak tokens / sha256 in comments alone do NOT count.
    Require definite miner name or mining-flag corroboration.
    """
    if not body:
        return None
    low = body.lower()
    for pattern in DEFINITE_MINER_PATTERNS:
        if pattern in low:
            return pattern
    flags = ("--pool", "--stratum", "stratum+tcp", "stratum+ssl", "--wallet")
    flag_hits = sum(1 for f in flags if f in low)
    if flag_hits >= 2:
        return "mining_flags"
    # weak token + at least one strong flag
    if flag_hits >= 1 and any(t in low for t in WEAK_MINER_TOKENS):
        return "weak_plus_flag"
    return None


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
        hit = _persistence_hit_reason(body)
        if hit:
            # Do not leak full bashrc to backend — short path + hit only
            snippet = ""
            low = body.lower()
            idx = low.find(hit) if hit not in ("mining_flags", "weak_plus_flag") else -1
            if idx >= 0:
                start = max(0, idx - 40)
                end = min(len(body), idx + len(hit) + 40)
                snippet = body[start:end].replace("\n", " ")[:120]
            findings.append({
                "path": path, "reason": f"persistence:{hit}",
                "scope": "persistence", "snippet": snippet,
                "severity": "critical", "quarantine": True,
            })
    return findings


def kill_host_pid(pid):
    """Best-effort SIGKILL of a host PID. Returns True if signal sent."""
    try:
        os.kill(pid, 9)
        return True
    except Exception:
        return False


def findings_warrant_quarantine(findings):
    """
    Quarantine only on high-confidence evidence:
      - known_miner_pattern on host_gpu / host_proc
      - corroborated persistence hit
      - explicit quarantine=True on a finding
    host_conn port-only and host_gpu_not_allowlisted alone → NO quarantine.
    """
    if not findings:
        return False
    for f in findings:
        if f.get("quarantine") is True:
            return True
        scope = f.get("scope")
        reason = f.get("reason") or ""
        if scope in ("host_gpu", "host_proc") and reason == "known_miner_pattern":
            return True
        if scope == "persistence" and reason.startswith("persistence:"):
            return True
    return False


def run_host_miner_sweep(kill=True, min_vram_mib=100):
    """
    Full host-scope sweep. Returns dict with findings + killed list.
    Designed to be called from a timed daemon thread.

    Kill policy: only known_miner_pattern on host_gpu/host_proc (high confidence).
    Unknown GPU allowlist misses are NOT killed here — daemon second-hit path
    handles those separately.
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
        "quarantine": findings_warrant_quarantine(findings) or bool(killed),
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


def load_integrity_baseline(path=None):
    """Load persisted baseline JSON from disk (best-effort)."""
    import json
    path = path or os.path.expanduser("~/.dcp/integrity_baseline.json")
    try:
        with open(path, "r") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return None


def save_integrity_baseline(baseline, path=None):
    """Persist baseline JSON to disk (best-effort)."""
    import json
    path = path or os.path.expanduser("~/.dcp/integrity_baseline.json")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(baseline, f, indent=0, sort_keys=True)
        return True
    except Exception as e:
        log.debug("save_integrity_baseline failed: %s", e)
        return False


def _test_detection():
    """Test the mining detection logic including don't-kill paths."""
    test_cases = [
        ("./forge --algorithm pearlhash --pool prl.kryptex.network:7048 --wallet krxYRPV4WQ.1", True, "forge miner"),
        ("python3 train.py --model bert --epochs 10", False, "training script"),
        ('python -c "import torch; print(torch.cuda.is_available())"', False, "pytorch check"),
        ("xmrig --url=stry+tcp://pool.supportxmr.com:3333 --user=wallet", True, "xmrig"),
        ("/usr/bin/python3 /opt/jupyter/jupyter-lab --no-browser", False, "jupyter"),
        ("./ccminer -a sha256d -o stratum+tcp://btc.f2pool.com:3333", True, "ccminer"),
        ("python3 -m vllm.entrypoints.openai.api_server --model Qwen/Qwen3-30B", False, "vllm serve"),
        ("./t-rex -a ethash -o stratum+tcp://eth.f2pool.com:6688 -u wallet", True, "t-rex miner"),
        # DON'T-kill paths (CRITICAL-1 false positives)
        ("ruby script.rb", False, "ruby interpreter"),
        ("/usr/bin/ruby /var/www/app/config.ru", False, "ruby web"),
        ("/usr/bin/sha256sum /etc/passwd", False, "sha256sum"),
        ("openssl dgst -sha256 file.bin", False, "openssl sha256"),
        ("/opt/nezha/nezha-agent -c /etc/nezha/config.yml", False, "nezha agent"),
        ("forgejo web --config /etc/forgejo/app.ini", False, "forgejo"),
        ("cargo forge something", False, "cargo-forge"),
        ("bash -c 'echo scrypt is a kdf'", False, "scrypt word in shell"),
        # Corroborated weak+flags still catches real miners
        ("./forge --pool prl.kryptex.network:7048 --wallet abc", True, "forge+pool+wallet"),
        ("./custom-miner --stratum pool.example:3333 --wallet x --algo ethash", True, "flags>=2"),
    ]
    host_cases = [
        ("/usr/local/bin/llama-server -m model.gguf --port 8080", True, "llama-server allow"),
        ("python3 -m vllm.entrypoints.openai.api_server --model x", True, "vllm python allow"),
        ("python3 /tmp/evil.py", False, "bare python deny"),
        ("./forge --algorithm pearlhash --pool prl.kryptex.network:7048 --wallet x", False, "forge deny"),
        ("/usr/local/bin/prism-llama-server -m m.gguf", True, "prism allow"),
    ]
    allow_host_proc_cases = [
        ("/usr/bin/sha256sum /etc/passwd", True, "sha256sum allowed host_proc"),
        ("/opt/nezha/nezha-agent -c cfg", True, "nezha allowed host_proc"),
        ("ruby app.rb", True, "ruby allowed host_proc"),
        ("xmrig -o pool:3333", False, "xmrig not allowed host_proc"),
    ]
    quarantine_cases = [
        ([{"scope": "host_conn", "reason": "mining_pool_port_connection", "port": 8888, "quarantine": False}], False, "conn-only no Q"),
        ([{"scope": "host_proc", "reason": "known_miner_pattern", "quarantine": True}], True, "host_proc miner Q"),
        ([{"scope": "host_gpu", "reason": "host_gpu_not_allowlisted", "quarantine": False}], False, "unknown gpu no Q"),
        ([{"scope": "persistence", "reason": "persistence:xmrig", "quarantine": True}], True, "persistence Q"),
        ([], False, "empty no Q"),
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
        result = is_allowed_host_gpu_process(cmd)
        ok = result == expected_allowed
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print("  [{}] host {}: allowed={} (expected={})".format(status, desc, result, expected_allowed))
    for cmd, expected_allowed, desc in allow_host_proc_cases:
        result = is_allowed_host_process(cmd)
        ok = result == expected_allowed
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print("  [{}] {}: allowed={} (expected={})".format(status, desc, result, expected_allowed))
    for findings, expected_q, desc in quarantine_cases:
        result = findings_warrant_quarantine(findings)
        ok = result == expected_q
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print("  [{}] {}: quarantine={} (expected={})".format(status, desc, result, expected_q))
    # Persistence: bashrc comment with sha256 must NOT hit
    pers_neg = _persistence_hit_reason("# use sha256 / scrypt for password hashing\nexport PATH=/usr/bin\n")
    ok = pers_neg is None
    status = "PASS" if ok else "FAIL"
    if ok:
        passed += 1
    print("  [{}] persistence bashrc sha256 comment: hit={} (expected=None)".format(status, pers_neg))
    pers_pos = _persistence_hit_reason("@reboot /tmp/xmrig -o pool:3333\n")
    ok = pers_pos == "xmrig"
    status = "PASS" if ok else "FAIL"
    if ok:
        passed += 1
    print("  [{}] persistence xmrig cron: hit={} (expected=xmrig)".format(status, pers_pos))

    total = (
        len(test_cases) + len(host_cases) + len(allow_host_proc_cases)
        + len(quarantine_cases) + 2
    )
    print("\n{}/{} tests passed".format(passed, total))
    return passed == total


if __name__ == "__main__":
    _test_detection()
