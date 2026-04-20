"""DCP Provider Daemon — pre-flight validation gate (v4.1.0 Task A8).

Before the daemon registers with the backend or accepts its first job, it
runs a 3-tier health check. The goal is to fail loudly at install time
instead of silently registering a broken provider that sits at 0% uptime.

Tiers
-----
  hard  — blocking. Daemon must exit(1) and refuse to register.
  soft  — non-blocking but surfaced in every heartbeat's
          ``preflight_warnings`` array so the backend/operator can react.
  info  — log-only, useful for diagnostics.

Each check returns a dict:
    {
      "name":            <short identifier, e.g. "gpu_detected">,
      "tier":            "hard" | "soft" | "info",
      "ok":              bool,
      "message":         str,                  # human-readable summary
      "remediation_url": str | None,           # link operator can click
    }

Link-level remediation (Task A9) is folded in: every non-ok hard/soft
check carries a remediation_url. We never auto-remediate in v4.1.0 —
we just point the operator at the right doc.

This module is stdlib-only. It must run on every supported provider
platform (Linux / macOS / Windows) without requiring a C compiler or
optional wheel installs.
"""

from __future__ import annotations

import os
import platform
import shutil
import socket
import subprocess
import sys
from typing import Any, Callable, Dict, List, Optional, Tuple

# Minimum disk free required to cache a mid-size model + its KV cache.
# 20 GB is the spec threshold — enough for a 7B model (14 GB FP16 + cache
# headroom) or a Q4 13B with breathing room.
MIN_FREE_DISK_GB = 20

# Minimum Python version — vLLM / llama.cpp Python bindings require 3.8+.
MIN_PYTHON_VERSION: Tuple[int, int] = (3, 8)

# Target backend host for HTTPS reachability probe.
BACKEND_HOST = "api.dcp.sa"
BACKEND_PORT = 443

# Known-broken (model × engine) combinations. Populated conservatively —
# expand via docs/provider-issues.md as we observe new breakages in the
# fleet. Keyed by (model_id_substring, engine_id) → remediation_url.
KNOWN_BROKEN_COMBOS: Dict[Tuple[str, str], str] = {
    # Gemma 4 on Ollama is fundamentally broken (see ollama/ollama#15237).
    # The daemon routes Gemma 4 to llama.cpp direct; the preflight warns
    # if only Ollama is available.
    ("gemma-4", "ollama"): "https://docs.dcp.sa/providers/gemma4-llamacpp",
}

# Remediation URLs — centralized so Task A9 can reuse them.
REMEDIATION = {
    "cuda_driver":        "https://www.nvidia.com/en-us/drivers/",
    "python_version":     "https://www.python.org/downloads/",
    "disk_free":          "https://docs.dcp.sa/providers/storage",
    "network":            "https://docs.dcp.sa/providers/firewall",
    "cache_writable":     "https://docs.dcp.sa/providers/storage",
    "engine_binary":      "https://docs.dcp.sa/providers/install",
    "gpu_not_detected":   "https://docs.dcp.sa/providers/gpu-setup",
}


# ─── Individual checks ──────────────────────────────────────────────────────

