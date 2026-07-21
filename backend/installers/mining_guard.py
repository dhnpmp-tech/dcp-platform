"""
Mining guard for DCP interactive pods.

Two mechanisms:
1. Process scan: detect and kill GPU processes that are not known inference/training engines
2. Egress block: iptables rules on the pod container to block mining pool connections

Called from the pod hold loop every poll_interval seconds.
"""
import subprocess
import os
import time
import logging

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
    mining_flags = ["--algorithm", "--pool", "--wallet", "--stratum",
                    "--rig-id", "--cpu-priority", "--no-cpu",
                    "stratum+tcp", "stratum+ssl",
                    "--algo", "--url=stry", "--user="]
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
    passed = 0
    for cmd, expected, desc in test_cases:
        result = is_miner_process(cmd)
        ok = result == expected
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print("  [{}] {}: is_miner={} (expected={})".format(status, desc, result, expected))
    print("\n{}/{} tests passed".format(passed, len(test_cases)))
    return passed == len(test_cases)


if __name__ == "__main__":
    _test_detection()