def check_gpu_detected(gpu_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Hard fail if no GPU (CUDA, ROCm, or Apple Silicon) is visible.

    gpu_info: the dict produced by dcp_daemon.detect_gpu(). If None, the
    check is inconclusive and returns ok=False hard (we cannot register
    a provider without knowing what hardware it has).
    """
    if not gpu_info:
        return {
            "name": "gpu_detected",
            "tier": "hard",
            "ok": False,
            "message": "GPU detection returned no information — cannot proceed",
            "remediation_url": REMEDIATION["gpu_not_detected"],
        }
    name = gpu_info.get("gpu_name")
    vram = gpu_info.get("vram_mb") or 0
    if not name or name == "CPU only" or vram <= 0:
        return {
            "name": "gpu_detected",
            "tier": "hard",
            "ok": False,
            "message": f"No GPU detected (gpu_name={name!r}, vram_mb={vram}). "
                       "DCP is a GPU marketplace — CPU-only hosts cannot register.",
            "remediation_url": REMEDIATION["gpu_not_detected"],
        }
    return {
        "name": "gpu_detected",
        "tier": "hard",
        "ok": True,
        "message": f"GPU detected: {name} ({vram} MB)",
        "remediation_url": None,
    }


def check_cuda_driver(gpu_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Soft warn if CUDA driver is missing on an NVIDIA host.

    Apple Silicon hosts skip this check entirely (driver_version="Metal").
    Soft rather than hard because some providers might run ROCm or
    pure-CPU test deployments that don't need CUDA.
    """
    info = gpu_info or {}
    if info.get("is_apple_silicon"):
        return {
            "name": "cuda_driver",
            "tier": "info",
            "ok": True,
            "message": "Apple Silicon host — CUDA driver check skipped (Metal backend)",
            "remediation_url": None,
        }
    driver = info.get("driver_version")
    if not driver:
        return {
            "name": "cuda_driver",
            "tier": "soft",
            "ok": False,
            "message": "NVIDIA driver not detected — job routing may degrade",
            "remediation_url": REMEDIATION["cuda_driver"],
        }
    return {
        "name": "cuda_driver",
        "tier": "soft",
        "ok": True,
        "message": f"CUDA driver present: {driver}",
        "remediation_url": None,
    }


def check_python_version() -> Dict[str, Any]:
    """Hard fail if Python < 3.8 — vLLM / llama.cpp-python need 3.8+."""
    cur = sys.version_info[:2]
    if cur < MIN_PYTHON_VERSION:
        return {
            "name": "python_version",
            "tier": "hard",
            "ok": False,
            "message": f"Python {cur[0]}.{cur[1]} too old (need ≥ "
                       f"{MIN_PYTHON_VERSION[0]}.{MIN_PYTHON_VERSION[1]})",
            "remediation_url": REMEDIATION["python_version"],
        }
    return {
        "name": "python_version",
        "tier": "hard",
        "ok": True,
        "message": f"Python {cur[0]}.{cur[1]} OK",
        "remediation_url": None,
    }


def check_disk_free(path: Optional[str] = None, min_gb: int = MIN_FREE_DISK_GB) -> Dict[str, Any]:
    """Soft warn if free disk < min_gb on the model-cache partition."""
    probe = path or os.path.expanduser("~")
    try:
        usage = shutil.disk_usage(probe)
    except Exception as e:
        return {
            "name": "disk_free",
            "tier": "soft",
            "ok": False,
            "message": f"Could not stat {probe}: {e}",
            "remediation_url": REMEDIATION["disk_free"],
        }
    free_gb = usage.free / (1024 ** 3)
    if free_gb < min_gb:
        return {
            "name": "disk_free",
            "tier": "soft",
            "ok": False,
            "message": f"Only {free_gb:.1f} GB free on {probe} (need ≥ {min_gb} GB)",
            "remediation_url": REMEDIATION["disk_free"],
        }
    return {
        "name": "disk_free",
        "tier": "soft",
        "ok": True,
        "message": f"{free_gb:.1f} GB free on {probe}",
        "remediation_url": None,
    }


def check_network_reachable(
    host: str = BACKEND_HOST,
    port: int = BACKEND_PORT,
    timeout: float = 5.0,
    *,
    connect_fn: Optional[Callable[[str, int, float], None]] = None,
) -> Dict[str, Any]:
    """Hard fail if the backend is unreachable.

    Uses a plain TCP connect (no HTTPS handshake) so the check works even
    from hosts with broken root CA bundles. We're checking firewall /
    NAT / DNS, not SSL chain trust.

    connect_fn is an injection point for tests.
    """
    def _default_connect(h: str, p: int, t: float) -> None:
        with socket.create_connection((h, p), timeout=t):
            pass

    fn = connect_fn or _default_connect
    try:
        fn(host, port, timeout)
        return {
            "name": "network",
            "tier": "hard",
            "ok": True,
            "message": f"Backend reachable: tcp://{host}:{port}",
            "remediation_url": None,
        }
    except Exception as e:
        return {
            "name": "network",
            "tier": "hard",
            "ok": False,
            "message": f"Cannot reach tcp://{host}:{port}: {e}",
            "remediation_url": REMEDIATION["network"],
        }


def check_cache_writable(cache_dir: Optional[str] = None) -> Dict[str, Any]:
    """Hard fail if the model cache directory is missing or read-only."""
    probe = cache_dir or os.path.expanduser("~/.cache/dcp")
    try:
        os.makedirs(probe, exist_ok=True)
        test_path = os.path.join(probe, ".dcp_preflight_write_test")
        with open(test_path, "w") as f:
            f.write("ok")
        os.remove(test_path)
    except Exception as e:
        return {
            "name": "cache_writable",
            "tier": "hard",
            "ok": False,
            "message": f"Cache dir {probe} not writable: {e}",
            "remediation_url": REMEDIATION["cache_writable"],
        }
    return {
        "name": "cache_writable",
        "tier": "hard",
        "ok": True,
        "message": f"Cache dir writable: {probe}",
        "remediation_url": None,
    }


def check_engine_binary(engine_candidates: Optional[List[str]] = None) -> Dict[str, Any]:
    """Hard fail if none of the supported inference engines are installed.

    Looks for any of: vllm, llama-server (llama.cpp), ollama. We only
    need ONE; the backend will route compatible workloads.
    """
    candidates = engine_candidates or ["vllm", "llama-server", "ollama"]
    found = [c for c in candidates if shutil.which(c)]
    if not found:
        return {
            "name": "engine_binary",
            "tier": "hard",
            "ok": False,
            "message": f"No inference engine found on PATH (looked for: {candidates})",
            "remediation_url": REMEDIATION["engine_binary"],
        }
    return {
        "name": "engine_binary",
        "tier": "hard",
        "ok": True,
        "message": f"Inference engine(s) found: {found}",
        "remediation_url": None,
    }


def check_known_broken_combos(
    primary_model: Optional[str],
    primary_engine: Optional[str],
) -> Dict[str, Any]:
    """Info-only: surface known-broken (model × engine) pairings.

    Does not block — just logs. The remediation link points at the
    docs/workaround page for the combo.
    """
    if not primary_model or not primary_engine:
        return {
            "name": "known_broken_combo",
            "tier": "info",
            "ok": True,
            "message": "No primary model/engine configured — skipping combo scan",
            "remediation_url": None,
        }
    lowered_model = primary_model.lower()
    lowered_engine = primary_engine.lower()
    for (model_sub, engine), url in KNOWN_BROKEN_COMBOS.items():
        if model_sub in lowered_model and engine == lowered_engine:
            return {
                "name": "known_broken_combo",
                "tier": "info",
                "ok": False,
                "message": f"Known-broken combo: {primary_model} on {primary_engine}",
                "remediation_url": url,
            }
    return {
        "name": "known_broken_combo",
        "tier": "info",
        "ok": True,
        "message": "No known-broken combos detected",
        "remediation_url": None,
    }


# ─── Aggregator ─────────────────────────────────────────────────────────────

def run_all_checks(
    *,
    gpu_info: Optional[Dict[str, Any]] = None,
    cache_dir: Optional[str] = None,
    primary_model: Optional[str] = None,
    primary_engine: Optional[str] = None,
    connect_fn: Optional[Callable[[str, int, float], None]] = None,
) -> Dict[str, Any]:
    """Run every pre-flight check and aggregate results.

    Returns:
        {
          "checks":   [<check result>, ...],
          "hard_failures":  [<check result with tier=hard, ok=False>, ...],
          "warnings":       [<check result with tier=soft, ok=False>, ...],
          "info":           [<check result with tier=info, ok=False>, ...],
          "passed":   bool,     # True iff no hard failures
          "platform": {os, arch, python},
        }

    The daemon boot sequence consults ``passed`` to decide exit(1) vs
    continue, and attaches ``warnings`` to its first heartbeat under
    ``preflight_warnings`` so the backend can surface them.
    """
    checks: List[Dict[str, Any]] = [
        check_gpu_detected(gpu_info),
        check_cuda_driver(gpu_info),
        check_python_version(),
        check_disk_free(),
        check_network_reachable(connect_fn=connect_fn),
        check_cache_writable(cache_dir),
        check_engine_binary(),
        check_known_broken_combos(primary_model, primary_engine),
    ]
    hard_failures = [c for c in checks if c["tier"] == "hard" and not c["ok"]]
    warnings = [c for c in checks if c["tier"] == "soft" and not c["ok"]]
    info = [c for c in checks if c["tier"] == "info" and not c["ok"]]
    return {
        "checks": checks,
        "hard_failures": hard_failures,
        "warnings": warnings,
        "info": info,
        "passed": len(hard_failures) == 0,
        "platform": {
            "os": platform.system(),
            "arch": platform.machine(),
            "python": platform.python_version(),
        },
    }


def format_preflight_report(result: Dict[str, Any]) -> str:
    """Render a human-readable summary for stdout (on hard-fail exit)."""
    lines = ["DCP Preflight Report", "=" * 30]
    for c in result["checks"]:
        mark = "✓" if c["ok"] else ("✗" if c["tier"] == "hard" else "!")
        lines.append(f"  [{mark}] {c['tier']:4s}  {c['name']:<22s} {c['message']}")
        if not c["ok"] and c.get("remediation_url"):
            lines.append(f"         → Fix: {c['remediation_url']}")
    lines.append("")
    if result["passed"]:
        if result["warnings"]:
            lines.append(f"PASSED with {len(result['warnings'])} warning(s).")
        else:
            lines.append("PASSED.")
    else:
        lines.append(f"FAILED — {len(result['hard_failures'])} hard check(s) failed.")
    return "\n".join(lines)
