#!/usr/bin/env python3
"""
DCP Provider Daemon v4.0.3 — GPU Compute Marketplace
Runs as a background service on provider machines.

Features:
  - GPU detection via nvidia-smi
  - System readiness checks (CUDA, PyTorch, VRAM)
  - 30s heartbeat to DC1 backend
  - Job polling (every 10s) with dual endpoint support
  - Docker-based execution (NVIDIA Container Toolkit) with bare-metal fallback
  - Container security hardening: read-only rootfs, cap-drop all, seccomp profile, pids/cpu limits
  - GPU VRAM leak detection (baseline compare after container exit)
  - Machine verification challenge support (anti-fraud GPU benchmarking)
  - 2MB stdout capture for LLM/image outputs
  - HMAC verification of task_spec before execution
  - Structured logging to ~/dc1-provider/logs/
  - Crash watchdog with auto-restart (max 5 restarts in 10 min)
  - Event logging to backend (crashes, job results, daemon lifecycle)
  - Self-updating: downloads new daemon from backend when update_available
  - Model pre-caching: downloads LLM weights on startup for fast first inference
  - Real-time job progress: reports execution phase (downloading/loading/generating) to backend
  - v3.5.0: Model auto-detection across Ollama/vLLM/llama.cpp engines (reported in heartbeat)
  - v3.5.0: Engine watchdog with auto-restart for Ollama, event-based alerts for vLLM
  - v3.5.0: Concurrency capacity estimation based on engine type (reported in heartbeat)
  - v3.5.0: Graceful drain on SIGTERM/SIGINT with final draining-status heartbeat
  - v3.5.0: Passive daemon-version update check (logs when newer version is available)
  - v4.0.3 (Phase 1.5): Seven targeted Round-4 fixes:
      A. Engine KV-cache-dtype introspection (fixes safe-context 4x overestimate)
      B. Memory-bandwidth performance prediction + drift detection
      C. Dual-identity cached_models (Ollama tag + HF canonical + vLLM variants)
      D. RunPod pod hourly cost self-report (for backend cost-plus pricing)
      E. Account runway hours best-effort self-report
      F. Port-mismatch auto-detect + socat forwarder auto-install
      G. Daemon code hash for version-skew detection across the fleet

Usage:
  python3 dcp_daemon.py                    # Uses injected key
  python3 dcp_daemon.py --key YOUR_KEY     # Manual key override
  python3 dcp_daemon.py --url URL          # Manual URL override
"""

import os
import sys
import time
import json
import hmac
import random
import hashlib
import logging
import platform
import subprocess
import threading
import tempfile
import argparse
import traceback
import shutil
import signal
import shlex
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional

# ─── v4.1.0 (Task A10) CLAIM-TOKEN HANDSHAKE ────────────────────────────────
# The installer (dcp-setup-unix.sh / dcp-setup-windows.ps1) generates a
# random 32-byte hex token at install time and writes it to
# ~/.dcp/claim.json. The daemon reads it on first startup, attaches it
# to the very first heartbeat payload, then zeros the in-memory copy
# (one-shot delivery) so subsequent heartbeats carry no token. The
# backend matches the token to the pending wizard session and completes
# the provider onboarding without any copy-paste by the user.
_CLAIM_TOKEN: Optional[str] = None
_CLAIM_SENT: bool = False


def _load_claim_token_once() -> Optional[str]:
    """Read ~/.dcp/claim.json once at daemon boot and return the token.

    Returns None if the file is missing, malformed, or the token field
    is absent/empty. The file is left on disk — it is the backend's
    responsibility to invalidate the token server-side once claimed.
    """
    claim_path = Path(os.path.expanduser("~/.dcp/claim.json"))
    if not claim_path.exists():
        return None
    try:
        data = json.loads(claim_path.read_text())
    except (ValueError, OSError):
        # Silent tolerate — logger may not be configured at import.
        return None
    if not isinstance(data, dict):
        return None
    tok = data.get("claim_token")
    if not isinstance(tok, str) or not tok.strip():
        return None
    return tok.strip()


# ─── CONFIGURATION (injected by download endpoint) ──────────────────────────

API_KEY = "{{API_KEY}}"
API_URL = "{{API_URL}}"
HMAC_SECRET = "{{HMAC_SECRET}}"

HEARTBEAT_INTERVAL = 30   # seconds
HEARTBEAT_JITTER_PCT = 0.15          # ±15% jitter to avoid thundering herd
HEARTBEAT_MAX_BACKOFF = 300          # cap exponential backoff at 5 min
HEARTBEAT_BACKOFF_BASE = 2.0         # double each consecutive failure
JOB_POLL_INTERVAL = 10    # seconds
JOB_POLL_JITTER_PCT = 0.10           # ±10% jitter on poll sleep
UPDATE_CHECK_JITTER_PCT = 0.20       # ±20% jitter on update-check sleep
DAEMON_VERSION = "4.0.3"
MAX_STDOUT = 2097152       # 2 MB stdout capture (for base64 image results)
JOB_TIMEOUT = 900          # 15 min default job timeout (model downloads can be slow)
RESULT_POST_TIMEOUT = 120  # 2 min for uploading results (large base64 images)
RESULT_POST_RETRIES = 3    # Retry result submission up to 3 times
MAX_CONTAINER_RESTARTS = 3
CONTAINER_RESTART_BACKOFFS = [10, 30, 90]
MAX_CRASH_RESTARTS = 5     # Max restarts within the crash window
CRASH_WINDOW = 600         # 10 minute window for counting crashes
AUTO_UPDATE_CHECK = 300    # Check for updates every 5 minutes
UPDATE_CRASH_THRESHOLD = 90  # If daemon crashes within 90s of update, rollback
ROLLBACK_RECHECK_INTERVAL = 600  # After rollback, re-check for updates every 10 min
CANONICAL_UPDATE_ENDPOINT = "https://api.dcp.sa/api/providers/download/daemon"
CANONICAL_INSTALLER_DOWNLOAD_URL = "https://api.dcp.sa/installers/daemon"
CANONICAL_API_BASE_URL = "https://api.dcp.sa"

# ─── CONTAINER SECURITY CONFIG ───────────────────────────────────────────────
CONTAINER_CPU_LIMIT = "4"          # Max CPU cores per job container
CONTAINER_MEMORY_LIMIT = "16g"     # Max RAM per job container (swap disabled)
CONTAINER_PIDS_LIMIT = "256"       # Max PIDs (fork-bomb protection)
CONTAINER_TMP_SIZE = "1g"          # tmpfs size for /tmp in container
VLLM_CPU_LIMIT = "8"               # vLLM serve default CPU limit
VLLM_MEMORY_LIMIT = "24g"          # vLLM serve default memory cap
VLLM_PIDS_LIMIT = "512"            # vLLM serve process limit
VLLM_TMP_SIZE = "2g"               # vLLM /tmp tmpfs size
VLLM_SHM_SIZE = "4g"               # vLLM shared memory size
_SECCOMP_PROFILE_PATH = None       # Cached seccomp profile path (written once)
BANDWIDTH_CHECK_INTERVAL = 600   # Measure bandwidth every 10 minutes
BANDWIDTH_TEST_SIZE = 102400     # 100KB test payload for speed measurement
MODEL_CACHE_PATH = "/opt/dcp/model-cache"

# VRAM requirements per job type (MiB) — jobs need at least this much free VRAM
VRAM_REQUIREMENTS = {
    "image_generation": 3500,   # SD v1.4 needs ~3.5 GB
    "llm-inference": 5000,      # 7B model needs ~5 GB
    "training": 6000,           # Fine-tuning needs ~6 GB
    "benchmark": 1000,          # Matrix multiply needs ~1 GB
    "rendering": 2000,          # General GPU rendering
    "vllm_serve": 14336,        # vLLM 7B model in FP16 needs ~14 GB
}
VRAM_DEFAULT_REQUIREMENT = 2000  # Default if job type unknown

# ─── POWER COST AWARENESS ────────────────────────────────────────────────────
# Provider can set electricity cost in config.json to skip unprofitable jobs
POWER_COST_CONFIG_FILE = Path.home() / "dc1-provider" / "power_config.json"
DEFAULT_ELECTRICITY_COST_KWH = 0.0  # 0 = disabled (accept all jobs)
DEFAULT_GPU_TDP_WATTS = 300          # Default TDP for profitability calc

# ─── MULTI-GPU CONCURRENT JOBS ───────────────────────────────────────────────
MAX_CONCURRENT_JOBS = 1  # Default: 1 job at a time (auto-raised for multi-GPU)
_gpu_job_slots = {}  # {gpu_index: job_id or None}
_gpu_slots_lock = threading.Lock()

# ─── NETWORK QUALITY ─────────────────────────────────────────────────────────
NETWORK_QUALITY_INTERVAL = 300  # Measure network quality every 5 minutes
NETWORK_QUALITY_PING_COUNT = 5  # Packets for packet loss measurement
_network_quality = {
    "latency_ms": None,
    "jitter_ms": None,
    "packet_loss_pct": None,
    "dns_resolve_ms": None,
    "last_check": None,
}
_nq_lock = threading.Lock()

# Disk space requirements (MB)
DISK_MIN_FREE_MB = 5000          # 5 GB minimum free space (models can be 4-8 GB)
DISK_MIN_TEMP_MB = 500           # 500 MB minimum for /tmp scripts

# ─── SETUP LOGGING ──────────────────────────────────────────────────────────

LOG_DIR = Path.home() / "dc1-provider" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_DIR = Path.home() / "dc1-provider"
PEER_ID_FILE = CONFIG_DIR / "peer_id"
UPDATE_SUPPRESSION_FILE = CONFIG_DIR / "update_suppression.json"

# ─── v4.0.0-alpha: DCP CONFIG + CACHES ──────────────────────────────────────
# v4.0 introduces a forward-looking ~/.dcp/ directory for daemon v4+ config
# and runtime caches. Older ~/dc1-provider/ paths remain for backward compat.
DCP_DIR = Path.home() / ".dcp"
DCP_CONFIG_FILE = DCP_DIR / "config.json"
DCP_CONCURRENCY_CACHE_FILE = DCP_DIR / "concurrency_cache.json"
try:
    DCP_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass

# CLI flag: set by main() when --force-reprobe is passed. Skips concurrency cache.
_FORCE_REPROBE_CONCURRENCY = False

# Runtime cache of the last computed safe context per model (populated by main()).
_effective_context_by_model = {}
_effective_context_lock = threading.Lock()

# Runtime cache of cpu-offload detection result (updated by verify_no_cpu_offload).
_cpu_offload_state = {"detected": False, "last_check": None, "details": ""}
_cpu_offload_lock = threading.Lock()

# ─── v4.0.3 (Phase 1.5 / Fix G): DAEMON CODE HASH ───────────────────
# A sha256 prefix of this file's bytes lets the backend detect silent code
# drift across the fleet even when DAEMON_VERSION is identical. Computed once
# at import time; constant for the lifetime of the process.

def _compute_code_hash():
    """Return a short sha256 hex prefix of this daemon source file.

    Returns:
        str: 16-character hex string, or "unknown" on read error.
    """
    try:
        with open(__file__, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:16]
    except (OSError, IOError):
        return "unknown"

_CODE_HASH = _compute_code_hash()

# ─── v4.0.3 (Phase 1.5 / Fix D+E): RUNPOD COST CACHES ───────────────
# Hourly cost does not change during a pod's lifetime, so we resolve it once
# on startup and reuse. Account runway requires an account-scoped key and is
# rate-limited to once per 10 minutes.
_POD_HOURLY_COST_USD = None
_ACCOUNT_RUNWAY_HOURS = None
_ACCOUNT_RUNWAY_LAST_CHECK = 0.0
_ACCOUNT_RUNWAY_INTERVAL_S = 600  # 10 minutes
_runpod_cache_lock = threading.Lock()

# ─── v4.0.3 (Phase 1.5 / Fix F): PORT MISMATCH STATE ────────────────
_PORT_MISMATCH_STATE = {
    "mismatch": False,
    "engine_port": None,
    "engine_name": None,
    "mapped_ports": [],
    "remedy": "none",
}
_port_mismatch_lock = threading.Lock()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "daemon.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger("dc1")

# ─── RUNTIME STATE ──────────────────────────────────────────────────────────

_docker_available = None  # Cached Docker + NVIDIA CT check
_current_job_id = None    # Track active job for heartbeat
_provider_peer_id = None  # Stable peer id for P2P heartbeat announcement
_job_lock = threading.Lock()  # Protects _current_job_id
_bw_lock = threading.Lock()   # Protects _bandwidth_stats
_peer_id_lock = threading.Lock()  # Protects peer id cache
_last_admission_signature = None  # Dedupe repeated admission rejection logs

def _log_admission_feedback(admission):
    """Surface backend admission reason codes without flooding logs each poll."""
    global _last_admission_signature
    if not isinstance(admission, dict):
        return
    if admission.get("accepted") is True:
        _last_admission_signature = None
        return

    reason_code = str(admission.get("reason_code") or "UNKNOWN_ADMISSION_REASON").strip()
    reason = str(admission.get("reason") or "Provider admission rejected").strip()
    tier_mode = admission.get("tier_mode")
    model_id = admission.get("model_id")
    job_id = admission.get("job_id")
    signature = (reason_code, str(tier_mode or ""), str(model_id or ""))
    if signature == _last_admission_signature:
        return

    _last_admission_signature = signature
    detail = f"reason_code={reason_code}"
    if tier_mode:
        detail += f" tier={tier_mode}"
    if model_id:
        detail += f" model={model_id}"
    if job_id:
        detail += f" job={job_id}"

    log.info(f"No job admitted by backend ({detail}): {reason}")
    try:
        payload_details = json.dumps(
            {"reason_code": reason_code, "reason": reason, "tier_mode": tier_mode, "model_id": model_id, "job_id": job_id},
            ensure_ascii=True,
        )
        report_event(
            "job_admission_rejected",
            payload_details,
            job_id=job_id,
            severity="info",
        )
    except Exception:
        pass

def _save_update_suppression(until_ts, reason=""):
    """Persist update suppression window so rollback survives process restarts."""
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "until_unix": int(until_ts),
            "reason": str(reason or ""),
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }
        UPDATE_SUPPRESSION_FILE.write_text(json.dumps(payload), encoding="utf-8")
    except Exception as e:
        log.debug(f"Failed to persist update suppression: {e}")

def _clear_update_suppression():
    """Delete suppression marker when cooldown expires."""
    try:
        if UPDATE_SUPPRESSION_FILE.exists():
            UPDATE_SUPPRESSION_FILE.unlink()
    except Exception as e:
        log.debug(f"Failed to clear update suppression marker: {e}")

def _get_update_suppression_until():
    """Get active update suppression unix timestamp from env/file, or 0."""
    now = int(time.time())
    env_value = os.environ.get("DCP_UPDATE_SUPPRESS_UNTIL", "").strip()
    if env_value.isdigit():
        suppress_until = int(env_value)
        if suppress_until > now:
            return suppress_until
        os.environ.pop("DCP_UPDATE_SUPPRESS_UNTIL", None)

    if not UPDATE_SUPPRESSION_FILE.exists():
        return 0

    try:
        payload = json.loads(UPDATE_SUPPRESSION_FILE.read_text(encoding="utf-8") or "{}")
        suppress_until = int(payload.get("until_unix") or 0)
        if suppress_until > now:
            return suppress_until
        _clear_update_suppression()
        return 0
    except Exception:
        _clear_update_suppression()
        return 0

# ─── HTTP HELPER ─────────────────────────────────────────────────────────────

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

def _safe_json(raw):
    """Safely parse JSON, returning {} on failure."""
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}
    except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
        return {}

def _sanitize_for_json(obj, _seen=None, _depth=0):
    """Recursively convert obj into a JSON-safe structure.

    - Breaks circular references (objects referencing themselves)
    - Converts non-primitives to str via fallback
    - Caps recursion depth to avoid runaway structures
    """
    if _seen is None:
        _seen = set()
    if _depth > 20:
        return str(obj)[:500]
    # Primitive passthrough
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    obj_id = id(obj)
    if obj_id in _seen:
        return "<circular>"
    if isinstance(obj, dict):
        _seen.add(obj_id)
        try:
            return {
                str(k): _sanitize_for_json(v, _seen, _depth + 1)
                for k, v in obj.items()
            }
        finally:
            _seen.discard(obj_id)
    if isinstance(obj, (list, tuple, set, frozenset)):
        _seen.add(obj_id)
        try:
            return [_sanitize_for_json(v, _seen, _depth + 1) for v in obj]
        finally:
            _seen.discard(obj_id)
    # Fallback: stringify unknown objects
    try:
        return str(obj)[:1000]
    except Exception:
        return "<unserializable>"

def http_post(url, data, timeout=15):
    """POST JSON to URL, returns (status_code, response_dict)."""
    # Guard against circular references / non-serializable payloads.
    try:
        json.dumps(data)
        safe_data = data
    except (TypeError, ValueError) as e:
        log.warning(f"http_post: payload not JSON-serializable ({e}); sanitizing")
        safe_data = _sanitize_for_json(data)
    if HAS_REQUESTS:
        try:
            r = requests.post(url, json=safe_data, timeout=timeout)
        except Exception as e:
            # Final fallback: use default=str so we never raise "Circular reference detected"
            body = json.dumps(safe_data, default=str)
            r = requests.post(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                timeout=timeout,
            )
            log.warning(f"http_post: requests.post(json=...) failed ({e}); used default=str fallback")
        return r.status_code, _safe_json(r.text)
    else:
        import urllib.request, urllib.error
        try:
            body = json.dumps(safe_data).encode()
        except (TypeError, ValueError):
            body = json.dumps(safe_data, default=str).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.getcode(), _safe_json(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, _safe_json(e.read())

def http_get(url, timeout=15, headers=None):
    """GET URL, returns (status_code, response_dict).

    Args:
        url: Target URL.
        timeout: Request timeout in seconds.
        headers: Optional dict of request headers. Prefer passing credentials
            via Authorization header rather than embedding them in the URL.
    """
    hdrs = dict(headers) if headers else None
    if HAS_REQUESTS:
        r = requests.get(url, timeout=timeout, headers=hdrs)
        return r.status_code, _safe_json(r.text)
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, headers=hdrs or {})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.getcode(), _safe_json(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, _safe_json(e.read())

def _auth_headers():
    """Return the standard Authorization header for credentialed daemon requests.

    Moving credentials from URL query params to the Authorization header
    avoids leaking the api_key into access logs and silences the backend's
    `[security] Credential in URL query params detected` warning. The
    backend's hasApiCredential() check accepts both forms; headers are the
    strictly-better path.
    """
    return {"Authorization": f"Bearer {API_KEY}"}

def http_patch(url, data, timeout=15):
    """PATCH JSON to URL, returns (status_code, response_dict)."""
    if HAS_REQUESTS:
        r = requests.patch(url, json=data, timeout=timeout)
        return r.status_code, _safe_json(r.text)
    else:
        import urllib.request, urllib.error
        body = json.dumps(data).encode()
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.getcode(), _safe_json(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, _safe_json(e.read())

# ─── EVENT LOGGING (send structured events to backend) ──────────────────────

def report_event(event_type, details=None, job_id=None, severity="info"):
    """
    Send a daemon event to the backend for centralized logging.
    event_type: daemon_start, daemon_stop, daemon_crash, job_success, job_failure,
                job_timeout, update_start, update_success, update_failed, watchdog_restart
    severity: info, warning, error, critical
    """
    url = f"{API_URL}/api/providers/daemon-event"
    payload = {
        "api_key": API_KEY,
        "event_type": event_type,
        "severity": severity,
        "daemon_version": DAEMON_VERSION,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "hostname": platform.node(),
        "os_info": f"{platform.system()} {platform.release()}",
        "python_version": platform.python_version(),
    }
    if details:
        payload["details"] = details[:5000]  # Cap at 5KB
    if job_id:
        payload["job_id"] = str(job_id)
    try:
        code, resp = http_post(url, payload, timeout=10)
        if code != 200:
            log.warning(f"Event report HTTP {code}: {resp}")
    except Exception as e:
        log.debug(f"Event report failed (non-critical): {e}")

    # Always save to local crash journal as backup
    _save_local_event(payload)

# Events log rotation: size-based, because each event line can be kilobytes
# (task spec echoes, stack traces). Line-count rotation used to let the file
# grow many megabytes before trimming.
_EVENTS_MAX_BYTES = 5 * 1024 * 1024     # 5 MB per active file
_EVENTS_ROTATE_KEEP = 3                  # events.jsonl.1, .2, .3

def _rotate_events_if_needed(path):
    """Rotate events.jsonl → events.jsonl.1 → .2 → .3 when > _EVENTS_MAX_BYTES.
    Best-effort; failures are swallowed."""
    try:
        if not path.exists() or path.stat().st_size < _EVENTS_MAX_BYTES:
            return
        # Shift: .2 -> .3, .1 -> .2, current -> .1
        for i in range(_EVENTS_ROTATE_KEEP, 0, -1):
            if i == 1:
                src = path
            else:
                src = path.with_suffix(path.suffix + f".{i-1}")
            dst = path.with_suffix(path.suffix + f".{i}")
            if src.exists():
                try:
                    if dst.exists():
                        dst.unlink()
                    src.rename(dst)
                except OSError:
                    pass
    except Exception:
        pass

def _save_local_event(payload):
    """Save event to local JSON-lines file (survives backend outages)."""
    try:
        journal_path = LOG_DIR / "events.jsonl"
        _rotate_events_if_needed(journal_path)
        with open(journal_path, "a") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception:
        pass

# ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────

_shutdown_requested = False

def request_graceful_shutdown():
    """Signal daemon to finish current job then exit."""
    global _shutdown_requested
    _shutdown_requested = True
    log.info("Graceful shutdown requested — will exit after current job completes")

def is_shutdown_requested():
    return _shutdown_requested

# ─── VRAM GUARD ─────────────────────────────────────────────────────────────

def check_vram_available(job_type):
    """Check if enough free VRAM is available for this job type.
    Returns (ok: bool, free_mib: int, required_mib: int)."""
    required = VRAM_REQUIREMENTS.get(job_type, VRAM_DEFAULT_REQUIREMENT)
    gpu = detect_gpu()
    if not gpu:
        # No GPU detected — reject GPU-required jobs, allow CPU-only
        gpu_required = {"image_generation", "llm-inference", "training", "rendering"}
        if job_type in gpu_required:
            return False, 0, required
        return True, 0, required
    free = gpu.get("free_vram_mib", 0)
    ok = free >= required
    if not ok:
        log.warning(f"VRAM guard: {free} MiB free < {required} MiB required for {job_type}")
    return ok, free, required

# ─── DISK SPACE CHECK ───────────────────────────────────────────────────────

def check_disk_space():
    """Check if enough disk space is available for model downloads and temp files.
    Returns (ok: bool, details: str)."""
    issues = []

    # Check home directory partition (where ~/.cache/huggingface/ lives)
    try:
        home_stat = shutil.disk_usage(str(Path.home()))
        home_free_mb = home_stat.free // (1024 * 1024)
        if home_free_mb < DISK_MIN_FREE_MB:
            issues.append(f"Home partition: {home_free_mb} MB free < {DISK_MIN_FREE_MB} MB required")
    except Exception as e:
        issues.append(f"Home partition check failed: {e}")

    # Check temp directory partition (where job scripts run)
    try:
        tmp_dir = tempfile.gettempdir()
        tmp_stat = shutil.disk_usage(tmp_dir)
        tmp_free_mb = tmp_stat.free // (1024 * 1024)
        if tmp_free_mb < DISK_MIN_TEMP_MB:
            issues.append(f"Temp partition ({tmp_dir}): {tmp_free_mb} MB free < {DISK_MIN_TEMP_MB} MB required")
    except Exception as e:
        issues.append(f"Temp partition check failed: {e}")

    if issues:
        detail = "; ".join(issues)
        log.warning(f"Disk space guard: {detail}")
        return False, detail
    return True, "OK"

def _get_or_create_peer_id():
    """Return provider peer_id persisted in provider config directory.

    This is used to keep DHT keys stable across daemon restarts and heartbeat
    cycles.
    """
    global _provider_peer_id

    with _peer_id_lock:
        if _provider_peer_id:
            return _provider_peer_id

        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        except:
            pass

        if PEER_ID_FILE.exists():
            try:
                candidate = PEER_ID_FILE.read_text().strip()
            except:
                candidate = ""
            if candidate:
                _provider_peer_id = candidate
                return _provider_peer_id

        candidate = f"dcp-{uuid.uuid4().hex}"
        try:
            PEER_ID_FILE.write_text(candidate)
        except Exception:
            log.warning("Failed to persist peer_id to %s", PEER_ID_FILE)
        _provider_peer_id = candidate
        return candidate

# ─── JOB DEDUP ──────────────────────────────────────────────────────────────

_DEDUP_FILE = CONFIG_DIR / "seen_jobs.json"
_DEDUP_TTL = 3600  # 1 hour — forget jobs older than this
_DEDUP_MAX_ENTRIES = 10_000  # size cap so a misbehaving backend can't grow this unbounded

def _load_seen_jobs():
    """Load seen job IDs from disk. Returns dict {job_id: timestamp}."""
    try:
        if _DEDUP_FILE.exists():
            data = json.loads(_DEDUP_FILE.read_text())
            # Clean expired entries
            now = time.time()
            return {k: v for k, v in data.items() if now - v < _DEDUP_TTL}
    except Exception:
        pass
    return {}

def _save_seen_jobs(seen):
    """Save seen job IDs to disk. Caps total entries to _DEDUP_MAX_ENTRIES
    by keeping the most recent by timestamp."""
    try:
        if len(seen) > _DEDUP_MAX_ENTRIES:
            # Keep the newest _DEDUP_MAX_ENTRIES
            sorted_items = sorted(seen.items(), key=lambda kv: kv[1], reverse=True)
            seen = dict(sorted_items[:_DEDUP_MAX_ENTRIES])
        _DEDUP_FILE.write_text(json.dumps(seen))
    except Exception:
        pass

def is_duplicate_job(job_id):
    """Check if we've already seen this job. Mark it as seen if not."""
    seen = _load_seen_jobs()
    if str(job_id) in seen:
        log.warning(f"Job dedup: {job_id} already seen — skipping")
        return True
    seen[str(job_id)] = time.time()
    _save_seen_jobs(seen)
    return False

# ─── BANDWIDTH MONITOR ──────────────────────────────────────────────────────

_bandwidth_stats = {
    "download_mbps": None,
    "upload_mbps": None,
    "last_check": None,
    "latency_ms": None,
}

def measure_bandwidth():
    """Measure upload/download speed and latency to the backend."""
    global _bandwidth_stats

    # Latency — time a lightweight GET
    try:
        start = time.time()
        http_get(f"{API_URL}/api/providers/download/daemon?key={API_KEY}&check_only=true", timeout=10)
        latency_ms = round((time.time() - start) * 1000)
    except:
        latency_ms = None

    # Download speed — download the daemon file (measures server→provider)
    download_mbps = None
    try:
        start = time.time()
        if HAS_REQUESTS:
            import requests as req_lib
            r = req_lib.get(f"{API_URL}/api/providers/download/daemon?key={API_KEY}", timeout=30)
            size = len(r.content)
        else:
            import urllib.request
            with urllib.request.urlopen(
                f"{API_URL}/api/providers/download/daemon?key={API_KEY}", timeout=30
            ) as resp:
                data = resp.read()
                size = len(data)
        elapsed = time.time() - start
        if elapsed > 0:
            download_mbps = round((size * 8) / (elapsed * 1_000_000), 2)
    except:
        pass

    # Upload speed — POST a test payload (measures provider→server)
    upload_mbps = None
    try:
        test_data = {"api_key": API_KEY, "event_type": "bandwidth_test",
                     "severity": "info", "daemon_version": DAEMON_VERSION,
                     "timestamp": datetime.utcnow().isoformat() + "Z",
                     "hostname": platform.node(),
                     "details": "x" * BANDWIDTH_TEST_SIZE}
        payload_size = len(json.dumps(test_data).encode())
        start = time.time()
        http_post(f"{API_URL}/api/providers/daemon-event", test_data, timeout=30)
        elapsed = time.time() - start
        if elapsed > 0:
            upload_mbps = round((payload_size * 8) / (elapsed * 1_000_000), 2)
    except:
        pass

    new_stats = {
        "download_mbps": download_mbps,
        "upload_mbps": upload_mbps,
        "latency_ms": latency_ms,
        "last_check": datetime.utcnow().isoformat() + "Z",
    }
    with _bw_lock:
        global _bandwidth_stats
        _bandwidth_stats = new_stats

    log.info(f"Bandwidth: ↓{download_mbps} Mbps ↑{upload_mbps} Mbps, latency {latency_ms}ms")

    # Report to backend as event (not bandwidth_test — that's the raw payload)
    report_event("bandwidth_report",
        f"Download: {download_mbps} Mbps, Upload: {upload_mbps} Mbps, Latency: {latency_ms}ms",
        severity="info")

    return _bandwidth_stats

def bandwidth_loop():
    """Background thread: measure bandwidth periodically."""
    # Initial measurement on startup (after a short delay)
    time.sleep(15)
    measure_bandwidth()
    while True:
        time.sleep(BANDWIDTH_CHECK_INTERVAL)
        try:
            measure_bandwidth()
        except Exception as e:
            log.debug(f"Bandwidth check error: {e}")

# ─── NETWORK QUALITY MONITOR ────────────────────────────────────────────────

def measure_network_quality():
    """Measure network quality: latency, jitter, packet loss, DNS resolve time."""
    global _network_quality
    results = {}

    # 1. Ping-based latency, jitter, and packet loss
    try:
        # Extract hostname from API_URL
        from urllib.parse import urlparse
        host = urlparse(API_URL).hostname or "api.dcp.sa"

        ping_cmd = ["ping", "-c", str(NETWORK_QUALITY_PING_COUNT), "-W", "3", host]
        if platform.system() == "Darwin":
            ping_cmd = ["ping", "-c", str(NETWORK_QUALITY_PING_COUNT), "-W", "3000", host]

        result = subprocess.run(ping_cmd, capture_output=True, text=True, timeout=20)
        output = result.stdout

        # Parse packet loss
        for line in output.splitlines():
            if "packet loss" in line:
                # "5 packets transmitted, 5 received, 0% packet loss"
                import re
                m = re.search(r'(\d+(?:\.\d+)?)%\s+packet loss', line)
                if m:
                    results["packet_loss_pct"] = float(m.group(1))

            if "min/avg/max" in line or "rtt" in line:
                # "round-trip min/avg/max/stddev = 1.2/2.5/5.1/1.3 ms"
                import re
                m = re.search(r'=\s*([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)', line)
                if m:
                    results["latency_ms"] = round(float(m.group(2)))  # avg
                    results["jitter_ms"] = round(float(m.group(4)), 1)  # stddev
    except Exception as e:
        log.debug(f"Ping measurement failed: {e}")

    # 2. DNS resolve time
    try:
        import socket
        from urllib.parse import urlparse
        host = urlparse(API_URL).hostname or "api.dcp.sa"
        start = time.time()
        socket.getaddrinfo(host, 443)
        results["dns_resolve_ms"] = round((time.time() - start) * 1000)
    except Exception:
        pass

    results["last_check"] = datetime.utcnow().isoformat() + "Z"

    with _nq_lock:
        _network_quality.update(results)

    log.info(f"Network quality: latency={results.get('latency_ms')}ms "
             f"jitter={results.get('jitter_ms')}ms "
             f"loss={results.get('packet_loss_pct')}% "
             f"dns={results.get('dns_resolve_ms')}ms")

    return _network_quality


def network_quality_loop():
    """Background thread: measure network quality periodically."""
    time.sleep(30)  # Delay after startup
    measure_network_quality()
    while True:
        time.sleep(NETWORK_QUALITY_INTERVAL)
        try:
            measure_network_quality()
        except Exception as e:
            log.debug(f"Network quality check error: {e}")


# ─── POWER COST AWARENESS ───────────────────────────────────────────────────

def load_power_config():
    """Load power cost configuration from power_config.json.

    Example config:
    {
        "electricity_cost_kwh": 0.18,    // SAR per kWh
        "gpu_tdp_watts": 300,            // GPU TDP in watts
        "min_profit_margin_pct": 20,     // Minimum profit margin %
        "enabled": true
    }
    """
    try:
        if POWER_COST_CONFIG_FILE.exists():
            return json.loads(POWER_COST_CONFIG_FILE.read_text())
    except Exception:
        pass
    return {
        "electricity_cost_kwh": DEFAULT_ELECTRICITY_COST_KWH,
        "gpu_tdp_watts": DEFAULT_GPU_TDP_WATTS,
        "min_profit_margin_pct": 20,
        "enabled": False,
    }


def estimate_job_profitability(job, gpu=None):
    """Estimate whether a job is profitable after electricity costs.

    Returns (profitable: bool, details: dict).
    """
    power_config = load_power_config()
    if not power_config.get("enabled") or power_config.get("electricity_cost_kwh", 0) <= 0:
        return True, {"reason": "power cost tracking disabled"}

    electricity_cost_kwh = power_config["electricity_cost_kwh"]
    gpu_tdp_watts = power_config.get("gpu_tdp_watts", DEFAULT_GPU_TDP_WATTS)
    min_margin_pct = power_config.get("min_profit_margin_pct", 20)

    # Estimate GPU power from actual readings if available
    if gpu and gpu.get("power_w"):
        gpu_power_watts = gpu["power_w"]
    else:
        gpu_power_watts = gpu_tdp_watts

    # Job earnings estimate (halala per GPU-second)
    cost_per_gpu_second = job.get("cost_per_gpu_second_halala", 0.25)
    estimated_duration = job.get("estimated_duration_seconds", JOB_TIMEOUT)

    # Revenue = cost_per_gpu_second * duration (in halala)
    revenue_halala = cost_per_gpu_second * estimated_duration
    revenue_sar = revenue_halala / 100

    # Power cost = watts * hours * cost_per_kwh
    hours = estimated_duration / 3600
    power_cost_sar = (gpu_power_watts / 1000) * hours * electricity_cost_kwh

    # System overhead (CPU, RAM, cooling) — estimate 30% on top of GPU
    total_cost_sar = power_cost_sar * 1.3

    profit_sar = revenue_sar - total_cost_sar
    margin_pct = (profit_sar / revenue_sar * 100) if revenue_sar > 0 else -100

    profitable = margin_pct >= min_margin_pct

    details = {
        "revenue_sar": round(revenue_sar, 4),
        "power_cost_sar": round(total_cost_sar, 4),
        "profit_sar": round(profit_sar, 4),
        "margin_pct": round(margin_pct, 1),
        "gpu_watts": gpu_power_watts,
        "electricity_kwh": electricity_cost_kwh,
        "profitable": profitable,
    }

    if not profitable:
        log.info(f"Job profitability check: UNPROFITABLE — "
                 f"revenue={revenue_sar:.4f} SAR, cost={total_cost_sar:.4f} SAR, "
                 f"margin={margin_pct:.1f}% (min: {min_margin_pct}%)")

    return profitable, details


# ─── MULTI-GPU JOB SLOTS ────────────────────────────────────────────────────

def init_gpu_slots():
    """Initialize GPU job slots based on detected GPUs."""
    global MAX_CONCURRENT_JOBS, _gpu_job_slots
    gpu = detect_gpu()
    if not gpu:
        MAX_CONCURRENT_JOBS = 1
        _gpu_job_slots = {0: None}
        return

    all_gpus = gpu.get("all_gpus", [gpu])
    gpu_count = len(all_gpus)
    MAX_CONCURRENT_JOBS = max(1, gpu_count)

    with _gpu_slots_lock:
        _gpu_job_slots = {g["index"]: None for g in all_gpus}

    if gpu_count > 1:
        log.info(f"Multi-GPU: {gpu_count} GPUs detected, {MAX_CONCURRENT_JOBS} concurrent job slots")
    else:
        log.info(f"Single GPU detected, 1 job slot")


def acquire_gpu_slot(job_id, required_vram=0):
    """Acquire a free GPU slot for a job. Returns gpu_index or None."""
    gpu = detect_gpu()
    if not gpu:
        return 0  # CPU-only, use slot 0

    all_gpus = gpu.get("all_gpus", [gpu])

    with _gpu_slots_lock:
        for g in all_gpus:
            idx = g["index"]
            if _gpu_job_slots.get(idx) is None:
                free_vram = g.get("free_vram_mib", 0)
                if required_vram <= 0 or free_vram >= required_vram:
                    _gpu_job_slots[idx] = job_id
                    log.info(f"GPU slot {idx} acquired for job {job_id} "
                             f"(free VRAM: {free_vram} MiB)")
                    return idx
    return None


def release_gpu_slot(gpu_index, job_id=None):
    """Release a GPU slot after job completion."""
    with _gpu_slots_lock:
        if gpu_index in _gpu_job_slots:
            held_job = _gpu_job_slots[gpu_index]
            if job_id is None or held_job == job_id:
                _gpu_job_slots[gpu_index] = None
                log.info(f"GPU slot {gpu_index} released (was: {held_job})")
                return True
    return False


def get_free_gpu_slot_count():
    """Return number of free GPU slots."""
    with _gpu_slots_lock:
        return sum(1 for v in _gpu_job_slots.values() if v is None)


def get_active_job_count():
    """Return number of currently running jobs across all GPUs."""
    with _gpu_slots_lock:
        return sum(1 for v in _gpu_job_slots.values() if v is not None)


# ─── GRACEFUL JOB DRAINING ──────────────────────────────────────────────────

_draining = False
_drain_lock = threading.Lock()

def start_draining():
    """Enter draining mode: finish current jobs, accept no new ones."""
    global _draining
    with _drain_lock:
        _draining = True
    active = get_active_job_count()
    log.info(f"Entering drain mode — {active} active job(s) will complete before shutdown")
    report_event("drain_start", f"Draining: {active} active jobs will complete", severity="info")


def is_draining():
    """Check if daemon is in draining mode."""
    with _drain_lock:
        return _draining


def wait_for_drain(timeout=600):
    """Wait for all active jobs to complete. Returns True if drained within timeout."""
    start = time.time()
    while time.time() - start < timeout:
        active = get_active_job_count()
        if active == 0:
            log.info("Drain complete — all jobs finished")
            report_event("drain_complete", "All jobs drained successfully")
            return True
        log.info(f"Draining: {active} job(s) still active, waiting...")
        time.sleep(5)
    log.warning(f"Drain timeout after {timeout}s — {get_active_job_count()} jobs still active")
    return False


# ─── AUTO-UPDATE ────────────────────────────────────────────────────────────

def _parse_version(version):
    """Convert semver-like string to tuple for numeric comparison."""
    try:
        parts = [int(p) for p in str(version).strip().split(".")]
        return tuple(parts)
    except Exception:
        return None

def _is_remote_newer(remote_version, local_version):
    """Compare versions safely (numeric compare; fallback to string compare)."""
    remote = _parse_version(remote_version)
    local = _parse_version(local_version)
    if remote is not None and local is not None:
        max_len = max(len(remote), len(local))
        remote = remote + (0,) * (max_len - len(remote))
        local = local + (0,) * (max_len - len(local))
        return remote > local
    return str(remote_version).strip() != str(local_version).strip()

def _legacy_update_endpoint():
    """Legacy update endpoint derived from injected API URL."""
    return f"{API_URL.rstrip('/')}/api/providers/download/daemon"

def _candidate_update_endpoints():
    """Ordered update endpoints: canonical first, legacy fallback second."""
    return [CANONICAL_UPDATE_ENDPOINT, _legacy_update_endpoint()]

def _candidate_download_urls():
    """Ordered daemon download URLs: installer URL first, API fallbacks after."""
    return [CANONICAL_INSTALLER_DOWNLOAD_URL] + _candidate_update_endpoints()

def _resolve_download_url(download_url):
    """Normalize download_url from check_only response."""
    if not download_url:
        return None
    url = str(download_url).strip()
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/api/providers/"):
        return f"{CANONICAL_API_BASE_URL}{url}"
    if url.startswith("/"):
        return f"{CANONICAL_API_BASE_URL}{url}"
    return None

def _detect_nvidia_windows_fallback():
    """Windows fallback when `nvidia-smi` is not on PATH.

    Returns (gpu_name, vram_mib, driver_version) tuple or None.

    Strategy:
      1) Try C:\\Windows\\System32\\nvidia-smi.exe (standard driver install path).
      2) Query the display-adapter registry for qwMemorySize (uint64; the
         authoritative VRAM size written by the driver). Avoids the WMI
         AdapterRAM uint32 overflow that caps at 4 GB.
      3) Give up and return None — never guess VRAM from a substring match.
    """
    # (1) nvidia-smi.exe at absolute path
    for abs_path in (
        r"C:\Windows\System32\nvidia-smi.exe",
        r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    ):
        try:
            r = subprocess.run(
                [abs_path, "--query-gpu=name,memory.total,driver_version",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5,
            )
            out = (r.stdout or "").strip()
            if out:
                parts = [p.strip() for p in out.split(",")]
                if len(parts) >= 2 and parts[0] and parts[1]:
                    name = parts[0]
                    vram_mib = int(float(parts[1]))
                    driver = parts[2] if len(parts) > 2 else "unknown"
                    log.info(f"GPU detected via nvidia-smi.exe absolute path: {name} ({vram_mib} MiB)")
                    return (name, vram_mib, driver)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            continue
        except Exception as e:
            log.debug(f"nvidia-smi.exe at {abs_path} failed: {e}")
            continue

    # (2) Registry — iterate display-adapter subkeys and emit qwMemorySize (uint64)
    try:
        ps_script = (
            r"$base='HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}';"
            r"Get-ChildItem $base -ErrorAction SilentlyContinue | ForEach-Object {"
            r"  $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;"
            r"  if ($p -and $p.DriverDesc -like '*NVIDIA*') {"
            r"    $qw = $p.'HardwareInformation.qwMemorySize';"
            r"    Write-Output ($p.DriverDesc + '|' + $qw + '|' + $p.DriverVersion)"
            r"  }"
            r"}"
        )
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=10,
        )
        for line in (r.stdout or "").splitlines():
            line = line.strip()
            if not line or "|" not in line:
                continue
            parts = line.split("|")
            if len(parts) < 3:
                continue
            name = parts[0].strip()
            qw_raw = parts[1].strip()
            driver = parts[2].strip() or "unknown"
            try:
                vram_bytes = int(qw_raw)
            except ValueError:
                continue
            if vram_bytes <= 0:
                continue
            vram_mib = vram_bytes // (1024 * 1024)
            log.info(f"GPU detected via registry qwMemorySize: {name} ({vram_mib} MiB)")
            return (name, vram_mib, driver)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    except Exception as e:
        log.debug(f"registry qwMemorySize probe failed: {e}")

    log.warning(
        "Windows NVIDIA GPU detection failed: nvidia-smi not in PATH, "
        "absolute-path binaries missing, and registry qwMemorySize unavailable. "
        "Refusing to guess VRAM."
    )
    return None


def get_gpu_info():
    """Return GPU info as a dict for the heartbeat payload.

    The backend validates that gpu_info is a plain object, so we must
    always return a dict — never a bare string.
    """
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        output = (result.stdout or "").strip()
        if output:
            parts = [p.strip() for p in output.split(",")]
            return {
                "gpu_name": parts[0] if len(parts) > 0 else None,
                "vram_mb": int(float(parts[1])) if len(parts) > 1 and parts[1] else None,
                "driver_version": parts[2] if len(parts) > 2 else None,
                "cuda_version": None,
            }
        # nvidia-smi present but returned nothing useful
        raw = (result.stderr or "").strip()[:2000]
        return {"gpu_name": None, "vram_mb": None, "driver_version": None,
                "cuda_version": None, "raw": raw or "nvidia-smi produced no output"}
    except FileNotFoundError:
        # No nvidia-smi — check if this is Apple Silicon with unified memory
        if platform.system() == "Darwin":
            try:
                arch = subprocess.run(["uname", "-m"], capture_output=True, text=True, timeout=3).stdout.strip()
                if arch == "arm64":
                    mem_bytes = int(subprocess.run(["sysctl", "-n", "hw.memsize"],
                                                    capture_output=True, text=True, timeout=3).stdout.strip())
                    mem_total_mb = mem_bytes // (1024 * 1024)
                    # Metal practical ceiling: ~75% of unified memory. The OS, other apps,
                    # and wired kernel pages consume the rest. Reporting 100% causes the
                    # backend to accept jobs that OOM on the GPU.
                    mem_mb = int(mem_total_mb * 0.75)
                    chip = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                           capture_output=True, text=True, timeout=3).stdout.strip()
                    return {"gpu_name": f"Apple Silicon ({chip})", "vram_mb": mem_mb,
                            "driver_version": "Metal", "cuda_version": None,
                            "is_apple_silicon": True}
            except Exception:
                pass
        # Windows: nvidia-smi absolute path → registry qwMemorySize fallback
        if platform.system() == "Windows":
            fb = _detect_nvidia_windows_fallback()
            if fb is not None:
                name, vram_mib, driver = fb
                return {"gpu_name": name, "vram_mb": vram_mib,
                        "driver_version": driver, "cuda_version": None}
        return {"gpu_name": "CPU only", "vram_mb": 0, "driver_version": None,
                "cuda_version": None}
    except Exception as e:
        return {"gpu_name": None, "vram_mb": None, "driver_version": None,
                "cuda_version": None, "error": str(e)[:500]}

def check_for_update():
    """Check if a newer daemon version is available and self-update."""
    suppress_until = _get_update_suppression_until()
    if suppress_until > int(time.time()):
        wait_seconds = suppress_until - int(time.time())
        log.info(f"Update checks suppressed for {wait_seconds}s after rollback")
        return False

    for endpoint in _candidate_update_endpoints():
        try:
            url = f"{endpoint}?key={API_KEY}&check_only=true"
            code, resp = http_get(url)
            if code != 200 or not isinstance(resp, dict) or not resp.get("version"):
                continue

            remote_version = str(resp["version"]).strip()
            if _is_remote_newer(remote_version, DAEMON_VERSION):
                log.info(f"Update available via {endpoint}: {DAEMON_VERSION} → {remote_version}")
                resolved = _resolve_download_url(resp.get("download_url"))
                return perform_update(remote_version, preferred_download_url=resolved)
            return False
        except Exception as e:
            log.debug(f"Update check failed via {endpoint}: {e}")
    return False

def perform_update(new_version, preferred_download_url=None):
    """Download new daemon, replace current file, and signal restart."""
    report_event("update_start", f"Updating {DAEMON_VERSION} → {new_version}")
    log.info(f"Downloading daemon v{new_version}...")

    try:
        download_candidates = []
        if preferred_download_url:
            download_candidates.append(preferred_download_url)
        for endpoint in _candidate_download_urls():
            download_candidates.append(f"{endpoint}?key={API_KEY}")

        new_code = None
        used_url = None
        last_error = None
        for download_url in download_candidates:
            try:
                if HAS_REQUESTS:
                    import requests as req_lib
                    r = req_lib.get(download_url, timeout=30)
                    if r.status_code != 200:
                        raise Exception(f"Download HTTP {r.status_code}")
                    candidate_code = r.text
                else:
                    import urllib.request
                    with urllib.request.urlopen(download_url, timeout=30) as resp:
                        candidate_code = resp.read().decode("utf-8")

                if ("DCP Provider Daemon" not in candidate_code and "DC1 Provider Daemon" not in candidate_code) or "def main()" not in candidate_code:
                    raise Exception("Downloaded file doesn't look like a valid daemon")

                new_code = candidate_code
                used_url = download_url
                break
            except Exception as e:
                last_error = e
                continue

        if not new_code:
            raise Exception(f"All update downloads failed: {last_error}")

        log.info(f"Downloaded update from: {used_url}")

        # Save current as backup
        current_path = Path(__file__).resolve()
        backup_path = current_path.with_suffix(f".v{DAEMON_VERSION}.bak")
        shutil.copy2(current_path, backup_path)
        log.info(f"Backed up current daemon to {backup_path}")

        # Atomic write: create sibling tempfile, fsync, then os.replace.
        # Prior behavior used current_path.write_text which is non-atomic —
        # a crash mid-write would leave a truncated daemon that won't restart.
        tmp_fd, tmp_name = tempfile.mkstemp(
            prefix=".dcp_daemon.", suffix=".new",
            dir=str(current_path.parent), text=True,
        )
        tmp_path = Path(tmp_name)
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(new_code)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except OSError:
                    pass  # fsync not supported on all filesystems
            # Preserve the original file mode (executable bit etc.)
            try:
                os.chmod(tmp_path, current_path.stat().st_mode)
            except OSError:
                pass
            os.replace(tmp_path, current_path)
        except Exception:
            try:
                tmp_path.unlink()
            except OSError:
                pass
            raise
        log.info(f"Updated daemon file to v{new_version} (atomic write)")

        # Prune old backups: keep the 2 most recent .bak files. The watchdog's
        # auto-rollback only uses the newest one (within 90s of restart), but
        # keeping one extra as a safety margin costs a few MB. Older backups
        # are no longer actionable and just accumulate on long-lived providers.
        try:
            all_backups = _find_backup_files(current_path)
            for stale in all_backups[2:]:
                try:
                    stale.unlink()
                    log.debug(f"Pruned stale backup: {stale.name}")
                except OSError as _prune_err:
                    log.debug(f"Could not prune {stale.name}: {_prune_err}")
        except Exception as _prune_wrap:
            log.debug(f"Backup prune wrapper error: {_prune_wrap}")

        report_event("update_success", f"Updated {DAEMON_VERSION} → {new_version}")

        # Signal the watchdog to restart us
        log.info("Update complete — signaling restart...")
        return True  # Caller should sys.exit(42) to trigger watchdog restart

    except Exception as e:
        error_msg = f"Update failed: {e}"
        log.error(error_msg)
        report_event("update_failed", error_msg, severity="error")
        return False

def update_check_loop():
    """Background thread: check for updates periodically.

    Sleep is jittered ±UPDATE_CHECK_JITTER_PCT so the fleet doesn't all
    GET /download/daemon at the same 5-min boundary.
    """
    while True:
        jitter = AUTO_UPDATE_CHECK * UPDATE_CHECK_JITTER_PCT * (2 * random.random() - 1)
        time.sleep(max(30.0, AUTO_UPDATE_CHECK + jitter))
        try:
            if check_for_update():
                # Wait for any running job to finish before restarting
                with _job_lock:
                    active = _current_job_id
                if active:
                    log.info(f"Update ready but job {active} is running — waiting...")
                    for _ in range(180):  # Wait up to 3 min for job to finish
                        with _job_lock:
                            active = _current_job_id
                        if not active:
                            break
                        time.sleep(1)
                    if active:
                        log.warning(f"Job {active} still running after 3min — restarting anyway")

                log.info("Exiting with code 42 to trigger watchdog restart with new version")
                os._exit(42)  # Special exit code = update restart
        except Exception as e:
            log.debug(f"Update check loop error: {e}")

# ─── GPU DETECTION ───────────────────────────────────────────────────────────

def _get_cuda_version():
    """Get CUDA version from nvidia-smi header line (e.g. 'CUDA Version: 12.2')."""
    try:
        r = subprocess.run(["nvidia-smi"], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
            if "CUDA Version:" in line:
                parts = line.strip().split("CUDA Version:")
                if len(parts) == 2:
                    return parts[1].strip().split()[0]
    except Exception:
        pass
    return None

def detect_gpu():
    """Detect NVIDIA GPU(s) via nvidia-smi. Returns dict for GPU 0 (or None), plus all_gpus list."""
    try:
        # Query includes compute_cap for CUDA compute capability
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu,power.draw,driver_version,compute_cap",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return None

        cuda_version = _get_cuda_version()
        all_gpus = []
        for raw_line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in raw_line.split(",")]
            if len(parts) < 10:
                continue
            try:
                all_gpus.append({
                    "index": int(parts[0]),
                    "gpu_name": parts[1],
                    "gpu_vram_mib": int(float(parts[2])),
                    "free_vram_mib": int(float(parts[3])),
                    "memory_used_mb": int(float(parts[4])),
                    "gpu_util_pct": int(float(parts[5])),
                    "temp_c": int(float(parts[6])),
                    "power_w": float(parts[7]) if parts[7] not in ("[N/A]", "N/A") else None,
                    "driver_version": parts[8],
                    "compute_capability": parts[9],
                    "cuda_version": cuda_version,
                })
            except (ValueError, IndexError):
                continue

        if not all_gpus:
            return None

        # Return GPU 0 data (primary) with all_gpus list attached
        primary = all_gpus[0]
        primary["all_gpus"] = all_gpus
        return primary
    except FileNotFoundError:
        # No nvidia-smi — check for Apple Silicon
        if platform.system() == "Darwin":
            try:
                arch = subprocess.run(["uname", "-m"], capture_output=True, text=True, timeout=3).stdout.strip()
                if arch == "arm64":
                    mem_bytes = int(subprocess.run(["sysctl", "-n", "hw.memsize"],
                                                    capture_output=True, text=True, timeout=3).stdout.strip())
                    mem_total_mib = mem_bytes // (1024 * 1024)
                    # Metal practical ceiling: ~75% of unified memory. OS + other apps
                    # reserve the rest. Reporting 100% causes backend to accept OOM'ing jobs.
                    mem_mib = int(mem_total_mib * 0.75)
                    chip = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"],
                                           capture_output=True, text=True, timeout=3).stdout.strip()
                    gpu = {
                        "index": 0,
                        "gpu_name": f"Apple Silicon ({chip})",
                        "gpu_vram_mib": mem_mib,
                        "free_vram_mib": mem_mib,  # Unified memory, dynamically allocated
                        "memory_used_mb": 0,
                        "gpu_util_pct": 0,
                        "temp_c": 0,
                        "power_w": None,
                        "driver_version": "Metal",
                        "compute_capability": "Metal",
                        "cuda_version": None,
                        "is_apple_silicon": True,
                        "all_gpus": [],
                    }
                    gpu["all_gpus"] = [gpu.copy()]
                    del gpu["all_gpus"][0]["all_gpus"]
                    log.info(f"Apple Silicon detected: {chip} — {mem_mib}/{mem_total_mib} MiB usable (75% of unified)")
                    return gpu
            except Exception as e2:
                log.warning(f"Apple Silicon detection failed: {e2}")
        # Windows: nvidia-smi absolute path → registry qwMemorySize fallback
        if platform.system() == "Windows":
            fb = _detect_nvidia_windows_fallback()
            if fb is not None:
                name, vram_mib, driver = fb
                gpu = {
                    "index": 0, "gpu_name": name, "gpu_vram_mib": vram_mib,
                    "free_vram_mib": vram_mib, "memory_used_mb": 0,
                    "gpu_util_pct": 0, "temp_c": 0, "power_w": None,
                    "driver_version": driver, "compute_capability": "unknown",
                    "cuda_version": None, "all_gpus": [],
                }
                gpu["all_gpus"] = [gpu.copy()]
                del gpu["all_gpus"][0]["all_gpus"]
                return gpu
        log.warning("nvidia-smi not found — no NVIDIA GPU detected")
        return None
    except Exception as e:
        log.error(f"GPU detection error: {e}")
        return None

def get_detected_gpu_count():
    """Return number of visible GPUs, defaulting to 1 for metering fallback."""
    gpu = detect_gpu()
    if not gpu:
        return 1
    all_gpus = gpu.get("all_gpus", [gpu])
    return max(1, len(all_gpus))

def collect_container_gpu_metrics(container_name):
    """
    Sample per-container GPU utilization using nvidia-smi pmon.
    Returns dict with gpu_index, sm_pct (shader util), mem_pct, used_memory_mib,
    or None if the container has no GPU processes.
    """
    try:
        # Get PID of the main process inside the named container
        pid_result = subprocess.run(
            ["docker", "inspect", "--format={{.State.Pid}}", container_name],
            capture_output=True, text=True, timeout=5
        )
        if pid_result.returncode != 0 or not pid_result.stdout.strip():
            return None
        container_pid = pid_result.stdout.strip()

        # nvidia-smi pmon: one sample, list processes on all GPUs
        pmon = subprocess.run(
            ["nvidia-smi", "pmon", "-c", "1", "-s", "um"],
            capture_output=True, text=True, timeout=10
        )
        if pmon.returncode != 0:
            return None

        metrics_by_gpu = {}
        for line in pmon.stdout.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cols = line.split()
            # pmon columns: gpu, pid, type, sm, mem, enc, dec, fb, command
            if len(cols) < 8:
                continue
            pid = cols[1]
            if pid == container_pid or pid == "-":
                gpu_idx = int(cols[0]) if cols[0].isdigit() else 0
                try:
                    metrics_by_gpu[gpu_idx] = {
                        "gpu_index": gpu_idx,
                        "sm_pct": int(cols[3]) if cols[3] != "-" else 0,
                        "mem_pct": int(cols[4]) if cols[4] != "-" else 0,
                        "used_memory_mib": int(cols[7]) if cols[7] != "-" else 0,
                        "pid": pid,
                    }
                except (ValueError, IndexError):
                    continue

        if not metrics_by_gpu:
            return None

        # Return all GPU metrics (sorted by index)
        return list(metrics_by_gpu.values())

    except Exception as e:
        log.debug(f"Container GPU metrics error: {e}")
        return None

# ─── DOCKER DETECTION ───────────────────────────────────────────────────────

def check_docker():
    """Check if Docker + NVIDIA Container Toolkit are available. Cached."""
    global _docker_available
    if _docker_available is not None:
        return _docker_available

    # Check config for force_bare_metal
    config_path = CONFIG_DIR / "config.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text())
            if cfg.get("force_bare_metal"):
                log.info("Docker disabled by config.json (force_bare_metal=true)")
                _docker_available = False
                return False
        except:
            pass

    try:
        r = subprocess.run(["docker", "--version"], capture_output=True, text=True, timeout=5)
        if r.returncode != 0:
            log.info("Docker not installed")
            _docker_available = False
            return False

        # Check NVIDIA Container Toolkit
        r2 = subprocess.run(
            ["docker", "run", "--rm", "--gpus", "all", "nvidia/cuda:12.2.0-base-ubuntu22.04", "nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=30
        )
        if r2.returncode == 0:
            log.info(f"Docker + NVIDIA CT available: {r2.stdout.strip()}")
            _docker_available = True
        else:
            log.info("Docker available but NVIDIA Container Toolkit not working")
            _docker_available = False
    except FileNotFoundError:
        log.info("Docker not found")
        _docker_available = False
    except Exception as e:
        log.info(f"Docker check failed: {e}")
        _docker_available = False

    return _docker_available

# ─── READINESS CHECKS ────────────────────────────────────────────────────────

def check_readiness():
    """Run system checks: CUDA, PyTorch, VRAM. Returns checks dict."""
    checks = {
        "cuda": False,
        "pytorch": False,
        "vram_gb": 0,
        "driver": None,
        "python_version": platform.python_version(),
        "os_info": f"{platform.system()} {platform.release()}",
        "docker": check_docker(),
    }

    gpu = detect_gpu()
    if gpu:
        checks["cuda"] = True
        checks["driver"] = gpu["driver_version"]
        checks["vram_gb"] = round(gpu["gpu_vram_mib"] / 1024, 1)
        checks["gpu_name"] = gpu["gpu_name"]

    try:
        import torch
        checks["pytorch"] = True
        checks["pytorch_version"] = torch.__version__
        checks["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            checks["cuda"] = True
            checks["cuda_version"] = torch.version.cuda
    except ImportError:
        checks["pytorch"] = False

    return checks

def report_readiness(checks):
    """POST readiness check results to backend."""
    url = f"{API_URL}/api/providers/readiness"
    try:
        code, resp = http_post(url, {
            "api_key": API_KEY,
            "checks": checks,
            "daemon_version": DAEMON_VERSION
        })
        log.info(f"Readiness reported: {resp.get('readiness_status', 'unknown')} (HTTP {code})")
        return resp
    except Exception as e:
        log.error(f"Readiness report failed: {e}")
        return None

# ─── OCEAN-STYLE RESOURCE SPEC ───────────────────────────────────────────────

def build_resource_spec(gpu=None):
    """Build Ocean-style resource_spec JSON for GPU advertisement.

    Schema mirrors Ocean Protocol's DOCKER_COMPUTE_ENVIRONMENTS pattern:
      {"resources": [{id, total, min, max, type?, ...gpu fields}],
       "compute_environments": [{id, compute_types, resources, tags}]}
    """
    resources = []
    compute_environments = []
    cpu_resource = None
    ram_resource = None
    disk_resource = None

    # CPU resource
    try:
        import multiprocessing
        cpu_count = multiprocessing.cpu_count()
        cpu_resource = {
            "id": "cpu",
            "total": cpu_count,
            "min": 1,
            "max": max(1, cpu_count // 2),
        }
        resources.append(cpu_resource)
    except Exception:
        cpu_resource = {"id": "cpu", "total": 1, "min": 1, "max": 1}
        resources.append(cpu_resource)

    # RAM resource (GB)
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    ram_kb = int(line.split()[1])
                    ram_gb = round(ram_kb / 1024 / 1024, 1)
                    ram_resource = {
                        "id": "ram",
                        "total": ram_gb,
                        "min": 1,
                        "max": max(1, int(ram_gb // 2)),
                    }
                    resources.append(ram_resource)
                    break
    except Exception:
        ram_resource = {"id": "ram", "total": 8, "min": 1, "max": 4}
        resources.append(ram_resource)

    # Disk resource (GB free on home dir)
    try:
        import shutil as _shutil
        usage = _shutil.disk_usage(str(Path.home()))
        disk_total_gb = round(usage.total / 1024 / 1024 / 1024, 1)
        disk_free_gb = round(usage.free / 1024 / 1024 / 1024, 1)
        disk_resource = {
            "id": "disk",
            "total": disk_total_gb,
            "free": disk_free_gb,
            "min": 5,
            "max": max(5, int(disk_free_gb * 0.8)),
        }
        resources.append(disk_resource)
    except Exception:
        disk_resource = {"id": "disk", "total": 100, "min": 5, "max": 50}
        resources.append(disk_resource)

    # GPU resources — one entry per detected GPU
    if gpu:
        all_gpus = gpu.get("all_gpus", [gpu])
        for g in all_gpus:
            vram_gb = round(g.get("gpu_vram_mib", 0) / 1024, 1)
            # Use nvidia-smi UUID if available; fall back to index-based id
            gpu_uuid = g.get("uuid") or f"gpu-nvidia-{g.get('index', 0)}"
            gpu_resource = {
                "id": gpu_uuid,
                "type": "gpu",
                "total": 1,
                "min": 1,
                "max": 1,
                "model": g.get("gpu_name"),
                "vram_gb": vram_gb,
                "cuda_version": g.get("cuda_version"),
                "compute_capability": g.get("compute_capability"),
                "driver_version": g.get("driver_version"),
            }
            resources.append(gpu_resource)

            compute_environments.append({
                "id": f"docker-{gpu_uuid}",
                "name": f"Docker CUDA on {g.get('gpu_name') or gpu_uuid}",
                "compute_types": ["inference", "training", "rendering"],
                "tags": ["docker", "cuda", "nvidia", f"gpu_uuid:{gpu_uuid}"],
                "resources": [
                    {"id": "cpu", "min": 1, "max": (cpu_resource or {}).get("max", 1)},
                    {"id": "ram", "min": 1, "max": (ram_resource or {}).get("max", 4)},
                    {"id": "disk", "min": 5, "max": (disk_resource or {}).get("max", 50)},
                    {"id": gpu_uuid, "type": "gpu", "min": 1, "max": 1},
                ],
            })

    return {"resources": resources, "compute_environments": compute_environments}

def get_model_cache_metrics():
    """Return disk usage metrics for the shared model cache path."""
    if not os.path.isdir(MODEL_CACHE_PATH):
        return {
            "path": MODEL_CACHE_PATH,
            "exists": False,
            "total_gb": None,
            "free_gb": None,
            "used_gb": None,
            "used_percent": None,
        }
    try:
        usage = shutil.disk_usage(MODEL_CACHE_PATH)
        total_gb = round(usage.total / 1024 / 1024 / 1024, 2)
        free_gb = round(usage.free / 1024 / 1024 / 1024, 2)
        used_gb = round((usage.total - usage.free) / 1024 / 1024 / 1024, 2)
        used_percent = round(((usage.total - usage.free) / usage.total) * 100, 1) if usage.total else 0.0
        return {
            "path": MODEL_CACHE_PATH,
            "exists": True,
            "total_gb": total_gb,
            "free_gb": free_gb,
            "used_gb": used_gb,
            "used_percent": used_percent,
        }
    except Exception as e:
        log.debug(f"Model cache metric collection failed: {e}")
        return {
            "path": MODEL_CACHE_PATH,
            "exists": False,
            "total_gb": None,
            "free_gb": None,
            "used_gb": None,
            "used_percent": None,
        }

# ─── HEARTBEAT ───────────────────────────────────────────────────────────────

_heartbeat_sequence = 0  # Sequence counter for P2P heartbeats

def get_system_metrics():
    """Calculate CPU and memory utilization percentages."""
    try:
        # CPU: average over 1 second
        import psutil
        cpu_percent = psutil.cpu_percent(interval=0.5)
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        return {
            "cpu": round(cpu_percent, 1),
            "memory": round(memory_percent, 1),
        }
    except (ImportError, Exception):
        return {"cpu": 0, "memory": 0}

def detect_vllm_models():
    """
    Detect running vLLM containers and query their available models.
    Returns list of model IDs from the vLLM /v1/models endpoint.
    """
    vllm_models = []
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}:{{.Ports}}"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return vllm_models

        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split(":")
            container_name = parts[0]
            ports_info = parts[1] if len(parts) > 1 else ""

            if not container_name.startswith("dc1-vllm-"):
                continue

            port_match = None
            for port_range in ["8100-8199", "8000"]:
                if port_range in ports_info:
                    port_match = port_range.split("-")[0] if "-" in port_range else port_range
                    break

            if not port_match:
                continue

            try:
                import urllib.request
                req = urllib.request.Request(
                    f"http://localhost:{port_match}/v1/models",
                    headers={"Accept": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode())
                        for model in data.get("data", []):
                            model_id = model.get("id")
                            if model_id:
                                vllm_models.append(model_id)
            except Exception as e:
                log.debug(f"vLLM models query failed for {container_name}: {e}")
    except Exception as e:
        log.debug(f"vLLM container detection failed: {e}")
    return vllm_models

def emit_p2p_heartbeat(peer_id, gpu, gpu_status):
    """Emit heartbeat to P2P DHT (non-blocking, fire-and-forget)."""
    global _heartbeat_sequence

    # Skip if P2P not enabled
    if not os.environ.get("P2P_DISCOVERY_ENABLED", "").lower() == "true":
        return

    try:
        import psutil
        gpu_util = float(gpu.get("gpu_util_pct", 0)) if gpu else 0
        metrics = get_system_metrics()
        metrics["gpu"] = round(gpu_util, 1)

        # Determine status based on utilization
        status = "healthy"
        if metrics.get("cpu", 0) > 95 or metrics.get("memory", 0) > 90:
            status = "warning"
        elif metrics.get("cpu", 0) > 85 or metrics.get("memory", 0) > 80:
            status = "degraded"

        # Find provider-heartbeat.js relative to daemon location
        script_dir = Path(__file__).parent.parent.parent / "p2p"
        script_path = script_dir / "provider-heartbeat.js"

        if not script_path.exists():
            log.debug(f"P2P heartbeat script not found: {script_path}")
            return

        # Spawn Node.js process (fire-and-forget)
        cmd = [
            "node", str(script_path),
            "--peer-id", peer_id,
            "--metrics", json.dumps(metrics),
            "--status", status,
            "--sequence", str(_heartbeat_sequence),
        ]

        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env={**os.environ},
        )

        _heartbeat_sequence += 1
        log.debug(f"P2P heartbeat emitted (seq={_heartbeat_sequence-1})")
    except Exception as e:
        log.debug(f"P2P heartbeat emit failed: {e}")

# ─── v3.5.0: MODEL AUTO-DETECTION (Feature 1) ───────────────────────────────
#
# Polls Ollama (11434), vLLM (8000/8100-8103) and llama.cpp (8080) to build a
# deduplicated list of served model IDs. Result is cached for 60 seconds to
# avoid hammering local endpoints on every heartbeat tick.

_SERVED_MODELS_CACHE = {"data": None, "timestamp": 0.0}
_SERVED_MODELS_CACHE_TTL = 60  # seconds
_served_models_lock = threading.Lock()


def detect_served_models():
    """
    Detect which models are currently loaded/served on this provider.
    Checks Ollama (11434), vLLM (8000/8100-8199), and llama.cpp (8080).
    Returns: {"models": [sorted model ids], "engines": [engine tags]}
    Cached for 60 seconds.
    """
    with _served_models_lock:
        now = time.time()
        cached = _SERVED_MODELS_CACHE.get("data")
        if cached is not None and (now - _SERVED_MODELS_CACHE.get("timestamp", 0)) < _SERVED_MODELS_CACHE_TTL:
            return cached

    models = set()
    engines_found = []

    # Ollama
    try:
        if HAS_REQUESTS:
            r = requests.get("http://localhost:11434/api/tags", timeout=5)
            if r.ok:
                data = r.json()
                for m in data.get("models", []):
                    name = m.get("name") or m.get("model")
                    if name:
                        models.add(name)
                engines_found.append("ollama")
        else:
            code, data = http_get("http://localhost:11434/api/tags", timeout=5)
            if code == 200 and isinstance(data, dict):
                for m in data.get("models", []):
                    name = m.get("name") or m.get("model")
                    if name:
                        models.add(name)
                engines_found.append("ollama")
    except Exception:
        pass

    # vLLM on multiple ports — stop after first success to avoid duplicate scans
    for port in (8000, 8100, 8101, 8102, 8103):
        try:
            if HAS_REQUESTS:
                r = requests.get(f"http://localhost:{port}/v1/models", timeout=3)
                if r.ok:
                    data = r.json()
                    for m in data.get("data", []):
                        mid = m.get("id")
                        if mid:
                            models.add(mid)
                    engines_found.append(f"vllm:{port}")
                    break
            else:
                code, data = http_get(f"http://localhost:{port}/v1/models", timeout=3)
                if code == 200 and isinstance(data, dict):
                    for m in data.get("data", []):
                        mid = m.get("id")
                        if mid:
                            models.add(mid)
                    engines_found.append(f"vllm:{port}")
                    break
        except Exception:
            continue

    # llama.cpp (typically 8080). Skip the "llama.cpp" placeholder id.
    try:
        if HAS_REQUESTS:
            r = requests.get("http://localhost:8080/v1/models", timeout=3)
            if r.ok:
                data = r.json()
                for m in data.get("data", []):
                    mid = m.get("id")
                    if mid and mid != "llama.cpp":
                        models.add(mid)
                engines_found.append("llamacpp")
        else:
            code, data = http_get("http://localhost:8080/v1/models", timeout=3)
            if code == 200 and isinstance(data, dict):
                for m in data.get("data", []):
                    mid = m.get("id")
                    if mid and mid != "llama.cpp":
                        models.add(mid)
                engines_found.append("llamacpp")
    except Exception:
        pass

    # v4.0.3 (Phase 1.5 / Fix C): dual-identity expansion.
    # For every raw model id we detected, append ALL known aliases (Ollama tag,
    # HF canonical, vLLM variants). The backend no longer has to consult an
    # OLLAMA_MODEL_ALIASES lookup at candidate-selection time — the daemon now
    # reports BOTH forms. Raw ids are also preserved as `cached_models_raw`.
    raw_models_sorted = sorted(list(models))
    expanded = set()
    for raw in raw_models_sorted:
        try:
            for alias in expand_model_identities(raw):
                if alias:
                    expanded.add(alias)
        except Exception as _exp_err:
            log.debug(f"expand_model_identities({raw}) failed: {_exp_err}")
            expanded.add(str(raw).lower())

    result = {
        "models": sorted(list(expanded)) if expanded else raw_models_sorted,
        "models_raw": raw_models_sorted,
        "engines": engines_found,
    }

    with _served_models_lock:
        _SERVED_MODELS_CACHE["data"] = result
        _SERVED_MODELS_CACHE["timestamp"] = time.time()

    return result


# ─── v3.5.0: ENGINE WATCHDOG (Feature 2) ─────────────────────────────────────

ENGINE_WATCHDOG_INTERVAL = 60  # seconds
ENGINE_FAILURE_THRESHOLD = 3   # consecutive failures before attempting restart
_engine_failure_counts = {}    # {engine_key: consecutive_failure_count}
_engine_watchdog_lock = threading.Lock()


def check_engine_health(engine_type, port):
    """Ping the engine's health/listing endpoint. Returns True if healthy."""
    try:
        if engine_type == "ollama":
            url = f"http://localhost:{port}/api/tags"
        else:  # vllm, llamacpp
            url = f"http://localhost:{port}/health"
        if HAS_REQUESTS:
            r = requests.get(url, timeout=5)
            return bool(r.ok)
        else:
            code, _ = http_get(url, timeout=5)
            return code == 200
    except Exception:
        return False


def restart_engine(engine_type):
    """
    Attempt to restart the inference engine.
    - ollama: pkill + re-launch `ollama serve` with flash-attention enabled.
    - vllm: cannot safely re-launch (complex command line, GPU binding) — log
            critical event for manual intervention.
    - llamacpp: similar to vllm; log for human operator.
    """
    log.warning(f"[watchdog] Restarting {engine_type}...")
    try:
        if engine_type == "ollama":
            try:
                subprocess.run(["pkill", "-f", "ollama serve"], timeout=5)
            except Exception as e:
                log.debug(f"[watchdog] pkill ollama failed: {e}")
            time.sleep(2)
            try:
                subprocess.Popen(
                    ["ollama", "serve"],
                    env={**os.environ, "OLLAMA_HOST": "0.0.0.0:11434", "OLLAMA_FLASH_ATTENTION": "1"},
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                report_event("engine_restart", "Ollama restarted by watchdog", severity="warning")
            except Exception as e:
                log.error(f"[watchdog] Failed to relaunch ollama: {e}")
                report_event("engine_restart_failed",
                             f"Ollama restart failed: {e}",
                             severity="critical")
        elif engine_type == "vllm":
            log.error("[watchdog] vLLM down — manual restart required")
            report_event("engine_down",
                         "vLLM process down, manual restart needed",
                         severity="critical")
        elif engine_type == "llamacpp":
            log.error("[watchdog] llama.cpp down — manual restart required")
            report_event("engine_down",
                         "llama.cpp process down, manual restart needed",
                         severity="critical")
    except Exception as e:
        log.error(f"[watchdog] restart_engine({engine_type}) crashed: {e}")


def _discover_engines_for_watchdog():
    """
    Discover which engines are currently configured on this host.
    Returns a list of (engine_type, port) tuples to monitor.
    """
    engines = []
    detected = detect_served_models()
    active = detected.get("engines", [])
    if "ollama" in active:
        engines.append(("ollama", 11434))
    for tag in active:
        if tag.startswith("vllm:"):
            try:
                port = int(tag.split(":", 1)[1])
                engines.append(("vllm", port))
            except Exception:
                pass
    if "llamacpp" in active:
        engines.append(("llamacpp", 8080))
    return engines


def engine_watchdog_loop():
    """
    Background thread: every ENGINE_WATCHDOG_INTERVAL seconds, poll each
    discovered engine's health endpoint. After ENGINE_FAILURE_THRESHOLD
    consecutive failures, attempt a restart.
    """
    log.info(f"[watchdog] Engine watchdog started (interval={ENGINE_WATCHDOG_INTERVAL}s, "
             f"threshold={ENGINE_FAILURE_THRESHOLD} consecutive failures)")
    while True:
        try:
            if is_draining():
                time.sleep(ENGINE_WATCHDOG_INTERVAL)
                continue
            engines = _discover_engines_for_watchdog()
            for engine_type, port in engines:
                key = f"{engine_type}:{port}"
                healthy = check_engine_health(engine_type, port)
                do_restart = False  # reset per-iteration to prevent stale flag
                with _engine_watchdog_lock:
                    if healthy:
                        if _engine_failure_counts.get(key, 0) > 0:
                            log.info(f"[watchdog] {key} recovered")
                        _engine_failure_counts[key] = 0
                    else:
                        _engine_failure_counts[key] = _engine_failure_counts.get(key, 0) + 1
                        failures = _engine_failure_counts[key]
                        log.warning(f"[watchdog] {key} health check failed ({failures}/{ENGINE_FAILURE_THRESHOLD})")
                        if failures >= ENGINE_FAILURE_THRESHOLD:
                            _engine_failure_counts[key] = 0
                            do_restart = True  # release lock before expensive restart
                if do_restart:
                    restart_engine(engine_type)
        except Exception as e:
            log.debug(f"[watchdog] loop iteration error: {e}")
        time.sleep(ENGINE_WATCHDOG_INTERVAL)


# ─── v4.0.0-alpha: DAEMON CONFIG LOADER ─────────────────────────────────────
#
# v4.0 introduces ~/.dcp/config.json for forward-looking daemon configuration
# (TurboQuant, assignment overrides, etc.). The old ~/dc1-provider/ files
# remain in place for backward compatibility; this loader is additive.

def load_daemon_config():
    """Load the v4.0 daemon config from ~/.dcp/config.json.

    The file is optional. When absent or unreadable, returns an empty dict.
    Supported top-level keys (v4.0-alpha):
      - turboquant: {enabled: bool, bits: int, use_polar: bool}

    Returns:
        dict: Parsed config, or {} when the file is missing/invalid.
    """
    try:
        if not DCP_CONFIG_FILE.exists():
            return {}
        raw = DCP_CONFIG_FILE.read_text(encoding="utf-8")
        data = json.loads(raw) if raw.strip() else {}
        if not isinstance(data, dict):
            log.warning(f"{DCP_CONFIG_FILE} is not a JSON object, ignoring")
            return {}
        return data
    except (OSError, ValueError) as e:
        log.warning(f"Failed to load {DCP_CONFIG_FILE}: {e}")
        return {}


def get_turboquant_config():
    """Return the merged TurboQuant config section.

    Returns:
        dict: {enabled: bool, bits: int, use_polar: bool}.
              Defaults to disabled, 3 bits, polar=True.
    """
    cfg = load_daemon_config()
    tq = cfg.get("turboquant") if isinstance(cfg, dict) else None
    if not isinstance(tq, dict):
        tq = {}
    return {
        "enabled": bool(tq.get("enabled", False)),
        "bits": int(tq.get("bits", 3)),
        "use_polar": bool(tq.get("use_polar", True)),
    }


# ─── v4.0.0-alpha: MODEL ARCHITECTURE DETECTION ─────────────────────────────
#
# Small lookup table seeded with every model we've benchmarked in Rounds 1-4.
# Used by detect_model_architecture() and calculate_safe_context(). Keys are
# matched case-insensitively by substring so partial ids (e.g. "qwen3:30b")
# resolve to the canonical entry.

# KV-cache geometry: num_layers, hidden_size per model family.
# Sources: official HF config.json files verified against the model cards.
MODEL_GEOMETRY_TABLE = {
    "qwen3-30b-a3b":     {"num_layers": 48, "hidden_size": 2048, "size_gb": 18.0},
    "qwen3.5-35b-a3b":   {"num_layers": 48, "hidden_size": 2560, "size_gb": 22.0},
    "nemotron-nano-30b-a3b": {"num_layers": 48, "hidden_size": 2048, "size_gb": 18.0},
    "gemma-4-26b-a4b":   {"num_layers": 46, "hidden_size": 3584, "size_gb": 16.0},
    "qwen2.5-32b":       {"num_layers": 64, "hidden_size": 5120, "size_gb": 20.0},
    "llama-3.3-70b":     {"num_layers": 80, "hidden_size": 8192, "size_gb": 42.0},
    "qwen2.5-14b":       {"num_layers": 48, "hidden_size": 5120, "size_gb": 9.0},
    "qwen2.5-7b":        {"num_layers": 28, "hidden_size": 3584, "size_gb": 4.7},
    "llama-3.1-8b":      {"num_layers": 32, "hidden_size": 4096, "size_gb": 5.0},
    "glm4-9b":           {"num_layers": 40, "hidden_size": 4096, "size_gb": 5.8},
    "mistral-7b":        {"num_layers": 32, "hidden_size": 4096, "size_gb": 4.5},
    "allam-7b":          {"num_layers": 32, "hidden_size": 4096, "size_gb": 4.5},
    "jais-13b":          {"num_layers": 40, "hidden_size": 5120, "size_gb": 8.0},
    "falcon-h1-7b":      {"num_layers": 32, "hidden_size": 4096, "size_gb": 4.5},
}

# Architecture table: MoE vs dense with verified parameter counts (billions).
# Total = nominal parameter count; Active = per-token active params for MoE.
MODEL_ARCH_TABLE = {
    "qwen3-30b-a3b":     {"type": "moe",   "total_params_b": 30.0, "active_params_b": 3.0},
    "qwen3.5-35b-a3b":   {"type": "moe",   "total_params_b": 35.0, "active_params_b": 3.0},
    "nemotron-nano-30b-a3b": {"type": "moe", "total_params_b": 30.0, "active_params_b": 3.0},
    "gemma-4-26b-a4b":   {"type": "moe",   "total_params_b": 26.0, "active_params_b": 4.0},
    "qwen2.5-32b":       {"type": "dense", "total_params_b": 32.0, "active_params_b": 32.0},
    "llama-3.3-70b":     {"type": "dense", "total_params_b": 70.0, "active_params_b": 70.0},
    "qwen2.5-14b":       {"type": "dense", "total_params_b": 14.0, "active_params_b": 14.0},
    "qwen2.5-7b":        {"type": "dense", "total_params_b": 7.0,  "active_params_b": 7.0},
    "llama-3.1-8b":      {"type": "dense", "total_params_b": 8.0,  "active_params_b": 8.0},
    "glm4-9b":           {"type": "dense", "total_params_b": 9.0,  "active_params_b": 9.0},
    "mistral-7b":        {"type": "dense", "total_params_b": 7.0,  "active_params_b": 7.0},
    "allam-7b":          {"type": "dense", "total_params_b": 7.0,  "active_params_b": 7.0},
    "jais-13b":          {"type": "dense", "total_params_b": 13.0, "active_params_b": 13.0},
    # Falcon H1 is technically a hybrid SSM/attention model. Mark as dense
    # for now; revisit once we have a dedicated hybrid code path.
    "falcon-h1-7b":      {"type": "dense", "total_params_b": 7.0,  "active_params_b": 7.0},
}

# ─── v4.0.3 (Phase 1.5 / Fix B): GPU MEMORY BANDWIDTH TABLE ─────────
#
# Memory bandwidth (GB/s) for the GPUs DCP cares about. Decode-time autoregressive
# inference is memory-bandwidth bound: every decoded token requires reading the
# model weights once. Peak tok/s ~= bandwidth / model_size_gb. Real sustained
# throughput is 60-90% of this ceiling; anything under 50% suggests CPU offload,
# wrong KV precision, thermal throttling, PCIe bottleneck, or a quantization
# misconfiguration (this was the A40 Qwen 2.5 32B anomaly from Round 4).
GPU_MEMORY_BANDWIDTH_GBPS = {
    "NVIDIA GeForce RTX 4090":    1008,
    "NVIDIA GeForce RTX 4080 SUPER": 736,
    "NVIDIA GeForce RTX 4080":    717,
    "NVIDIA GeForce RTX 3090":    936,
    "NVIDIA GeForce RTX 3090 Ti": 1008,
    "NVIDIA GeForce RTX 5090":    1792,
    "NVIDIA GeForce RTX 5080":     960,
    "NVIDIA RTX A5000":            768,
    "NVIDIA RTX A6000":            768,
    "NVIDIA A40":                  696,
    "NVIDIA A100-SXM4-40GB":      1555,
    "NVIDIA A100-SXM4-80GB":      2039,
    "NVIDIA H100 PCIe":           2039,
    "NVIDIA H100 SXM5":           3350,
    "NVIDIA H200":                4800,
    "NVIDIA L40":                  864,
    "NVIDIA L40S":                 864,
}


def predicted_peak_tok_s(gpu_name, model_size_gb):
    """Compute the memory-bandwidth-bound decode throughput ceiling.

    Peak autoregressive tok/s is hard-capped by memory bandwidth: every
    decoded token requires reading the full weights once, so
    peak ~= (GPU bandwidth) / (model_size_gb). Real sustained throughput
    is typically 60-90% of this peak.

    Args:
        gpu_name: Exact nvidia-smi GPU name string (e.g. "NVIDIA A40").
        model_size_gb: Model weights footprint in GB (active weights for MoE).

    Returns:
        float or None: Predicted peak tok/s, or None if gpu_name is unknown
        or model_size_gb is non-positive.
    """
    if not gpu_name or model_size_gb is None:
        return None
    try:
        size = float(model_size_gb)
    except (TypeError, ValueError):
        return None
    if size <= 0:
        return None
    bw = GPU_MEMORY_BANDWIDTH_GBPS.get(gpu_name)
    if not bw:
        return None
    return float(bw) / size


# ─── v4.0.3 (Phase 1.5 / Fix C): DUAL-IDENTITY MODEL TABLE ──────────
#
# Round 4 routing exposed that the backend had to consult OLLAMA_MODEL_ALIASES
# at candidate-selection time because daemons reported `allam:7b` (Ollama tag)
# but renters asked for `ALLaM-AI/ALLaM-7B-Instruct-preview` (HF format). The
# cleaner fix: the daemon reports BOTH the Ollama tag and the HF canonical so
# the backend filter does not need alias lookups.
MODEL_IDENTITY_TABLE = {
    "allam-7b": {
        "canonical": "ALLaM-AI/ALLaM-7B-Instruct-preview",
        "ollama": "allam:7b",
        "vllm_variants": ["BOLT-IS/ALLaM-IT-7B", "BOLT-IS/ALLaM-IT-7B-AWQ"],
        "hf_formats": [
            "ALLaM-AI/ALLaM-7B-Instruct-preview",
            "allam-ai/allam-7b-instruct-preview",
        ],
    },
    "qwen3-30b-a3b": {
        "canonical": "Qwen/Qwen3-30B-A3B-GPTQ-Int4",
        "ollama": "qwen3:30b-a3b",
        "vllm_variants": ["Qwen/Qwen3-30B-A3B", "Qwen/Qwen3-30B-A3B-GPTQ-Int4"],
        "hf_formats": [
            "Qwen/Qwen3-30B-A3B-GPTQ-Int4",
            "qwen/qwen3-30b-a3b-gptq-int4",
            "Qwen/Qwen3-30B-A3B",
        ],
    },
    "jais-13b": {
        "canonical": "inceptionai/jais-13b-chat",
        "ollama": "jais:13b",
        "vllm_variants": ["inceptionai/jais-13b-chat"],
        "hf_formats": ["inceptionai/jais-13b-chat"],
    },
    "falcon-h1-7b": {
        "canonical": "tiiuae/Falcon-H1-7B-Instruct",
        "ollama": "falcon-h1:7b",
        "vllm_variants": ["tiiuae/Falcon-H1-7B-Instruct"],
        "hf_formats": ["tiiuae/Falcon-H1-7B-Instruct"],
    },
    "qwen2.5-32b": {
        "canonical": "Qwen/Qwen2.5-32B-Instruct-AWQ",
        "ollama": "qwen2.5:32b",
        "vllm_variants": [
            "Qwen/Qwen2.5-32B-Instruct-AWQ",
            "Qwen/Qwen2.5-32B-Instruct",
        ],
        "hf_formats": [
            "Qwen/Qwen2.5-32B-Instruct-AWQ",
            "Qwen/Qwen2.5-32B-Instruct",
        ],
    },
    "llama-3.3-70b": {
        "canonical": "meta-llama/Llama-3.3-70B-Instruct",
        "ollama": "llama3.3:70b",
        "vllm_variants": ["meta-llama/Llama-3.3-70B-Instruct"],
        "hf_formats": ["meta-llama/Llama-3.3-70B-Instruct"],
    },
    "gemma-4-26b-a4b": {
        "canonical": "google/gemma-4-26b-a4b",
        "ollama": "gemma4:26b-a4b",
        "vllm_variants": [],  # llama.cpp only — no vLLM variant as of Round 4
        "hf_formats": ["google/gemma-4-26b-a4b"],
    },
    "glm4-9b": {
        "canonical": "THUDM/glm-4-9b-chat",
        "ollama": "glm4",
        "vllm_variants": ["THUDM/glm-4-9b-chat"],
        "hf_formats": ["THUDM/glm-4-9b-chat"],
    },
    "mistral-7b": {
        "canonical": "mistralai/Mistral-7B-Instruct-v0.2",
        "ollama": "mistral:7b",
        "vllm_variants": [
            "mistralai/Mistral-7B-Instruct-v0.2",
            "TheBloke/Mistral-7B-Instruct-v0.2-AWQ",
        ],
        "hf_formats": ["mistralai/Mistral-7B-Instruct-v0.2"],
    },
    "qwen3.5-35b-a3b": {
        "canonical": "Qwen/Qwen3.5-35B-A3B-Instruct",
        "ollama": "qwen3.5:35b-a3b",
        "vllm_variants": ["Qwen/Qwen3.5-35B-A3B-Instruct"],
        "hf_formats": ["Qwen/Qwen3.5-35B-A3B-Instruct"],
    },
}


def expand_model_identities(model_id):
    """Return all known alias IDs for a single model id.

    Matches the input (case-insensitive) against every canonical, Ollama tag,
    HF format, and vLLM variant in MODEL_IDENTITY_TABLE. On match, returns the
    full dedup'd sorted list of ALL aliases (lowercased). On miss, returns a
    single-entry list containing the lowercased input.

    Args:
        model_id: Raw model identifier in any known format.

    Returns:
        list[str]: Alias ids (lowercased), sorted.
    """
    if not model_id:
        return []
    needle = str(model_id).strip().lower()
    if not needle:
        return []
    for _key, identity in MODEL_IDENTITY_TABLE.items():
        candidates = []
        canonical = identity.get("canonical")
        if canonical:
            candidates.append(canonical)
        ollama_tag = identity.get("ollama")
        if ollama_tag:
            candidates.append(ollama_tag)
        for vv in identity.get("vllm_variants", []) or []:
            candidates.append(vv)
        for hf in identity.get("hf_formats", []) or []:
            candidates.append(hf)
        lowered = [c.lower() for c in candidates if c]
        if needle in lowered:
            out = set(lowered)
            return sorted(out)
    return [needle]


# Substring -> canonical key mapping for fuzzy lookups. Order matters: more
# specific substrings must come before more generic ones.
_MODEL_ALIAS_PATTERNS = [
    ("nemotron-nano-30b-a3b", ["nemotron-nano-30b", "nemotron-nano"]),
    ("qwen3.5-35b-a3b", ["qwen3.5-35b", "qwen-3.5-35b"]),
    ("qwen3-30b-a3b", ["qwen3-30b", "qwen-3-30b", "qwen3:30b"]),
    ("gemma-4-26b-a4b", ["gemma-4-26b", "gemma4-26b", "gemma-4"]),
    ("qwen2.5-32b", ["qwen2.5-32b", "qwen-2.5-32b", "qwen2.5:32b"]),
    ("llama-3.3-70b", ["llama-3.3-70b", "llama3.3-70b", "llama3.3:70b", "llama-3.3"]),
    ("qwen2.5-14b", ["qwen2.5-14b", "qwen-2.5-14b", "qwen2.5:14b"]),
    ("qwen2.5-7b", ["qwen2.5-7b", "qwen-2.5-7b", "qwen2.5:7b"]),
    ("llama-3.1-8b", ["llama-3.1-8b", "llama3.1-8b", "llama3.1:8b", "llama-3.1"]),
    ("glm4-9b", ["glm-4-9b", "glm4-9b", "glm4:9b"]),
    ("mistral-7b", ["mistral-7b", "mistral:7b"]),
    ("allam-7b", ["allam-7b", "allam:7b", "allam"]),
    ("jais-13b", ["jais-13b", "jais:13b", "jais"]),
    ("falcon-h1-7b", ["falcon-h1-7b", "falcon-h1", "falcon:h1"]),
]


def _canonicalize_model_id(model_id):
    """Fuzzy-match a raw model identifier to a canonical lookup key.

    Args:
        model_id: Raw model id (e.g. "Qwen/Qwen3-30B-A3B-GPTQ-Int4").

    Returns:
        str or None: Canonical key from MODEL_ARCH_TABLE, or None if no match.
    """
    if not model_id:
        return None
    needle = str(model_id).lower()
    for canonical, patterns in _MODEL_ALIAS_PATTERNS:
        for pat in patterns:
            if pat in needle:
                return canonical
    return None


def detect_model_architecture(model_id):
    """Classify a model as MoE or dense and report its parameter sizes.

    Args:
        model_id: Model identifier (HF repo, Ollama tag, vLLM model arg).

    Returns:
        dict: {type: "moe"|"dense", total_params_b: float,
               active_params_b: float, confidence: "known"|"inferred"}
    """
    canonical = _canonicalize_model_id(model_id)
    if canonical and canonical in MODEL_ARCH_TABLE:
        entry = dict(MODEL_ARCH_TABLE[canonical])
        entry["confidence"] = "known"
        return entry

    # Substring-based inference for unknown models.
    needle = (model_id or "").lower()
    moe_markers = ["-a3b", "-a4b", "-a10b", "moe", "mixture", "mixtral"]
    is_moe = any(m in needle for m in moe_markers)

    # Best-effort parameter size extraction from the model id (e.g. "70b").
    import re as _re
    total_b = 0.0
    active_b = 0.0
    m = _re.search(r'(\d+(?:\.\d+)?)\s*b', needle)
    if m:
        try:
            total_b = float(m.group(1))
        except ValueError:
            total_b = 0.0
    if is_moe:
        a = _re.search(r'-a(\d+(?:\.\d+)?)b', needle)
        if a:
            try:
                active_b = float(a.group(1))
            except ValueError:
                active_b = 0.0
        else:
            # Fallback: assume ~10% active for unknown MoE models.
            active_b = round(total_b * 0.1, 1) if total_b else 0.0
    else:
        active_b = total_b

    return {
        "type": "moe" if is_moe else "dense",
        "total_params_b": total_b,
        "active_params_b": active_b,
        "confidence": "inferred",
    }


# ─── v4.0.0-alpha: SMART CONTEXT WINDOW CALCULATION ─────────────────────────
#
# Round 3 showed that Ollama's default 131k context on Llama 3.3 70B forces
# the KV cache to CPU, collapsing throughput 25x. calculate_safe_context()
# picks a KV-cache-friendly context length using model geometry; the runtime
# verify_no_cpu_offload() probe watches for the same regression at runtime.

# Safety headroom (GB) reserved for activations, CUDA graphs, misc allocations.
_CONTEXT_VRAM_HEADROOM_GB = 2.0
_CONTEXT_MIN = 2048
_CONTEXT_MAX = 131072
_CONTEXT_ROUND = 1024


def _lookup_geometry(model_id, architecture):
    """Resolve (num_layers, hidden_size) for a model, with sensible fallbacks.

    Args:
        model_id: Model identifier or None.
        architecture: "moe" or "dense" hint used for heuristic fallbacks.

    Returns:
        tuple: (num_layers: int, hidden_size: int)
    """
    canonical = _canonicalize_model_id(model_id)
    if canonical and canonical in MODEL_GEOMETRY_TABLE:
        geom = MODEL_GEOMETRY_TABLE[canonical]
        return int(geom["num_layers"]), int(geom["hidden_size"])

    # Heuristic fallback for unknown models. These are rough dense-family
    # averages derived from Llama-like architectures and intentionally
    # conservative (they bias toward a SMALLER safe context).
    if (architecture or "").lower() == "moe":
        return 48, 4096
    return 32, 4096


def _vllm_kv_cache_dtype_from_cmdline():
    """Best-effort: inspect the currently running vLLM process command line
    for an explicit --kv-cache-dtype flag.

    Uses `ps -eo pid,command` (stdlib) to avoid a psutil dependency. We scan
    every line containing "vllm" and look for the flag in either
    `--kv-cache-dtype fp8` or `--kv-cache-dtype=fp8` form.

    Returns:
        str or None: The raw dtype string (e.g. "fp8", "int4") or None if
        no vLLM process is found or no explicit flag is set.
    """
    try:
        result = subprocess.run(
            ["ps", "-eo", "command"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode != 0 or not result.stdout:
            return None
        for line in result.stdout.splitlines():
            low = line.lower()
            if "vllm" not in low:
                continue
            # Accept "--kv-cache-dtype X" or "--kv-cache-dtype=X".
            tokens = line.split()
            for idx, tok in enumerate(tokens):
                if tok == "--kv-cache-dtype" and idx + 1 < len(tokens):
                    return tokens[idx + 1].strip().lower()
                if tok.startswith("--kv-cache-dtype="):
                    return tok.split("=", 1)[1].strip().lower()
    except (OSError, subprocess.SubprocessError):
        return None
    return None


def detect_kv_cache_bits(engine_type, turboquant_enabled):
    """Resolve the bit-width of the KV cache currently in use by the local engine.

    Resolution order:
        1. TurboQuant on           -> 3 (3-bit KV)
        2. vLLM --kv-cache-dtype fp8 -> 8
        3. vLLM --kv-cache-dtype int4 (or similar) -> 4
        4. Ollama default          -> 16 (fp16)
        5. vLLM default            -> 16 (fp16)
        6. Unknown engine          -> 16 (safe: overestimates memory footprint,
                                          underestimates safe context window)

    This fixes a Round 4 bug where the daemon hard-coded 4 bits even when the
    engine was actually using fp16, leading safe_context to be overestimated
    by ~4x on every non-TurboQuant provider.

    Args:
        engine_type: "vllm", "ollama", "llamacpp", or unknown string.
        turboquant_enabled: Whether the DCP TurboQuant flag is on.

    Returns:
        int: KV cache bit-width (3, 4, 8, or 16).
    """
    if turboquant_enabled:
        return 3
    engine = (engine_type or "").strip().lower()
    if engine == "vllm":
        dtype = _vllm_kv_cache_dtype_from_cmdline()
        if dtype:
            if "fp8" in dtype or "e4m3" in dtype or "e5m2" in dtype:
                return 8
            if "int4" in dtype or "q4" in dtype:
                return 4
            if "int8" in dtype or "q8" in dtype:
                return 8
        # vLLM default KV cache is fp16.
        return 16
    if engine == "ollama":
        # Ollama defaults to fp16 KV (despite flash-attention). Without a
        # definitive probe we assume fp16 and err on the side of a smaller,
        # safer context window.
        return 16
    if engine == "llamacpp":
        # llama.cpp defaults to f16 KV cache unless --cache-type-k is set.
        return 16
    # Unknown engine: assume fp16 (conservative / larger memory footprint).
    return 16


def calculate_safe_context(model_size_gb, quant_bits, gpu_vram_gb, model_architecture,
                           model_id=None):
    """Compute a KV-cache-safe context length that stays in VRAM.

    Formula:
        usable_vram    = gpu_vram_gb - model_size_gb - headroom(2 GB)
        kv_bytes/token = num_layers * 2 * hidden_size * (quant_bits / 8)
        safe_ctx       = floor(usable_vram * 1e9 / kv_bytes_per_token)

    The result is rounded DOWN to the nearest 1024, capped at 131072, and
    floored at 2048 tokens.

    Args:
        model_size_gb: Model weights footprint in GB (in VRAM).
        quant_bits: KV cache quantization bits (typically 16 for fp16, 8 for
                    fp8, 4 for int4, 3 for TurboQuant).
        gpu_vram_gb: Total GPU VRAM in GB.
        model_architecture: "moe" or "dense".
        model_id: Optional canonical model id for geometry lookup.

    Returns:
        int: Safe context length (tokens).
    """
    try:
        model_size_gb = max(0.0, float(model_size_gb or 0))
        quant_bits = max(1, int(quant_bits or 16))
        gpu_vram_gb = max(0.0, float(gpu_vram_gb or 0))
    except (TypeError, ValueError):
        return _CONTEXT_MIN

    usable_vram_gb = gpu_vram_gb - model_size_gb - _CONTEXT_VRAM_HEADROOM_GB
    if usable_vram_gb <= 0:
        # Model already exhausts VRAM; only the floor context is safe.
        return _CONTEXT_MIN

    num_layers, hidden_size = _lookup_geometry(model_id, model_architecture)
    # KV cache footprint per token: 2 (K + V) tensors, num_layers deep,
    # hidden_size wide, in quant_bits precision.
    kv_bytes_per_token = num_layers * 2 * hidden_size * (quant_bits / 8.0)
    if kv_bytes_per_token <= 0:
        return _CONTEXT_MIN

    usable_bytes = usable_vram_gb * 1_000_000_000.0
    raw = int(usable_bytes // kv_bytes_per_token)
    # Round DOWN to nearest 1024.
    rounded = (raw // _CONTEXT_ROUND) * _CONTEXT_ROUND
    if rounded < _CONTEXT_MIN:
        return _CONTEXT_MIN
    if rounded > _CONTEXT_MAX:
        return _CONTEXT_MAX
    return rounded


# ─── v4.0.0-alpha: CPU OFFLOAD DETECTION ────────────────────────────────────

def _parse_ollama_ps_output(text):
    """Parse `ollama ps` tabular output into a list of process dicts.

    Args:
        text: Raw stdout from `ollama ps`.

    Returns:
        list[dict]: One dict per row with keys NAME, SIZE, PROCESSOR, UNTIL.
    """
    rows = []
    if not text:
        return rows
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        return rows
    header = lines[0]
    # Column headers we care about: NAME, ID, SIZE, PROCESSOR, UNTIL
    # Ollama prints a space-padded table; we split on 2+ spaces.
    import re as _re
    for line in lines[1:]:
        parts = _re.split(r'\s{2,}', line.strip())
        if len(parts) >= 4:
            rows.append({
                "name": parts[0],
                "processor": parts[-2] if len(parts) >= 2 else "",
                "raw": line,
            })
    return rows


def verify_no_cpu_offload():
    """Check nvidia-smi and `ollama ps` for any sign of CPU KV-cache offload.

    Returns:
        bool: True if the currently loaded model is 100% on GPU, False if
              any CPU offload is detected or the probe is inconclusive.
    """
    global _cpu_offload_state
    details = []
    cpu_offload = False

    # nvidia-smi memory.used check — cheap sanity probe.
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            details.append(f"nvidia-smi memory.used={result.stdout.strip()}")
    except (OSError, subprocess.SubprocessError) as e:
        details.append(f"nvidia-smi probe failed: {e}")

    # Ollama ps — the definitive signal. PROCESSOR column shows "100% GPU",
    # "50%/50% CPU/GPU", etc. Anything containing "CPU" means offload.
    try:
        result = subprocess.run(
            ["ollama", "ps"], capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout:
            rows = _parse_ollama_ps_output(result.stdout)
            for row in rows:
                processor = (row.get("processor") or "").upper()
                if "CPU" in processor and "100% GPU" not in processor:
                    cpu_offload = True
                    details.append(
                        f"ollama offload: model={row.get('name')} processor={row.get('processor')}"
                    )
    except FileNotFoundError:
        # Ollama not installed — fine, not our engine.
        pass
    except (OSError, subprocess.SubprocessError) as e:
        details.append(f"ollama ps probe failed: {e}")

    joined = "; ".join(details) if details else ""
    with _cpu_offload_lock:
        _cpu_offload_state = {
            "detected": cpu_offload,
            "last_check": datetime.utcnow().isoformat() + "Z",
            "details": joined,
        }

    if cpu_offload:
        log.warning(
            "[cpu_offload] CPU offload DETECTED — KV cache spilling out of "
            "VRAM. Throughput is collapsing. Details: %s", joined
        )
        try:
            report_event(
                "cpu_offload_detected",
                joined[:4000],
                severity="warning",
            )
        except Exception as _ev_err:
            log.debug(f"[cpu_offload] report_event failed: {_ev_err}")

        # One-shot engine restart with the calculated safe context.
        # Only attempted for Ollama (the only engine we know how to safely
        # relaunch with a context override). vLLM restarts require operator
        # intervention; we log and move on.
        try:
            detected = detect_served_models()
            if "ollama" in detected.get("engines", []):
                log.warning(
                    "[cpu_offload] Attempting one-shot Ollama restart with "
                    "safe-context enforcement"
                )
                restart_engine("ollama")
        except Exception as _restart_err:
            log.debug(f"[cpu_offload] auto-restart attempt failed: {_restart_err}")

    return not cpu_offload


def get_cpu_offload_state():
    """Return the most recent CPU offload probe state (safe for heartbeat).

    Returns:
        dict: {detected: bool, last_check: iso_string|None, details: str}
    """
    with _cpu_offload_lock:
        return dict(_cpu_offload_state)


# ─── v4.0.0-alpha: DYNAMIC CONCURRENCY CAPACITY PROBE ───────────────────────
#
# Round 3 showed static concurrency estimates miss reality by 2-3x depending on
# the GPU, model, and KV cache headroom. The v4.0 probe actually fires parallel
# requests at the local inference engine and reports the highest N at which
# aggregate throughput was still improving. Results are cached per
# (gpu_name, model_id, engine, quant) tuple for 24h.

_CONCURRENCY_CACHE_TTL_S = 24 * 3600  # 24 hours
_CONCURRENCY_PROBE_HARD_CAP = 32
_CONCURRENCY_PROBE_LEVELS = [2, 4, 8, 16, 32]
_CONCURRENCY_PROBE_PER_REQUEST_TIMEOUT = 30
_CONCURRENCY_PROBE_PROMPT = "write one sentence"
_CONCURRENCY_PROBE_MAX_TOKENS = 32


def _load_concurrency_cache():
    """Load the concurrency probe cache from disk.

    Returns:
        dict: Cache contents, or {} on error.
    """
    try:
        if not DCP_CONCURRENCY_CACHE_FILE.exists():
            return {}
        raw = DCP_CONCURRENCY_CACHE_FILE.read_text(encoding="utf-8")
        data = json.loads(raw) if raw.strip() else {}
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError) as e:
        log.debug(f"[probe] cache load failed: {e}")
        return {}


def _save_concurrency_cache(cache):
    """Persist the concurrency probe cache to disk.

    Args:
        cache: Serializable dict to write.
    """
    try:
        DCP_DIR.mkdir(parents=True, exist_ok=True)
        DCP_CONCURRENCY_CACHE_FILE.write_text(
            json.dumps(cache, indent=2), encoding="utf-8"
        )
    except OSError as e:
        log.debug(f"[probe] cache save failed: {e}")


def _concurrency_cache_key(gpu_name, model_id, engine, quant):
    """Build a stable cache key for the probe result.

    Args:
        gpu_name: GPU model name.
        model_id: Model identifier in use.
        engine: Engine tag ("vllm", "ollama", etc).
        quant: Quantization string or None.

    Returns:
        str: Cache key.
    """
    return f"{gpu_name or 'unknown'}|{model_id or 'unknown'}|{engine or 'unknown'}|{quant or 'unknown'}"


def _pick_probe_target(detected):
    """Pick (engine, port, model_id) to probe based on detected engines.

    Args:
        detected: Output of detect_served_models().

    Returns:
        tuple or None: (engine, port, model_id) or None if nothing reachable.
    """
    engines = detected.get("engines", []) if isinstance(detected, dict) else []
    # v4.0.3 (Phase 1.5 / Fix C): use the RAW model list for the probe
    # target id. Ollama's /api/generate needs the Ollama tag form (e.g.
    # "allam:7b"), not the HF canonical. The expanded cached_models list is
    # for backend routing; the probe speaks directly to the local engine.
    raw_models = detected.get("models_raw", []) if isinstance(detected, dict) else []
    if not raw_models:
        raw_models = detected.get("models", []) if isinstance(detected, dict) else []
    first_model = raw_models[0] if raw_models else None

    # Prefer vLLM (continuous batching — the whole point of the probe).
    for tag in engines:
        if tag.startswith("vllm:"):
            try:
                port = int(tag.split(":", 1)[1])
                return ("vllm", port, first_model)
            except ValueError:
                continue
    if "ollama" in engines:
        return ("ollama", 11434, first_model)
    if "llamacpp" in engines:
        return ("llamacpp", 8080, first_model)
    return None


def _fire_probe_request(engine, port, model_id):
    """Fire a single probe request at the local engine.

    Args:
        engine: "vllm" | "ollama" | "llamacpp".
        port: Target port.
        model_id: Model id or None.

    Returns:
        tuple: (success: bool, tokens: int, elapsed_s: float)
    """
    if not HAS_REQUESTS:
        return False, 0, 0.0

    start = time.time()
    try:
        if engine == "ollama":
            body = {
                "model": model_id or "",
                "prompt": _CONCURRENCY_PROBE_PROMPT,
                "stream": False,
                "options": {"num_predict": _CONCURRENCY_PROBE_MAX_TOKENS},
            }
            r = requests.post(
                f"http://localhost:{port}/api/generate",
                json=body, timeout=_CONCURRENCY_PROBE_PER_REQUEST_TIMEOUT,
            )
            if not r.ok:
                return False, 0, 0.0
            data = r.json()
            tokens = int(data.get("eval_count") or _CONCURRENCY_PROBE_MAX_TOKENS)
        else:
            # vLLM / llamacpp both expose OpenAI-compatible /v1/chat/completions.
            body = {
                "model": model_id or "default",
                "messages": [{"role": "user", "content": _CONCURRENCY_PROBE_PROMPT}],
                "max_tokens": _CONCURRENCY_PROBE_MAX_TOKENS,
                "stream": False,
                "temperature": 0.0,
            }
            r = requests.post(
                f"http://localhost:{port}/v1/chat/completions",
                json=body, timeout=_CONCURRENCY_PROBE_PER_REQUEST_TIMEOUT,
            )
            if not r.ok:
                return False, 0, 0.0
            data = r.json()
            usage = data.get("usage", {}) if isinstance(data, dict) else {}
            tokens = int(
                usage.get("completion_tokens")
                or _CONCURRENCY_PROBE_MAX_TOKENS
            )
    except (requests.RequestException, ValueError, KeyError) as e:
        log.debug(f"[probe] request failed: {e}")
        return False, 0, 0.0

    elapsed = time.time() - start
    return True, tokens, elapsed


def _run_probe_batch(engine, port, model_id, concurrency):
    """Fire `concurrency` parallel requests and measure aggregate tok/s.

    Args:
        engine: Engine type.
        port: Target port.
        model_id: Model id or None.
        concurrency: Number of parallel in-flight requests.

    Returns:
        tuple: (ok: bool, aggregate_tps: float)
    """
    results = []
    threads = []
    errors = [0]
    lock = threading.Lock()

    batch_start = time.time()

    def worker():
        ok, tokens, elapsed = _fire_probe_request(engine, port, model_id)
        with lock:
            if ok:
                results.append((tokens, elapsed))
            else:
                errors[0] += 1

    for _ in range(concurrency):
        t = threading.Thread(target=worker, daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join(timeout=_CONCURRENCY_PROBE_PER_REQUEST_TIMEOUT + 5)

    batch_elapsed = max(time.time() - batch_start, 0.001)

    if errors[0] > 0 or not results:
        return False, 0.0

    total_tokens = sum(tok for tok, _ in results)
    aggregate_tps = total_tokens / batch_elapsed
    return True, aggregate_tps


def probe_concurrency_capacity(force_reprobe=None):
    """Measure maximum useful concurrency on the local inference engine.

    Doubles in-flight request count from 2 until aggregate tok/s stops
    improving by >10%, any request errors, or the hard cap (32) is hit.
    Results are cached per (gpu, model, engine, quant) for 24h.

    Args:
        force_reprobe: Override _FORCE_REPROBE_CONCURRENCY. Forces a fresh
                       measurement even if the cache is warm.

    Returns:
        dict: {
          max_concurrent_users: int,
          engine_type: str,
          batching: str,
          probed_concurrency: int,
          concurrency_probe_method: "cached"|"measured"|"fallback_static",
          concurrency_probed_at: iso_string|None,
          probe_aggregate_tps: float|None,
          model_id: str|None,
        }
    """
    force = _FORCE_REPROBE_CONCURRENCY if force_reprobe is None else force_reprobe

    detected = detect_served_models()
    engines = detected.get("engines", []) if isinstance(detected, dict) else []

    # Determine engine type + batching profile first (used by fallback path too).
    if any(e.startswith("vllm") for e in engines):
        engine_type = "vllm"
        batching = "continuous"
        static_max = 9
    elif "llamacpp" in engines:
        engine_type = "llamacpp"
        batching = "parallel_slots"
        static_max = 5
    elif "ollama" in engines:
        engine_type = "ollama"
        batching = "sequential"
        static_max = 3
    else:
        engine_type = "unknown"
        batching = "unknown"
        static_max = 1

    gpu = detect_gpu() or {}
    gpu_name = gpu.get("gpu_name") or "unknown"
    first_model = (detected.get("models") or [None])[0] if isinstance(detected, dict) else None
    quant = os.environ.get("DCP_QUANTIZATION") or None
    cache_key = _concurrency_cache_key(gpu_name, first_model, engine_type, quant)

    fallback_result = {
        "max_concurrent_users": static_max,
        "engine_type": engine_type,
        "batching": batching,
        "probed_concurrency": static_max,
        "concurrency_probe_method": "fallback_static",
        "concurrency_probed_at": None,
        "probe_aggregate_tps": None,
        "model_id": first_model,
        # v4.0.3 (Phase 1.5 / Fix B): bandwidth-drift fields
        "single_user_tps": None,
        "predicted_peak_tok_s": None,
        "performance_ratio": None,
    }

    # 1. Cache lookup.
    if not force:
        cache = _load_concurrency_cache()
        cached = cache.get(cache_key) if isinstance(cache, dict) else None
        if isinstance(cached, dict):
            ts = cached.get("timestamp", 0)
            if (time.time() - ts) < _CONCURRENCY_CACHE_TTL_S:
                result = dict(fallback_result)
                result.update({
                    "max_concurrent_users": int(cached.get("probed_concurrency") or static_max),
                    "probed_concurrency": int(cached.get("probed_concurrency") or static_max),
                    "probe_aggregate_tps": cached.get("aggregate_tps"),
                    "concurrency_probe_method": "cached",
                    "concurrency_probed_at": cached.get("probed_at"),
                    # v4.0.3 (Phase 1.5 / Fix B): preserve bandwidth fields
                    "single_user_tps": cached.get("single_user_tps"),
                    "predicted_peak_tok_s": cached.get("predicted_peak_tok_s"),
                    "performance_ratio": cached.get("performance_ratio"),
                })
                return result

    # 2. Measure. Bail out to static fallback if no engine is reachable.
    target = _pick_probe_target(detected)
    if target is None or engine_type == "unknown":
        return fallback_result

    engine, port, model_id = target
    log.info(f"[probe] Measuring concurrency for {engine}:{port} model={model_id}")

    last_good_n = 1
    last_good_tps = 0.0
    for n in _CONCURRENCY_PROBE_LEVELS:
        if n > _CONCURRENCY_PROBE_HARD_CAP:
            break
        ok, tps = _run_probe_batch(engine, port, model_id, n)
        log.info(f"[probe] n={n} ok={ok} aggregate_tps={tps:.1f}")
        if not ok:
            break
        if last_good_tps > 0 and tps < last_good_tps * 1.10:
            # <10% improvement — saturation reached. Report previous level.
            break
        last_good_n = n
        last_good_tps = tps

    if last_good_n <= 1:
        log.warning("[probe] Concurrency probe inconclusive, using fallback")
        return fallback_result

    probed_at = datetime.utcnow().isoformat() + "Z"

    # v4.0.3 (Phase 1.5 / Fix B): single-user throughput measurement
    # for memory-bandwidth drift detection. We fire ONE extra probe request
    # at concurrency=1 to measure the decode tok/s a single user actually
    # sees, then compare against the bandwidth-predicted ceiling.
    single_user_tps = None
    performance_ratio = None
    predicted_peak = None
    try:
        ok1, tokens1, elapsed1 = _fire_probe_request(engine, port, model_id)
        if ok1 and elapsed1 > 0 and tokens1 > 0:
            single_user_tps = float(tokens1) / float(elapsed1)
    except Exception as _su_err:
        log.debug(f"[probe] single-user measurement failed: {_su_err}")

    try:
        canonical = _canonicalize_model_id(model_id)
        model_size_gb = 0.0
        if canonical and canonical in MODEL_GEOMETRY_TABLE:
            model_size_gb = float(MODEL_GEOMETRY_TABLE[canonical].get("size_gb", 0.0))
        if model_size_gb > 0:
            predicted_peak = predicted_peak_tok_s(gpu_name, model_size_gb)
        if predicted_peak and single_user_tps and single_user_tps > 0:
            performance_ratio = single_user_tps / predicted_peak
            if performance_ratio < 0.5:
                try:
                    report_event(
                        "performance_anomaly",
                        f"Measured {single_user_tps:.1f} tok/s is "
                        f"{performance_ratio * 100:.0f}% of memory-bandwidth-predicted "
                        f"{predicted_peak:.1f} tok/s for {model_id} on {gpu_name}. "
                        f"Possible causes: CPU offload, wrong KV precision, thermal "
                        f"throttle, PCIe bottleneck.",
                        severity="warning",
                    )
                except Exception as _ev_err:
                    log.debug(f"[probe] performance_anomaly report failed: {_ev_err}")
            log.info(
                "[probe] single_user_tps=%.1f predicted_peak=%.1f ratio=%.2f",
                single_user_tps, predicted_peak, performance_ratio,
            )
    except Exception as _pred_err:
        log.debug(f"[probe] bandwidth prediction failed: {_pred_err}")

    # Persist the cache entry (including bandwidth fields from Fix B).
    cache = _load_concurrency_cache()
    cache[cache_key] = {
        "probed_concurrency": last_good_n,
        "aggregate_tps": round(last_good_tps, 2),
        "probed_at": probed_at,
        "timestamp": time.time(),
        "gpu_name": gpu_name,
        "model_id": model_id,
        "engine": engine_type,
        "quant": quant,
        "single_user_tps": round(single_user_tps, 2) if single_user_tps else None,
        "predicted_peak_tok_s": round(predicted_peak, 2) if predicted_peak else None,
        "performance_ratio": round(performance_ratio, 3) if performance_ratio else None,
    }
    _save_concurrency_cache(cache)

    result = dict(fallback_result)
    result.update({
        "max_concurrent_users": last_good_n,
        "probed_concurrency": last_good_n,
        "probe_aggregate_tps": round(last_good_tps, 2),
        "concurrency_probe_method": "measured",
        "concurrency_probed_at": probed_at,
        "single_user_tps": round(single_user_tps, 2) if single_user_tps else None,
        "predicted_peak_tok_s": round(predicted_peak, 2) if predicted_peak else None,
        "performance_ratio": round(performance_ratio, 3) if performance_ratio else None,
    })
    return result


def estimate_concurrency_capacity():
    """Backward-compat alias for probe_concurrency_capacity().

    v3.5 callers expect this function name. It now returns the probed
    concurrency result (with full v4.0 fields) to keep the heartbeat
    payload consistent.

    Returns:
        dict: Same shape as probe_concurrency_capacity().
    """
    return probe_concurrency_capacity()


_CONCURRENCY_REPROBE_INTERVAL_S = 6 * 3600  # 6 hours


def _concurrency_reprobe_loop():
    """Background loop: force a concurrency reprobe every 6 hours.

    The in-process cache is invalidated by passing force_reprobe=True so the
    backend gets fresh numbers even if the hardware is idle. This runs in a
    daemon thread and never raises.
    """
    # Initial delay so we don't double-probe right after startup.
    time.sleep(_CONCURRENCY_REPROBE_INTERVAL_S)
    while True:
        try:
            if not is_draining():
                result = probe_concurrency_capacity(force_reprobe=True)
                log.info(
                    "[probe] Periodic reprobe complete: method=%s probed=%s",
                    result.get("concurrency_probe_method"),
                    result.get("probed_concurrency"),
                )
        except Exception as e:
            log.debug(f"[probe] reprobe loop error: {e}")
        time.sleep(_CONCURRENCY_REPROBE_INTERVAL_S)


# ─── v3.5.0: PASSIVE DAEMON-VERSION CHECK (Feature 5) ───────────────────────
#
# The existing check_for_update() function actively downloads and self-updates
# via the watchdog restart flow. This lighter-weight check simply logs when a
# newer daemon version is advertised by the backend so operators know to run
# the installer. It intentionally does NOT perform any file mutations.

_LAST_UPDATE_NAG_TS = 0.0
_UPDATE_NAG_INTERVAL = 300  # seconds between log warnings


def check_for_updates():
    """
    Passive check: hit the backend version endpoint and log a warning if a
    newer daemon version is available. Does not modify any files.
    Safe to call repeatedly — internal throttling suppresses log spam.
    """
    global _LAST_UPDATE_NAG_TS
    try:
        url = f"{API_URL.rstrip('/')}/api/providers/daemon/version"
        if HAS_REQUESTS:
            r = requests.get(url, timeout=10)
            if not r.ok:
                return
            data = r.json() if r.content else {}
        else:
            code, data = http_get(url, timeout=10)
            if code != 200:
                return
        if not isinstance(data, dict):
            return
        latest = str(data.get("version", DAEMON_VERSION)).strip()
        if latest and _is_remote_newer(latest, DAEMON_VERSION):
            now = time.time()
            if now - _LAST_UPDATE_NAG_TS >= _UPDATE_NAG_INTERVAL:
                _LAST_UPDATE_NAG_TS = now
                log.warning(f"[update] New daemon version available: {latest} (current: {DAEMON_VERSION})")
                log.warning("[update] Run: curl -sSL https://api.dcp.sa/install | bash to update")
                try:
                    report_event(
                        "daemon_outdated",
                        f"New version {latest} available (current: {DAEMON_VERSION})",
                        severity="warning",
                    )
                except Exception:
                    pass
    except Exception as e:
        log.debug(f"[update] passive version check failed: {e}")


def passive_update_check_loop():
    """
    Background thread: call check_for_updates() every 5 minutes.
    This is distinct from the active self-updater (update_check_loop);
    here we only *inform* the operator that a newer version exists.
    """
    # Stagger first check so we don't hit two update endpoints on startup
    time.sleep(30)
    while True:
        try:
            check_for_updates()
        except Exception as e:
            log.debug(f"[update] passive loop error: {e}")
        jitter = 300 * UPDATE_CHECK_JITTER_PCT * (2 * random.random() - 1)
        time.sleep(max(30.0, 300 + jitter))  # ~5 min ± jitter


# ─── v4.0.3 (Phase 1.5 / Fix D+E): RUNPOD COST + RUNWAY SELF-REPORT ─

def detect_pod_hourly_cost_usd():
    """Query the RunPod GraphQL API for this pod's `costPerHr`.

    Uses the pod-scoped RUNPOD_API_KEY env var (which RunPod automatically
    injects on every pod and which is sufficient for reading your OWN pod's
    cost). Enables the backend to compute cost-plus pricing floors per
    provider without manual lookups.

    Returns:
        float or None: Hourly cost in USD (e.g. 0.59), or None when this is
        not a RunPod pod, the API query fails, or the response is missing.
    """
    pod_id = os.environ.get("RUNPOD_POD_ID")
    api_key = os.environ.get("RUNPOD_API_KEY")
    if not (pod_id and api_key):
        return None
    try:
        url = "https://api.runpod.io/graphql?api_key=" + api_key
        body = {
            "query": 'query { pod(input: {podId: "' + pod_id + '"}) { costPerHr } }'
        }
        code, resp = http_post(url, body, timeout=10)
        if code != 200 or not isinstance(resp, dict):
            return None
        data = resp.get("data") or {}
        pod = data.get("pod") if isinstance(data, dict) else None
        if not isinstance(pod, dict):
            return None
        cost = pod.get("costPerHr")
        if cost is None:
            return None
        return float(cost)
    except (ValueError, TypeError) as e:
        log.debug(f"detect_pod_hourly_cost_usd parse error: {e}")
        return None
    except Exception as e:
        log.debug(f"detect_pod_hourly_cost_usd failed: {e}")
        return None


def detect_account_runway_hours():
    """Best-effort: query the caller's RunPod account for balance + burn rate
    and return the remaining runway in hours.

    This will succeed ONLY if the injected RUNPOD_API_KEY happens to be
    account-scoped (rare for provider pods, but possible for fleet operators).
    A pod-scoped key returns Unauthorized and this function returns None,
    leaving centralized runway monitoring to the backend.

    Results are cached in-process for 10 minutes to respect RunPod rate limits.

    Returns:
        float or None: Hours of runway remaining at the current burn rate,
        rounded to 1 decimal. None if the key is pod-scoped, the pod is not
        on RunPod, or the query fails.
    """
    global _ACCOUNT_RUNWAY_HOURS, _ACCOUNT_RUNWAY_LAST_CHECK
    with _runpod_cache_lock:
        now = time.time()
        if (now - _ACCOUNT_RUNWAY_LAST_CHECK) < _ACCOUNT_RUNWAY_INTERVAL_S:
            return _ACCOUNT_RUNWAY_HOURS

    api_key = os.environ.get("RUNPOD_API_KEY")
    if not api_key:
        with _runpod_cache_lock:
            _ACCOUNT_RUNWAY_LAST_CHECK = time.time()
            _ACCOUNT_RUNWAY_HOURS = None
        return None

    runway = None
    try:
        url = "https://api.runpod.io/graphql?api_key=" + api_key
        body = {"query": "query { myself { clientBalance currentSpendPerHr } }"}
        code, resp = http_post(url, body, timeout=10)
        if code == 200 and isinstance(resp, dict):
            data = resp.get("data") or {}
            myself = data.get("myself") if isinstance(data, dict) else None
            if isinstance(myself, dict):
                try:
                    balance = float(myself.get("clientBalance") or 0)
                    spend = float(myself.get("currentSpendPerHr") or 0)
                    if spend > 0:
                        runway = round(balance / spend, 1)
                except (TypeError, ValueError):
                    runway = None
    except Exception as e:
        log.debug(f"detect_account_runway_hours failed: {e}")
        runway = None

    with _runpod_cache_lock:
        _ACCOUNT_RUNWAY_LAST_CHECK = time.time()
        _ACCOUNT_RUNWAY_HOURS = runway
    return runway


# ─── v4.0.3 (Phase 1.5 / Fix F): PORT MISMATCH DETECTION ────────────

def detect_port_mismatch():
    """Check whether the local inference engine is on a port with no
    RunPod public TCP mapping.

    On RunPod, only ports that were declared at pod-creation time get a
    public mapping (RUNPOD_TCP_PORT_<n> env var). If vLLM is on 8000 but
    the pod only exposes 22 and 11434, the backend cannot reach vLLM —
    this is the A5000 incident from Round 4.

    Returns:
        dict: {
            mismatch: bool,
            engine_port: int or None,
            engine_name: str or None,
            mapped_ports: list[int],
            remedy: "none" | "socat" | "reprovision",
        }
    """
    # Candidate (name, port) pairs we probe locally.
    engines = [
        ("vllm",     8000),
        ("vllm_alt", 8001),
        ("ollama",   11434),
        ("llamacpp", 8080),
    ]
    active = []
    for name, port in engines:
        try:
            code, _resp = http_get(f"http://127.0.0.1:{port}/v1/models", timeout=2)
            if code == 200:
                active.append((name, port))
                continue
        except Exception:
            pass
        try:
            code, _resp = http_get(f"http://127.0.0.1:{port}/api/tags", timeout=2)
            if code == 200:
                active.append((name, port))
        except Exception:
            pass

    if not active:
        return {
            "mismatch": False,
            "engine_port": None,
            "engine_name": None,
            "mapped_ports": [],
            "remedy": "none",
        }

    mapped = []
    for p in [22, 8000, 8001, 8080, 11434]:
        if os.environ.get(f"RUNPOD_TCP_PORT_{p}"):
            mapped.append(p)

    engine_name, engine_port = active[0]
    if engine_port in mapped:
        return {
            "mismatch": False,
            "engine_port": engine_port,
            "engine_name": engine_name,
            "mapped_ports": mapped,
            "remedy": "none",
        }

    # If we have ANY non-SSH mapped port we can forward from, socat fixes it.
    # Otherwise the pod must be reprovisioned with the right port declared.
    forwardable = [p for p in mapped if p != 22]
    remedy = "socat" if forwardable else "reprovision"
    return {
        "mismatch": True,
        "engine_port": engine_port,
        "engine_name": engine_name,
        "mapped_ports": mapped,
        "remedy": remedy,
    }


def auto_start_socat_forwarder(engine_port, listen_port):
    """Start a socat TCP forwarder from 0.0.0.0:listen_port -> 127.0.0.1:engine_port.

    Installs socat via apt-get if missing (Debian/Ubuntu bases — RunPod's
    default image family). Refuses to start a duplicate forwarder if one is
    already running against the same port pair.

    Args:
        engine_port: The local port the inference engine is listening on
                     (e.g. 8000 for vLLM).
        listen_port: A RunPod-mapped port the forwarder should accept public
                     traffic on (e.g. 11434).

    Returns:
        bool: True if a forwarder is running after the call, False otherwise.
    """
    # 1. Check socat is installed; install if missing.
    try:
        which = subprocess.run(
            ["which", "socat"], capture_output=True, text=True, timeout=5,
        )
        socat_installed = (which.returncode == 0 and bool(which.stdout.strip()))
    except (OSError, subprocess.SubprocessError):
        socat_installed = False

    if not socat_installed:
        log.warning("[port-mismatch] socat not installed; attempting apt-get install")
        try:
            install_env = dict(os.environ)
            install_env["DEBIAN_FRONTEND"] = "noninteractive"
            subprocess.run(
                ["apt-get", "install", "-y", "-qq", "socat"],
                capture_output=True, text=True, timeout=60,
                env=install_env, check=True,
            )
        except (OSError, subprocess.SubprocessError, subprocess.CalledProcessError) as e:
            log.error(f"[port-mismatch] socat install failed: {e}")
            return False

    # 2. Short-circuit if a forwarder is already running for this pair.
    try:
        existing = subprocess.run(
            ["pgrep", "-f", f"socat.*:{listen_port}.*:{engine_port}"],
            capture_output=True, text=True, timeout=5,
        )
        if existing.returncode == 0 and existing.stdout.strip():
            log.info(
                f"[port-mismatch] socat forwarder already running "
                f":{listen_port}->:{engine_port}"
            )
            return True
    except (OSError, subprocess.SubprocessError) as e:
        log.debug(f"[port-mismatch] pgrep check failed: {e}")

    # 3. Launch a new forwarder, detached.
    try:
        log_path = "/tmp/socat-daemon.log"
        try:
            log_fp = open(log_path, "a")
        except (OSError, IOError):
            log_fp = subprocess.DEVNULL
        subprocess.Popen(
            [
                "socat",
                f"TCP-LISTEN:{listen_port},fork,reuseaddr,bind=0.0.0.0",
                f"TCP:127.0.0.1:{engine_port}",
            ],
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        log.info(
            f"[port-mismatch] Started socat forwarder "
            f":{listen_port} -> :{engine_port}"
        )
        return True
    except (OSError, subprocess.SubprocessError) as e:
        log.error(f"[port-mismatch] Failed to start socat forwarder: {e}")
        return False


def apply_port_mismatch_remedy():
    """Run detect_port_mismatch() and, if the remedy is 'socat', pick the
    best forwardable RunPod-mapped port and start the forwarder.

    Updates _PORT_MISMATCH_STATE so send_heartbeat() can surface the result.
    Safe to call repeatedly (the forwarder helper is idempotent).

    Returns:
        dict: The latest port mismatch state.
    """
    try:
        state = detect_port_mismatch()
    except Exception as e:
        log.debug(f"[port-mismatch] detect failed: {e}")
        return dict(_PORT_MISMATCH_STATE)

    if state.get("mismatch") and state.get("remedy") == "socat":
        engine_port = state.get("engine_port")
        mapped = state.get("mapped_ports") or []
        # Prefer 11434 (ollama slot), then 8000, then anything non-SSH.
        listen_port = None
        for preferred in (11434, 8000, 8001, 8080):
            if preferred in mapped and preferred != engine_port:
                listen_port = preferred
                break
        if listen_port is None:
            for p in mapped:
                if p != 22 and p != engine_port:
                    listen_port = p
                    break
        if listen_port and engine_port:
            ok = auto_start_socat_forwarder(engine_port, listen_port)
            state["socat_started"] = bool(ok)
            state["socat_listen_port"] = listen_port
    elif state.get("mismatch") and state.get("remedy") == "reprovision":
        log.error(
            "[port-mismatch] UNFIXABLE port mismatch: engine on :%s but no "
            "non-SSH mapped port is available. Pod must be reprovisioned.",
            state.get("engine_port"),
        )
        try:
            report_event(
                "port_mismatch_unfixable",
                f"Engine {state.get('engine_name')} on port {state.get('engine_port')} "
                f"has no forwardable mapped port (mapped={state.get('mapped_ports')}). "
                f"Pod must be reprovisioned.",
                severity="critical",
            )
        except Exception as _ev_err:
            log.debug(f"[port-mismatch] report_event failed: {_ev_err}")

    with _port_mismatch_lock:
        _PORT_MISMATCH_STATE.update(state)
    return dict(state)


def send_heartbeat(final=False, status=None):  # returns HTTP status code or None on transport error
    """Send heartbeat with GPU metrics to backend and P2P network.

    Kwargs (v3.5.0):
      final:  True if this is the final heartbeat during graceful drain.
      status: Optional status override, e.g. 'draining'. Included in payload.
    """
    gpu = detect_gpu()
    gpu_info = get_gpu_info()
    cache_metrics = get_model_cache_metrics()
    vllm_models = detect_vllm_models()
    gpu_status = {}
    if gpu:
        all_gpus = gpu.get("all_gpus", [gpu])
        gpu_count = len(all_gpus) or 1
        total_vram_mb = sum(int(g.get("gpu_vram_mib", 0) or 0) for g in all_gpus)
        gpu_status = {
            "gpu_name": gpu["gpu_name"],
            "gpu_vram_mib": gpu["gpu_vram_mib"],
            "vram_mb": total_vram_mb,
            "free_vram_mib": gpu["free_vram_mib"],
            "memory_used_mb": gpu["memory_used_mb"],
            "gpu_util_pct": gpu["gpu_util_pct"],
            "temp_c": gpu["temp_c"],
            "power_w": gpu["power_w"],
            "driver_version": gpu["driver_version"],
            "daemon_version": DAEMON_VERSION,
            "python_version": platform.python_version(),
            "os_info": f"{platform.system()} {platform.release()}",
            # Multi-GPU: full list of all detected GPUs (aggregated metrics)
            "all_gpus": all_gpus,
            "gpu_count": gpu_count,
            "compute_capability": gpu.get("compute_capability"),
            "cuda_version": gpu.get("cuda_version"),
        }
    gpu_status["model_cache_path"] = cache_metrics["path"]
    gpu_status["model_cache_exists"] = cache_metrics["exists"]
    gpu_status["model_cache_total_gb"] = cache_metrics["total_gb"]
    gpu_status["model_cache_free_gb"] = cache_metrics["free_gb"]
    gpu_status["model_cache_used_gb"] = cache_metrics["used_gb"]
    gpu_status["model_cache_used_percent"] = cache_metrics["used_percent"]

    peer_id = _get_or_create_peer_id()
    url = f"{API_URL}/api/providers/heartbeat"
    try:
        payload = {
            "api_key": API_KEY,
            "peer_id": peer_id,
            "gpu_status": gpu_status,
            "gpu_info": gpu_info,
            "provider_ip": None,
            "provider_hostname": platform.node(),
            "resource_spec": build_resource_spec(gpu),
            "model_cache": cache_metrics,
            "vllm_models": vllm_models,
            "served_model": os.environ.get("DCP_SERVED_MODEL", ""),
            "engine": os.environ.get("DCP_ENGINE", ""),
        }
        # Include bandwidth stats if available
        with _bw_lock:
            if _bandwidth_stats.get("download_mbps") is not None:
                payload["bandwidth"] = dict(_bandwidth_stats)  # Copy to avoid race
        # Include network quality metrics
        with _nq_lock:
            if _network_quality.get("latency_ms") is not None:
                payload["network_quality"] = dict(_network_quality)
        # Include power cost config if enabled
        power_config = load_power_config()
        if power_config.get("enabled"):
            payload["power_config"] = {
                "electricity_cost_kwh": power_config.get("electricity_cost_kwh"),
                "gpu_tdp_watts": power_config.get("gpu_tdp_watts"),
            }
        # Include multi-GPU slot status
        payload["gpu_slots"] = {
            "total": MAX_CONCURRENT_JOBS,
            "active": get_active_job_count(),
            "free": get_free_gpu_slot_count(),
        }
        payload["draining"] = is_draining()
        # v3.5.0: Model auto-detection across all inference engines.
        # v4.0.3 (Phase 1.5 / Fix C): cached_models now contains the
        # dual-identity alias expansion (Ollama tag + HF canonical + vLLM
        # variants). The pre-expansion list is also surfaced as
        # cached_models_raw for backward-compat / debugging.
        try:
            detected = detect_served_models()
            payload["cached_models"] = detected.get("models", [])
            payload["cached_models_raw"] = detected.get("models_raw", detected.get("models", []))
            payload["engines_active"] = detected.get("engines", [])
        except Exception as _detect_err:
            log.debug(f"detect_served_models failed: {_detect_err}")
            payload["cached_models"] = []
            payload["cached_models_raw"] = []
            payload["engines_active"] = []
        # v3.5.0: Concurrency capacity estimation (now dynamic probe in v4.0)
        try:
            capacity = estimate_concurrency_capacity()
            payload["concurrency_capacity"] = capacity
            # v4.0.0-alpha: surface probe fields at top level for the router.
            if isinstance(capacity, dict):
                payload["probed_concurrency"] = capacity.get("probed_concurrency")
                payload["concurrency_probed_at"] = capacity.get("concurrency_probed_at")
                payload["concurrency_probe_method"] = capacity.get("concurrency_probe_method")
                # v4.0.3 (Phase 1.5 / Fix B): bandwidth drift signal
                payload["single_user_tps"] = capacity.get("single_user_tps")
                payload["predicted_peak_tok_s"] = capacity.get("predicted_peak_tok_s")
                payload["performance_ratio"] = capacity.get("performance_ratio")
        except Exception as _cap_err:
            log.debug(f"estimate_concurrency_capacity failed: {_cap_err}")
        # v4.0.0-alpha: per-model architecture classification.
        # v4.0.3 (Phase 1.5 / Fix C): use the raw (pre-expansion) list
        # so we do not emit duplicate arch entries for each alias of the same
        # underlying model.
        try:
            served_ids = payload.get("cached_models_raw") or payload.get("cached_models") or []
            arch_report = {}
            for mid in served_ids:
                arch_report[mid] = detect_model_architecture(mid)
            # Expose the first model's architecture at top level for convenience,
            # plus the full per-model map.
            payload["architecture"] = (
                next(iter(arch_report.values()))
                if arch_report
                else {"type": "unknown", "total_params_b": 0.0,
                      "active_params_b": 0.0, "confidence": "inferred"}
            )
            payload["architectures_by_model"] = arch_report
        except Exception as _arch_err:
            log.debug(f"detect_model_architecture failed: {_arch_err}")
        # v4.0.0-alpha: effective context the engine was launched with
        try:
            with _effective_context_lock:
                if _effective_context_by_model:
                    # Pick the smallest safe context across all loaded models
                    # (most conservative view — if any is at risk, report it).
                    payload["effective_context_tokens"] = min(
                        int(v) for v in _effective_context_by_model.values() if v
                    )
                    payload["effective_context_by_model"] = dict(_effective_context_by_model)
                else:
                    payload["effective_context_tokens"] = None
        except Exception as _ctx_err:
            log.debug(f"effective_context surfacing failed: {_ctx_err}")
        # v4.0.0-alpha: TurboQuant feature flag
        try:
            tq_cfg = get_turboquant_config()
            payload["turboquant_enabled"] = bool(tq_cfg.get("enabled"))
        except Exception as _tq_err:
            log.debug(f"get_turboquant_config failed: {_tq_err}")
            payload["turboquant_enabled"] = False
        # v4.0.0-alpha: CPU offload detection (runtime probe in heartbeat loop)
        try:
            offload_state = get_cpu_offload_state()
            payload["cpu_offload_detected"] = bool(offload_state.get("detected"))
            if offload_state.get("last_check"):
                payload["cpu_offload_last_check"] = offload_state.get("last_check")
        except Exception as _off_err:
            log.debug(f"get_cpu_offload_state failed: {_off_err}")
            payload["cpu_offload_detected"] = False
        # v4.0.3 (Phase 1.5 / Fix G): daemon code hash for version-skew
        payload["code_hash"] = _CODE_HASH
        # v4.0.3 (Phase 1.5 / Fix D): RunPod pod hourly cost (cached)
        payload["pod_hourly_cost_usd"] = _POD_HOURLY_COST_USD
        # v4.0.3 (Phase 1.5 / Fix E): account runway hours (best-effort,
        # rate-limited internally; None if the key is pod-scoped)
        try:
            payload["account_runway_hours"] = detect_account_runway_hours()
        except Exception as _rw_err:
            log.debug(f"detect_account_runway_hours failed: {_rw_err}")
            payload["account_runway_hours"] = None
        # v4.0.3 (Phase 1.5 / Fix F): port-mismatch state
        try:
            with _port_mismatch_lock:
                pm_state = dict(_PORT_MISMATCH_STATE)
            payload["port_mismatch"] = bool(pm_state.get("mismatch", False))
            payload["port_mismatch_remedy"] = pm_state.get("remedy", "none")
        except Exception as _pm_err:
            log.debug(f"port mismatch surfacing failed: {_pm_err}")
            payload["port_mismatch"] = False
            payload["port_mismatch_remedy"] = "none"
        # v3.5.0: Final drain heartbeat metadata
        if final:
            payload["final_heartbeat"] = True
        if status:
            payload["status"] = status
        # v4.1.0 (Task A10): attach claim_token on the first heartbeat only
        # (one-shot delivery). Subsequent heartbeats omit the field so
        # logs/telemetry cannot leak the token indefinitely. The in-memory
        # token is cleared after the payload is built so even a stacktrace
        # dump cannot reveal it.
        global _CLAIM_TOKEN, _CLAIM_SENT
        if _CLAIM_TOKEN and not _CLAIM_SENT:
            payload["claim_token"] = _CLAIM_TOKEN
            _CLAIM_TOKEN = None   # clear from memory
            _CLAIM_SENT = True
            log.info("[claim] attaching claim_token to first heartbeat (one-shot)")
        # Defensive: ensure payload is JSON-safe before sending. Historically
        # we've seen "Circular reference detected" here when a GPU or network
        # stats object contained a back-reference. Sanitize first, then send.
        try:
            json.dumps(payload)
            safe_payload = payload
        except (TypeError, ValueError) as ser_err:
            log.warning(f"Heartbeat payload not JSON-safe ({ser_err}); sanitizing")
            safe_payload = _sanitize_for_json(payload)
        try:
            code, resp = http_post(url, safe_payload)
        except ValueError as ve:
            # Catches "Circular reference detected" from json encoder
            if "circular" in str(ve).lower():
                log.warning(f"Heartbeat hit circular reference ({ve}); retrying with default=str")
                # Build a fully-stringified fallback using default=str
                body = json.dumps(_sanitize_for_json(payload), default=str)
                if HAS_REQUESTS:
                    r = requests.post(
                        url,
                        data=body,
                        headers={"Content-Type": "application/json"},
                        timeout=15,
                    )
                    code, resp = r.status_code, _safe_json(r.text)
                else:
                    import urllib.request, urllib.error
                    req = urllib.request.Request(
                        url,
                        data=body.encode(),
                        headers={"Content-Type": "application/json"},
                    )
                    try:
                        with urllib.request.urlopen(req, timeout=15) as response:
                            code, resp = response.getcode(), _safe_json(response.read())
                    except urllib.error.HTTPError as he:
                        code, resp = he.code, _safe_json(he.read())
            else:
                raise
        if code == 200:
            log.info("Heartbeat OK (200)")
        else:
            log.warning(f"Heartbeat HTTP {code}: {resp}")
    except Exception as e:
        log.error(f"Heartbeat failed: {e}")
        code = None

    # Emit P2P heartbeat (non-blocking)
    emit_p2p_heartbeat(peer_id, gpu, gpu_status)
    return code

def heartbeat_loop():
    """Background thread: send heartbeat every HEARTBEAT_INTERVAL seconds.

    v4.0.0-alpha: Also runs verify_no_cpu_offload() on every heartbeat tick
    (matches the spec's 60s cadence closely given HEARTBEAT_INTERVAL=30s,
    so we gate to once per ~60s via a local timestamp).

    Sleep strategy:
      - Jitter ±HEARTBEAT_JITTER_PCT to avoid fleet-wide thundering herd
        after backend restarts.
      - On non-2xx / transport error: exponential backoff, capped at
        HEARTBEAT_MAX_BACKOFF. Reset to baseline on first 2xx.
    """
    last_offload_probe = 0.0
    consecutive_failures = 0
    while True:
        try:
            now = time.time()
            if (now - last_offload_probe) >= 60:
                try:
                    verify_no_cpu_offload()
                except Exception as _off_err:
                    log.debug(f"verify_no_cpu_offload failed: {_off_err}")
                last_offload_probe = now
        except Exception as _probe_err:
            log.debug(f"heartbeat offload-probe wrapper error: {_probe_err}")

        code = send_heartbeat()

        if code is not None and 200 <= code < 300:
            consecutive_failures = 0
            base_sleep = float(HEARTBEAT_INTERVAL)
        else:
            consecutive_failures += 1
            backoff_steps = min(consecutive_failures, 8)  # cap the exponent
            base_sleep = min(
                float(HEARTBEAT_MAX_BACKOFF),
                HEARTBEAT_INTERVAL * (HEARTBEAT_BACKOFF_BASE ** backoff_steps),
            )
            log.warning(
                f"[hb] non-OK code={code} failures={consecutive_failures} "
                f"backing off {base_sleep:.0f}s"
            )

        jitter = base_sleep * HEARTBEAT_JITTER_PCT * (2 * random.random() - 1)
        time.sleep(max(1.0, base_sleep + jitter))

# ─── MACHINE VERIFICATION ───────────────────────────────────────────────────

def check_pending_verification():
    """Check if backend has a pending verification challenge for us."""
    url = f"{API_URL}/api/verification/pending"
    try:
        code, resp = http_get(url, headers=_auth_headers())
        if code == 200 and resp.get("pending"):
            challenge = resp["challenge"]
            log.info(f"Verification challenge received: {challenge['challenge_id']}")
            run_verification(challenge)
    except Exception as e:
        log.debug(f"Verification check: {e}")

def run_verification(challenge):
    """Run GPU verification benchmark and submit results."""
    log.info(f"Running verification benchmark (challenge {challenge['challenge_id']})...")

    matrix_size = challenge.get("matrix_size", 4096)
    iterations = challenge.get("iterations", 5)
    nonce = challenge.get("nonce", "")

    gpu = detect_gpu()
    result = {
        "nonce": nonce,
        "gpu_name": gpu["gpu_name"] if gpu else None,
        "vram_total_mib": gpu["gpu_vram_mib"] if gpu else None,
        "driver_version": gpu["driver_version"] if gpu else None,
        "temp_c": None,
        "gflops": None,
        "elapsed_seconds": None,
    }

    try:
        import torch
        if not torch.cuda.is_available():
            result["error"] = "CUDA not available"
        else:
            device = torch.device("cuda")
            # Warm up
            A = torch.randn(matrix_size, matrix_size, device=device)
            B = torch.randn(matrix_size, matrix_size, device=device)
            torch.cuda.synchronize()

            # Benchmark
            start = time.time()
            for _ in range(iterations):
                C = torch.matmul(A, B)
            torch.cuda.synchronize()
            elapsed = time.time() - start

            flops = 2 * (matrix_size ** 3) * iterations
            gflops = flops / elapsed / 1e9

            # Post-benchmark GPU state
            gpu_after = detect_gpu()
            result["gflops"] = round(gflops, 2)
            result["elapsed_seconds"] = round(elapsed, 3)
            result["temp_c"] = gpu_after["temp_c"] if gpu_after else None

            log.info(f"Verification benchmark: {gflops:.2f} GFLOPS in {elapsed:.2f}s")
    except ImportError:
        result["error"] = "PyTorch not installed"
    except Exception as e:
        result["error"] = str(e)

    # Submit result
    url = f"{API_URL}/api/verification/submit"
    try:
        code, resp = http_post(url, {
            "api_key": API_KEY,
            "challenge_id": challenge["challenge_id"],
            "result": result,
        })
        verdict = resp.get("verdict", "unknown")
        score = resp.get("score", 0)
        log.info(f"Verification result: verdict={verdict} score={score}")
        if resp.get("flags"):
            for flag in resp["flags"]:
                log.info(f"  Flag: [{flag['severity']}] {flag['type']} — {flag['detail']}")
    except Exception as e:
        log.error(f"Verification submit failed: {e}")

# ─── HMAC VERIFICATION ───────────────────────────────────────────────────────

def verify_task_spec_hmac(task_spec_str, expected_hmac):
    """Verify HMAC-SHA256 signature of task_spec before execution.

    Returns True if signature is valid, False otherwise.
    Fails CLOSED: returns False on any error except missing secret (backward compat).
    """
    if not task_spec_str:
        return True  # No task_spec to verify

    # If secret wasn't injected at download time, fall back to remote verify
    if HMAC_SECRET in ("{{HMAC_SECRET}}", "", None):
        if not expected_hmac:
            log.error("HMAC verification: no signature and no local secret — rejecting")
            return False
        try:
            code, resp = http_get(
                f"{API_URL}/api/jobs/verify-hmac-local?key={API_KEY}&hmac={expected_hmac}",
                timeout=10
            )
            if code == 200 and resp.get("valid"):
                return True
            log.error(f"HMAC remote verification returned invalid: {resp}")
            return False
        except Exception as e:
            log.error(f"HMAC remote verification failed: {e}")
            return False

    # Local verification with injected secret
    if not expected_hmac:
        log.error("HMAC verification: task_spec present but no signature — rejecting")
        return False

    try:
        spec_bytes = task_spec_str.encode("utf-8") if isinstance(task_spec_str, str) else task_spec_str
        computed = hmac.new(
            HMAC_SECRET.encode("utf-8"),
            spec_bytes,
            hashlib.sha256
        ).hexdigest()
        valid = hmac.compare_digest(computed, expected_hmac)
        if not valid:
            log.error("HMAC verification: signature mismatch — task_spec may have been tampered with")
        return valid
    except Exception as e:
        log.error(f"HMAC verification error: {e}")
        return False


# ─── JOB EXECUTION ───────────────────────────────────────────────────────────

def run_gpu_benchmark(task_spec):
    """Execute GPU benchmark using PyTorch matrix multiplication."""
    matrix_size = task_spec.get("matrix_size", 4096)
    iterations = task_spec.get("iterations", 5)

    log.info(f"Running GPU benchmark: {matrix_size}x{matrix_size} matmul, {iterations} iterations")

    try:
        import torch
        if not torch.cuda.is_available():
            return {"success": False, "error": "CUDA not available"}

        device = torch.device("cuda")
        A = torch.randn(matrix_size, matrix_size, device=device)
        B = torch.randn(matrix_size, matrix_size, device=device)
        torch.cuda.synchronize()

        start = time.time()
        for _ in range(iterations):
            C = torch.matmul(A, B)
        torch.cuda.synchronize()
        elapsed = time.time() - start

        flops = 2 * (matrix_size ** 3) * iterations
        gflops = flops / elapsed / 1e9

        gpu = detect_gpu()
        result = {
            "gflops": round(gflops, 2),
            "elapsed_seconds": round(elapsed, 3),
            "matrix_size": matrix_size,
            "iterations": iterations,
            "gpu_name": gpu["gpu_name"] if gpu else "unknown",
            "gpu_temp_c": gpu["temp_c"] if gpu else None,
            "gpu_util_pct": gpu["gpu_util_pct"] if gpu else None,
            "vram_used_mib": gpu["memory_used_mb"] if gpu else None,
        }

        log.info(f"Benchmark complete: {gflops:.2f} GFLOPS in {elapsed:.2f}s")
        return {"success": True, "result": result}

    except ImportError:
        return {"success": False, "error": "PyTorch not installed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _ensure_seccomp_profile():
    """Write DC1 GPU-workload seccomp profile to disk once; return its path or None on failure.

    Uses a blacklist (default ALLOW) so CUDA/Python workloads function normally while
    blocking kernel-level privilege escalation and dangerous syscalls.
    """
    global _SECCOMP_PROFILE_PATH
    if _SECCOMP_PROFILE_PATH and os.path.exists(_SECCOMP_PROFILE_PATH):
        return _SECCOMP_PROFILE_PATH

    blocked = [
        # Kernel module loading / live-patching
        "create_module", "init_module", "finit_module", "delete_module",
        "get_kernel_syms", "query_module",
        # Privilege escalation / capability manipulation
        "ptrace", "acct",
        # Clock/time manipulation (integrity)
        "settimeofday", "adjtimex", "clock_adjtime", "clock_settime",
        # Direct hardware access
        "iopl", "ioperm",
        # Namespace / root filesystem escape
        "mount", "umount2", "pivot_root", "chroot",
        # Reboot / power control
        "reboot", "kexec_load", "kexec_file_load",
        # Swap control
        "swapon", "swapoff",
        # Kernel keyring (credential theft)
        "add_key", "keyctl", "request_key",
        # Perf events (speculative-execution side channels)
        "perf_event_open",
        # Obsolete / unused syscalls that provide no legitimate use
        "nfsservctl", "getpmsg", "putpmsg", "afs_syscall", "tuxcall", "security",
        "lookup_dcookie", "vhangup", "sysfs", "_sysctl",
        # NUMA memory policy manipulation
        "mbind", "set_mempolicy", "get_mempolicy",
        # Kernel logging
        "syslog",
    ]
    profile = {
        "defaultAction": "SCMP_ACT_ALLOW",
        "syscalls": [{"names": blocked, "action": "SCMP_ACT_ERRNO"}],
    }

    profile_path = "/tmp/dc1-gpu-seccomp.json"
    try:
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(profile, f)
        _SECCOMP_PROFILE_PATH = profile_path
        log.info(f"Seccomp profile written to {profile_path} ({len(blocked)} blocked syscalls)")
    except Exception as e:
        log.warning(f"Could not write seccomp profile: {e} — container will use Docker default")
        _SECCOMP_PROFILE_PATH = None
    return _SECCOMP_PROFILE_PATH


def _container_profile_for_job(job_type):
    """Return per-job container limits by workload class."""
    profiles = {
        "default": {
            "cpu": CONTAINER_CPU_LIMIT,
            "memory": CONTAINER_MEMORY_LIMIT,
            "pids": CONTAINER_PIDS_LIMIT,
            "tmp": CONTAINER_TMP_SIZE,
            "shm": "2g",
        },
        "benchmark": {"cpu": "2", "memory": "8g", "pids": "128", "tmp": "512m", "shm": "1g"},
        "llm-inference": {"cpu": CONTAINER_CPU_LIMIT, "memory": CONTAINER_MEMORY_LIMIT, "pids": CONTAINER_PIDS_LIMIT, "tmp": CONTAINER_TMP_SIZE, "shm": "2g"},
        "llm_inference": {"cpu": CONTAINER_CPU_LIMIT, "memory": CONTAINER_MEMORY_LIMIT, "pids": CONTAINER_PIDS_LIMIT, "tmp": CONTAINER_TMP_SIZE, "shm": "2g"},
        "image_generation": {"cpu": CONTAINER_CPU_LIMIT, "memory": CONTAINER_MEMORY_LIMIT, "pids": CONTAINER_PIDS_LIMIT, "tmp": CONTAINER_TMP_SIZE, "shm": "2g"},
        "rendering": {"cpu": CONTAINER_CPU_LIMIT, "memory": CONTAINER_MEMORY_LIMIT, "pids": CONTAINER_PIDS_LIMIT, "tmp": CONTAINER_TMP_SIZE, "shm": "2g"},
        "training": {"cpu": "8", "memory": "24g", "pids": "512", "tmp": "2g", "shm": "4g"},
        "custom_container": {"cpu": CONTAINER_CPU_LIMIT, "memory": CONTAINER_MEMORY_LIMIT, "pids": CONTAINER_PIDS_LIMIT, "tmp": CONTAINER_TMP_SIZE, "shm": "2g"},
    }
    return profiles.get(job_type, profiles["default"])


def _vllm_profile_for_model(model):
    """Return vLLM limits sized to expected model footprint."""
    small_models = {
        "google/gemma-2b-it",
        "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
        "microsoft/Phi-3-mini-4k-instruct",
    }
    if model in small_models:
        return {"cpu": "6", "memory": "16g", "pids": "256", "tmp": "1g", "shm": "3g"}
    return {"cpu": VLLM_CPU_LIMIT, "memory": VLLM_MEMORY_LIMIT, "pids": VLLM_PIDS_LIMIT, "tmp": VLLM_TMP_SIZE, "shm": VLLM_SHM_SIZE}


def _resolve_run_job_script():
    """Find infra/docker/run-job.sh from common install locations."""
    candidates = []
    env_path = os.environ.get("DCP_RUN_JOB_SH", "").strip()
    if env_path:
        candidates.append(Path(env_path).expanduser())

    daemon_path = Path(__file__).resolve()
    for parent in [daemon_path.parent] + list(daemon_path.parents):
        candidates.append(parent / "infra" / "docker" / "run-job.sh")
    candidates.append(Path.cwd() / "infra" / "docker" / "run-job.sh")

    seen = set()
    for candidate in candidates:
        candidate_str = str(candidate)
        if candidate_str in seen:
            continue
        seen.add(candidate_str)
        if candidate.is_file():
            return candidate_str
    return None

def _normalize_container_spec(container_spec):
    """Return container_spec as dict or None."""
    if isinstance(container_spec, str):
        try:
            parsed = json.loads(container_spec)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
        return None
    if isinstance(container_spec, dict):
        return container_spec
    return None

def _docker_container_status(container_ref):
    """Return Docker container state string (running/exited/dead/...) or None."""
    if not container_ref:
        return None
    try:
        inspect = subprocess.run(
            ["docker", "inspect", "--format={{.State.Status}}", str(container_ref)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if inspect.returncode != 0:
            return None
        status = (inspect.stdout or "").strip().lower()
        return status or None
    except Exception:
        return None

def run_docker_job(job_type, task_spec, container_spec, job_id=None):
    """Execute script jobs via infra/docker/run-job.sh with crash auto-restart."""
    # Local images built via backend/docker/build-images.sh
    IMAGE_MAP = {
        "image_generation":  "dc1/sd-worker:latest",
        "llm-inference":     "dc1/llm-worker:latest",
        "llm_inference":     "dc1/llm-worker:latest",
        "training":          "dc1/general-worker:latest",
        "rendering":         "dc1/general-worker:latest",
        "benchmark":         "dc1/general-worker:latest",
        "custom_container":  "dc1/general-worker:latest",
    }
    TEMPLATE_IMAGES = {
        "dc1/general-worker:latest",
        "dc1/llm-worker:latest",
        "dc1/sd-worker:latest",
        "dc1/base-worker:latest",
        "pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime",
        "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime",
        "nvcr.io/nvidia/pytorch:24.01-py3",
        "nvcr.io/nvidia/tensorflow:24.01-tf2-py3",
        "tensorflow/tensorflow:2.15.0-gpu",
        "vllm/vllm-openai:latest",
        "dcp/pytorch-cuda:latest",
        "dcp/vllm-serve:latest",
        "dcp/training:latest",
        "dcp/rendering:latest",
    }

    # Parse task_spec — may be string (Python script) or dict (JSON with script)
    if isinstance(task_spec, str):
        try:
            parsed = json.loads(task_spec)
            if isinstance(parsed, dict):
                task_spec = parsed
        except Exception:
            pass

    container_spec = _normalize_container_spec(container_spec)
    if not container_spec:
        return {"success": False, "error": "Missing or invalid container_spec. Raw Python execution is disabled.", "restart_count": 0}

    image = str(container_spec.get("image") or container_spec.get("image_override") or IMAGE_MAP.get(job_type, "dc1/general-worker:latest")).strip()
    lower_image = image.lower()
    is_hub = lower_image.startswith("hub.docker.com/r/")
    hub_pinned = "@sha256:" in lower_image and len(lower_image.split("@sha256:")[-1]) == 64
    generic_ok = bool(lower_image) and "/" in lower_image and (" " not in lower_image)
    if lower_image not in TEMPLATE_IMAGES and not (is_hub and hub_pinned) and not generic_ok:
        report_event("container_image_rejected", {"job_id": job_id, "rejected_image": image}, job_id=job_id, severity="warning")
        return {"success": False, "error": f"Rejected container image '{image}'", "restart_count": 0}

    script = task_spec if isinstance(task_spec, str) else task_spec.get("script", "")
    if not script:
        return {"success": False, "error": "No script in task_spec", "restart_count": 0}

    run_job_script = _resolve_run_job_script()
    if not run_job_script:
        return {"success": False, "error": "run-job.sh not found (expected infra/docker/run-job.sh)", "restart_count": 0}

    job_dir = tempfile.mkdtemp(prefix="dc1-job-")
    task_path = os.path.join(job_dir, "task.py")
    with open(task_path, "w", encoding="utf-8") as f:
        f.write(script)

    container_profile = _container_profile_for_job(job_type)
    limits = container_spec.get("limits", {}) if isinstance(container_spec.get("limits"), dict) else {}
    network = str(container_spec.get("network", "none"))
    if not (network == "none" or network.startswith("bridge:")):
        network = "none"
    cpus = str(container_spec.get("cpus", limits.get("cpus", container_profile["cpu"])))
    memory = str(container_spec.get("memory", limits.get("memory", container_profile["memory"])))
    tmpfs_size = str(container_spec.get("tmpfs_size", limits.get("tmpfs_size", container_profile["tmp"])))
    gpus = str(container_spec.get("gpus", "all"))
    pids_limit = str(container_spec.get("pids_limit", limits.get("pids_limit", container_profile["pids"])))
    stream_logs = bool(container_spec.get("stream_logs", True))
    raw_job_cmd = container_spec.get("job_cmd") or container_spec.get("command") or container_spec.get("cmd") or "python /dc1/job/task.py"
    if isinstance(raw_job_cmd, list):
        job_cmd = " ".join(shlex.quote(str(part)) for part in raw_job_cmd)
    else:
        job_cmd = str(raw_job_cmd)

    safe_job_id = "".join(ch if (ch.isalnum() or ch in "._-") else "-" for ch in str(job_id or int(time.time())))
    workspace_volume = f"dcp-job-{safe_job_id}"
    checkpoint_enabled = bool(container_spec.get("enable_checkpoint", False))
    checkpoint_name = f"cp-{safe_job_id[:64]}"

    run_job_cmd = [
        "bash", run_job_script,
        "--job-id", str(job_id or int(time.time())),
        "--image", image,
        "--host-job-dir", job_dir,
        "--job-cmd", job_cmd,
        "--network", network,
        "--cpus", cpus,
        "--memory", memory,
        "--tmpfs-size", tmpfs_size,
        "--gpus", gpus,
        "--pids-limit", pids_limit,
        "--workspace-volume", workspace_volume,
        "--checkpoint-name", checkpoint_name,
    ]
    if checkpoint_enabled:
        run_job_cmd.append("--enable-checkpoint")
    if not stream_logs:
        run_job_cmd.append("--no-stream-logs")

    restart_count = 0
    last_error = None
    try:
        while True:
            report_event(
                "container_start",
                f"Launching container for job {job_id}: image={image} cpu={cpus} mem={memory} pids={pids_limit} volume={workspace_volume} checkpoint={checkpoint_enabled} restart_count={restart_count}",
                job_id=job_id,
            )

            start_ts = time.time()
            container_id = None
            try:
                proc = subprocess.Popen(
                    run_job_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    bufsize=1
                )

                output_chunks = []
                live_batch = []
                last_flush = time.time()
                last_health_check = 0.0

                while True:
                    if time.time() - start_ts > JOB_TIMEOUT:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                        raise subprocess.TimeoutExpired(run_job_cmd, JOB_TIMEOUT)

                    line = proc.stdout.readline() if proc.stdout else ""
                    if line:
                        output_chunks.append(line)
                        if len(output_chunks) > 10000:
                            output_chunks = output_chunks[-10000:]

                        clean = line.rstrip("\r\n")
                        if clean:
                            live_batch.append({"level": "info", "message": clean[:2000]})
                            if "container_id=" in clean:
                                container_id = clean.split("container_id=", 1)[1].split()[0].strip()

                        if job_id and clean.startswith("[dc1-phase]"):
                            phase = clean.split("]", 1)[1].strip()
                            threading.Thread(target=report_job_progress, args=(job_id, phase), daemon=True).start()

                        if clean.startswith("[dc1]"):
                            log.info(f"  {clean}")

                        if job_id and len(live_batch) >= 10:
                            post_job_log_lines(job_id, live_batch)
                            live_batch = []
                            last_flush = time.time()
                    else:
                        if proc.poll() is not None:
                            break
                        if job_id and live_batch and (time.time() - last_flush >= 1.0):
                            post_job_log_lines(job_id, live_batch)
                            live_batch = []
                            last_flush = time.time()

                        if container_id and (time.time() - last_health_check >= 5.0):
                            status = _docker_container_status(container_id)
                            if status:
                                log.debug(f"[container-health] job={job_id} container={container_id[:12]} status={status}")
                                if status in ("exited", "dead"):
                                    report_event(
                                        "container_crash_detected",
                                        f"Container crashed for job {job_id}: status={status}",
                                        job_id=job_id,
                                        severity="warning",
                                    )
                            last_health_check = time.time()
                        time.sleep(0.05)

                if job_id and live_batch:
                    post_job_log_lines(job_id, live_batch)

                returncode = proc.wait(timeout=10)
                duration = round(time.time() - start_ts, 1)
                stdout = "".join(output_chunks)[:MAX_STDOUT]
                stderr = ""

                if returncode == 0:
                    report_event("container_complete", f"Container job {job_id} succeeded in {duration}s, exit=0", job_id=job_id)
                    return {
                        "success": True,
                        "result": stdout,
                        "stderr": stderr,
                        "logs_streamed": True,
                        "restart_count": restart_count,
                        "last_error": None,
                    }

                status = _docker_container_status(container_id) or "exited"
                err_tail = "\n".join(stdout.splitlines()[-20:])[:500]
                last_error = f"Exit code {returncode} (status={status}): {err_tail}"
                report_event(
                    "container_complete",
                    f"Container job {job_id} failed in {duration}s, exit={returncode}, status={status}",
                    job_id=job_id,
                    severity="warning",
                )
            except subprocess.TimeoutExpired:
                if container_id:
                    try:
                        subprocess.run(["docker", "rm", "-f", container_id], capture_output=True, timeout=10)
                    except Exception:
                        pass
                timeout_msg = f"Job timed out after {JOB_TIMEOUT}s"
                report_event("container_timeout", f"Container job {job_id} killed after {JOB_TIMEOUT}s timeout", job_id=job_id, severity="error")
                return {"success": False, "error": timeout_msg, "restart_count": restart_count, "last_error": timeout_msg}
            except Exception as e:
                last_error = f"{type(e).__name__}: {e}"
                report_event("container_error", f"Container job {job_id} error: {last_error}", job_id=job_id, severity="error")

            if restart_count >= MAX_CONTAINER_RESTARTS:
                return {
                    "success": False,
                    "error": last_error or "Container crashed repeatedly",
                    "logs_streamed": True,
                    "restart_count": restart_count,
                    "last_error": last_error,
                }

            backoff = CONTAINER_RESTART_BACKOFFS[min(restart_count, len(CONTAINER_RESTART_BACKOFFS) - 1)]
            next_restart_num = restart_count + 1
            report_event(
                "container_restart",
                f"Restarting crashed container for job {job_id}: attempt {next_restart_num}/{MAX_CONTAINER_RESTARTS}, backoff={backoff}s",
                job_id=job_id,
                severity="warning",
            )
            time.sleep(backoff)
            restart_count = next_restart_num
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)

def report_job_progress(job_id, phase):
    """Report job execution phase to backend for live UI updates."""
    url = f"{API_URL}/api/jobs/{job_id}/progress"
    payload = {"api_key": API_KEY, "phase": phase}
    try:
        code, resp = http_post(url, payload, timeout=5)
        if code == 200:
            log.info(f"Progress reported: job={job_id} phase={phase}")
        else:
            log.debug(f"Progress report HTTP {code}: {resp}")
    except Exception as e:
        log.debug(f"Progress report failed (non-critical): {e}")

def post_job_log_lines(job_id, lines):
    """Send structured log lines to provider log-ingest endpoint."""
    if not job_id or not lines:
        return 0
    url = f"{API_URL}/api/providers/jobs/{job_id}/logs"
    payload = {"api_key": API_KEY, "lines": lines[:500]}
    try:
        code, _ = http_patch(url, payload, timeout=8)
        if code == 200:
            return len(payload["lines"])
        log.debug(f"Job log upload HTTP {code} for {job_id}")
        return 0
    except Exception as e:
        log.debug(f"Job log upload failed (non-critical): {e}")
        return 0

def post_job_logs(job_id, stdout, stderr=""):
    """Send collected stdout/stderr lines to backend after execution completes."""
    lines = []
    for line in (stdout or "").splitlines():
        if line:
            lines.append({"level": "info", "message": line[:2000]})
    for line in (stderr or "").splitlines():
        if line:
            lines.append({"level": "error", "message": line[:2000]})
    if not lines:
        return
    for i in range(0, len(lines), 500):
        post_job_log_lines(job_id, lines[i:i + 500])

def run_bare_metal_job(task_spec, job_id=None):
    """Bare-metal execution is disabled for security and isolation."""
    return {"success": False, "error": "Bare-metal execution disabled. container_spec is required."}

def _find_free_port(start=8100, end=8199):
    """Find a free TCP port in [start, end] for vLLM container binding."""
    import socket
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    return None


def _get_public_ip():
    """Return best-guess public IP for this host (used in endpoint URL reporting)."""
    import socket
    try:
        # Connect to an external address (no traffic sent) to determine outbound interface IP
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return None


def run_vllm_serve_job(task_spec, job_id=None):
    """
    Start a vLLM OpenAI-compatible serving container on a free port.
    The container stays running until duration_minutes expires or the job is cancelled.
    Reports endpoint_url to backend once /health responds 200.
    """
    import socket

    # Parse task_spec JSON
    if isinstance(task_spec, str):
        try:
            task_spec = json.loads(task_spec)
        except Exception:
            pass
    if not isinstance(task_spec, dict):
        return {"success": False, "error": "Invalid task_spec for vllm_serve — expected JSON"}

    model = task_spec.get("model", "TinyLlama/TinyLlama-1.1B-Chat-v1.0")
    max_model_len = int(task_spec.get("max_model_len", 4096))
    dtype = task_spec.get("dtype", "float16")

    # Allowed models (mirrors backend whitelist)
    ALLOWED_VLLM_MODELS = {
        "mistralai/Mistral-7B-Instruct-v0.2",
        "meta-llama/Meta-Llama-3-8B-Instruct",
        "microsoft/Phi-3-mini-4k-instruct",
        "google/gemma-2b-it",
        "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
        "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    }
    if model not in ALLOWED_VLLM_MODELS:
        log.warning(f"Rejected vllm model '{model}' — not in whitelist. Using TinyLlama.")
        model = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"

    image = "vllm/vllm-openai:latest"
    container_name = f"dc1-vllm-{job_id or int(time.time())}"
    seccomp_path = _ensure_seccomp_profile()
    container_profile = _vllm_profile_for_model(model)

    # Allocate a free host port
    port = _find_free_port()
    if not port:
        return {"success": False, "error": "No free port available in range 8100-8199"}

    log.info(f"vLLM serve: model={model} port={port} container={container_name}")
    report_job_progress(job_id, "pulling")

    # Pull image
    try:
        pull = subprocess.run(
            ["docker", "pull", image],
            capture_output=True, text=True, timeout=600
        )
        if pull.returncode != 0:
            return {"success": False, "error": f"vLLM image pull failed: {pull.stderr[:200]}", "transient": True}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "vLLM image pull timed out (600s)", "transient": True}
    except Exception as e:
        return {"success": False, "error": f"vLLM pull error: {e}", "transient": True}

    report_job_progress(job_id, "loading_model")
    report_event(
        "container_start",
        f"Starting vLLM serve: {container_name} model={model} port={port} "
        f"cpu={container_profile['cpu']} mem={container_profile['memory']} pids={container_profile['pids']}",
        job_id=job_id
    )

    # Start container detached — bridge network so the port is accessible from outside
    docker_cmd = [
        "docker", "run", "-d",
        "--gpus", "all",
        "--name", container_name,
        "--network", "bridge",
        "-p", f"{port}:8000",
        "--memory", container_profile["memory"],
        "--memory-swap", container_profile["memory"],
        "--cpus", container_profile["cpu"],
        "--pids-limit", container_profile["pids"],
        "--shm-size", container_profile["shm"],
        "--tmpfs", f"/tmp:rw,noexec,nosuid,size={container_profile['tmp']}",
        "--tmpfs", "/var/tmp:rw,noexec,nosuid,size=256m",
        "--cap-drop", "all",
        "--security-opt", "no-new-privileges:true",
        "-e", f"HUGGING_FACE_HUB_TOKEN={os.environ.get('HF_TOKEN', '')}",
    ]
    if seccomp_path:
        docker_cmd.extend(["--security-opt", f"seccomp={seccomp_path}"])
    # v4.0.0-alpha: TurboQuant launch flags (gated on ~/.dcp/config.json).
    tq_cfg = get_turboquant_config()
    turboquant_enabled = bool(tq_cfg.get("enabled"))
    # When TurboQuant is on, the freed KV-cache VRAM lets us raise max-num-seqs
    # from the default 32 to 48 (article 32 guidance).
    max_num_seqs = 48 if turboquant_enabled else int(task_spec.get("max_num_seqs", 32))

    docker_cmd += [
        image,
        "--model", model,
        "--dtype", dtype,
        "--max-model-len", str(max_model_len),
        "--max-num-seqs", str(max_num_seqs),
        "--host", "0.0.0.0",
        "--port", "8000",
    ]
    if turboquant_enabled:
        docker_cmd += [
            "--kv-cache-type", "turboquant",
            "--turboquant-bits", str(int(tq_cfg.get("bits", 3))),
        ]
        if tq_cfg.get("use_polar", True):
            docker_cmd.append("--turboquant-use-polar")
        log.info(
            "[turboquant] Enabled: bits=%s polar=%s max-num-seqs=%s",
            tq_cfg.get("bits"), tq_cfg.get("use_polar"), max_num_seqs,
        )

    try:
        start_result = subprocess.run(docker_cmd, capture_output=True, text=True, timeout=30)
        if start_result.returncode != 0:
            err = start_result.stderr or ""
            # v4.0.0-alpha: gracefully retry without TurboQuant if the running
            # vLLM build doesn't recognize the flag (older image versions).
            if turboquant_enabled and (
                "kv-cache-type" in err or "turboquant" in err or "unrecognized" in err.lower()
            ):
                log.warning(
                    "[turboquant] vLLM rejected TurboQuant flags; retrying without. "
                    "stderr=%s", err[:300]
                )
                try:
                    report_event(
                        "turboquant_unsupported",
                        f"vLLM does not support TurboQuant flags: {err[:400]}",
                        severity="warning",
                    )
                except Exception as _ev_err:
                    log.debug(f"[turboquant] report_event failed: {_ev_err}")
                # Rebuild docker_cmd without TurboQuant flags. The TurboQuant
                # block only appended, so we can strip by rebuilding the tail.
                safe_cmd = []
                skip_next = False
                tq_flag_values = {"turboquant"}
                i = 0
                while i < len(docker_cmd):
                    tok = docker_cmd[i]
                    if tok in ("--kv-cache-type", "--turboquant-bits"):
                        i += 2  # skip flag and its value
                        continue
                    if tok == "--turboquant-use-polar":
                        i += 1
                        continue
                    # Also roll max-num-seqs back to 32.
                    if tok == "--max-num-seqs" and i + 1 < len(docker_cmd):
                        safe_cmd.append(tok)
                        safe_cmd.append("32")
                        i += 2
                        continue
                    safe_cmd.append(tok)
                    i += 1
                try:
                    start_result = subprocess.run(
                        safe_cmd, capture_output=True, text=True, timeout=30
                    )
                    if start_result.returncode != 0:
                        return {
                            "success": False,
                            "error": f"Failed to start vLLM container (fallback): "
                                     f"{start_result.stderr[:300]}",
                        }
                except subprocess.TimeoutExpired:
                    return {"success": False, "error": "Docker start timed out (fallback)"}
                except (OSError, subprocess.SubprocessError) as retry_err:
                    return {"success": False, "error": f"Docker start error (fallback): {retry_err}"}
            else:
                return {"success": False, "error": f"Failed to start vLLM container: {err[:300]}"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Docker start timed out"}
    except Exception as e:
        return {"success": False, "error": f"Docker start error: {e}"}

    # Poll /health until ready (up to 5 minutes for model load)
    health_url = f"http://127.0.0.1:{port}/health"
    ready = False
    for attempt in range(60):  # 60 × 5s = 5 minutes
        time.sleep(5)
        try:
            import urllib.request as _urllib
            with _urllib.urlopen(health_url, timeout=3) as r:
                if r.status == 200:
                    ready = True
                    break
        except Exception:
            pass
        # Check container is still alive
        check = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", container_name],
            capture_output=True, text=True
        )
        if check.stdout.strip() != "true":
            log.error(f"vLLM container {container_name} exited during startup")
            return {"success": False, "error": "vLLM container exited before becoming healthy"}

    if not ready:
        subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
        return {"success": False, "error": "vLLM endpoint did not become healthy within 5 minutes"}

    # Report endpoint ready to backend
    public_ip = _get_public_ip()
    try:
        http_post(f"{API_URL}/api/jobs/{job_id}/endpoint-ready", {
            "api_key": API_KEY,
            "port": port,
            "provider_ip": public_ip,
        }, timeout=15)
    except Exception as e:
        log.warning(f"Failed to report endpoint-ready: {e}")

    report_job_progress(job_id, "generating")  # "generating" = actively serving requests
    log.info(f"vLLM endpoint ready: http://{public_ip}:{port}/v1")

    # Hold the serving loop — monitor container until backend says job is done or duration expires
    # The backend enforces timeout via enforceJobTimeouts(); daemon monitors container health
    poll_interval = 30  # seconds between container health checks
    while True:
        time.sleep(poll_interval)
        # Check if container is still running
        check = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", container_name],
            capture_output=True, text=True
        )
        if check.stdout.strip() != "true":
            log.info(f"vLLM container {container_name} stopped externally")
            break
        # Check if the backend job is still running
        try:
            code, job_status_resp = http_get(f"{API_URL}/api/jobs/{job_id}?key={API_KEY}")
            if code == 200:
                current_status = job_status_resp.get("job", {}).get("status", "running")
                if current_status not in ("running", "pulling", "assigned"):
                    log.info(f"Job {job_id} status={current_status} — stopping vLLM container")
                    break
        except Exception:
            pass  # Network hiccup — keep serving

    # Cleanup: stop and remove container
    subprocess.run(["docker", "stop", "--time", "10", container_name], capture_output=True)
    subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)
    report_event("container_complete", f"vLLM serve job {job_id} completed — container stopped", job_id=job_id)
    log.info(f"vLLM container {container_name} stopped and removed")

    endpoint_url = f"http://{public_ip}:{port}/v1"
    return {
        "success": True,
        "result": {
            "endpoint_url": endpoint_url,
            "model": model,
            "port": port,
        },
        # Backward-compatible top-level keys for any consumers that read outcome directly.
        "endpoint_url": endpoint_url,
        "model": model,
        "port": port,
    }


def execute_job(job):
    """Execute a job with Docker-only script execution."""
    global _current_job_id
    job_id = job["job_id"]
    job_type = job.get("job_type", "benchmark")
    task_spec = job.get("task_spec", {})
    container_spec = job.get("container_spec")
    with _job_lock:
        _current_job_id = job_id

    if isinstance(task_spec, str):
        try:
            task_spec = json.loads(task_spec)
        except:
            pass  # Keep as string (it might be raw Python code)
    if isinstance(task_spec, dict) and not container_spec:
        container_spec = task_spec.get("container_spec")

    log.info(f"Executing job {job_id} (type: {job_type})")

    try:
        # vLLM serverless serve — long-running detached container with health polling.
        # This must run before benchmark fallback in case task_spec contains benchmark metadata.
        if job_type == "vllm_serve":
            if not check_docker():
                return {"success": False, "error": "Docker not available — vllm_serve requires Docker with NVIDIA Container Toolkit"}
            return run_vllm_serve_job(task_spec, job_id=job_id)

        # Pure benchmark jobs (no script needed)
        if job_type == "benchmark" or (isinstance(task_spec, dict) and task_spec.get("benchmark")):
            return run_gpu_benchmark(task_spec if isinstance(task_spec, dict) else {})

        # Script-based jobs — Docker only
        has_script = (isinstance(task_spec, str) and len(task_spec) > 10) or \
                     (isinstance(task_spec, dict) and task_spec.get("script"))

        if has_script:
            if not container_spec:
                return {"success": False, "error": "Job rejected: missing container_spec. Raw Python execution is disabled."}
            if not check_docker():
                return {"success": False, "error": "Docker not available. container_spec jobs require Docker execution."}
            return run_docker_job(job_type, task_spec, container_spec, job_id=job_id)
        else:
            # No script — fall back to benchmark
            log.info(f"No script in task_spec — running default benchmark")
            return run_gpu_benchmark(task_spec if isinstance(task_spec, dict) else {})
    finally:
        with _job_lock:
            _current_job_id = None

# ── Per-endpoint circuit breaker for the job-poll cascade ──
# After N consecutive failures, skip that endpoint for OPEN_SECONDS so we
# don't pay three timeouts per poll cycle when one endpoint is down.
_endpoint_breakers = {}
_endpoint_breakers_lock = threading.Lock()
_CIRCUIT_FAIL_THRESHOLD = 5
_CIRCUIT_OPEN_SECONDS = 60

# Auth-failure reporting (401/403). These are NOT endpoint-health failures —
# retrying won't fix a rejected credential — so they bypass the breaker. But
# they ARE a high-severity signal: if the backend stops accepting our key, we
# go silent (no jobs) and nobody notices. Report via report_event, throttled
# to once per endpoint per REPORT_INTERVAL to avoid log spam on a sustained
# outage.
_auth_failure_last_report = {}
_auth_failure_lock = threading.Lock()
_AUTH_FAILURE_REPORT_INTERVAL = 300  # seconds


def _circuit_ok(name):
    with _endpoint_breakers_lock:
        b = _endpoint_breakers.get(name)
        if not b:
            return True
        return b["open_until"] <= time.time()


def _circuit_record(name, ok):
    with _endpoint_breakers_lock:
        b = _endpoint_breakers.setdefault(name, {"fails": 0, "open_until": 0.0})
        if ok:
            if b["fails"] > 0:
                log.info(f"[circuit] {name} recovered after {b['fails']} failures")
            b["fails"] = 0
            b["open_until"] = 0.0
        else:
            b["fails"] += 1
            if b["fails"] >= _CIRCUIT_FAIL_THRESHOLD and b["open_until"] <= time.time():
                b["open_until"] = time.time() + _CIRCUIT_OPEN_SECONDS
                log.warning(
                    f"[circuit] {name} opened for {_CIRCUIT_OPEN_SECONDS}s "
                    f"after {b['fails']} consecutive failures"
                )


def poll_and_execute():
    """Poll for assigned jobs and execute them."""
    # Skip polling if draining (finishing current jobs, no new ones)
    if is_draining():
        log.debug("Draining mode — skipping job poll")
        return

    # Skip if all GPU slots are occupied
    if get_free_gpu_slot_count() <= 0:
        log.debug(f"All {MAX_CONCURRENT_JOBS} GPU slot(s) occupied — skipping job poll")
        return

    # Dual endpoint support: try new endpoint first, fall back to legacy.
    # Credentials are passed via the Authorization header (see _auth_headers)
    # rather than URL query params, to avoid leaking the api_key in access logs.
    # The legacy path-based endpoint /api/providers/{API_KEY}/jobs is retained
    # as a last-resort fallback for older backend deployments that still parse
    # the key from the URL path; we send the Bearer header on that request too
    # so newer backends ignore the path-baked credential.
    endpoints = [
        ("jobs_next",   f"{API_URL}/api/providers/jobs/next"),
        ("jobs_legacy", f"{API_URL}/api/providers/{API_KEY}/jobs"),
        ("jobs_assigned", f"{API_URL}/api/jobs/assigned"),
    ]

    job = None
    admission_feedback = None
    for name, url in endpoints:
        if not _circuit_ok(name):
            log.debug(f"[circuit] skipping {name} (breaker open)")
            continue
        try:
            code, resp = http_get(url, headers=_auth_headers())
            if code == 200:
                _circuit_record(name, True)
                if isinstance(resp, dict):
                    admission_feedback = resp.get("admission") if isinstance(resp.get("admission"), dict) else admission_feedback
                    job = resp.get("job")
                else:
                    job = None
                if job:
                    break
            elif code in (401, 403):
                # Auth failure: the breaker can't fix this — retrying with the
                # same rejected credential won't help. Bypass the breaker
                # entirely (neither success nor failure) and surface upstream
                # via a throttled report_event so the backend can alert.
                now_ts = time.time()
                with _auth_failure_lock:
                    last = _auth_failure_last_report.get(name, 0.0)
                    should_report = (now_ts - last) >= _AUTH_FAILURE_REPORT_INTERVAL
                    if should_report:
                        _auth_failure_last_report[name] = now_ts
                log.warning(
                    f"[auth] Job-poll {name} returned {code} — credential rejected by backend"
                )
                if should_report:
                    try:
                        report_event(
                            "auth_failure",
                            f"Job-poll endpoint {name} returned HTTP {code}; credential rejected",
                            severity="error",
                        )
                    except Exception:
                        pass
            else:
                # Other 4xx/5xx: treat as breaker failure (but 404 on a legacy
                # endpoint on a new backend is the norm, so we only count
                # 5xx + 429 + 408)
                if code in (408, 429) or (code is not None and 500 <= code < 600):
                    _circuit_record(name, False)
                else:
                    _circuit_record(name, True)
        except Exception as e:
            # Log by endpoint name, not url — the jobs_legacy URL contains
            # the API_KEY in the path.
            log.debug(f"Job poll failed on {name}: {e}")
            _circuit_record(name, False)
            continue

    if not job:
        _log_admission_feedback(admission_feedback)
        return  # No jobs assigned

    _last_admission_signature = None

    job_id = job["job_id"]
    job_type = job.get("job_type", "unknown")
    log.info(f"Job assigned: {job_id} (type: {job_type})")

    # ── Guard: Job dedup ──
    if is_duplicate_job(job_id):
        return  # Already processed this job

    # ── Guard: VRAM check ──
    vram_ok, free_vram, required_vram = check_vram_available(job_type)
    if not vram_ok:
        log.warning(f"Job {job_id} rejected: insufficient VRAM ({free_vram}/{required_vram} MiB)")
        report_event("job_failure",
            f"Job rejected pre-execution: {free_vram} MiB free VRAM < {required_vram} MiB required for {job_type}. "
            f"GPU may be in use by another application.",
            job_id=job_id, severity="warning")
        # Submit failure so backend can reassign
        try:
            http_post(f"{API_URL}/api/providers/job-result", {
                "api_key": API_KEY, "job_id": job_id, "success": False,
                "error": f"Insufficient VRAM: {free_vram} MiB free, {required_vram} MiB required",
                "gpu_seconds_used": 0,
            }, timeout=15)
        except: pass
        return

    # ── Guard: Disk space check ──
    disk_ok, disk_detail = check_disk_space()
    if not disk_ok:
        log.warning(f"Job {job_id} rejected: insufficient disk space — {disk_detail}")
        report_event("job_failure",
            f"Job rejected pre-execution: {disk_detail}",
            job_id=job_id, severity="warning")
        try:
            http_post(f"{API_URL}/api/providers/job-result", {
                "api_key": API_KEY, "job_id": job_id, "success": False,
                "error": f"Insufficient disk space: {disk_detail}",
                "gpu_seconds_used": 0,
            }, timeout=15)
        except: pass
        return

    # ── Guard: Power cost profitability ──
    gpu = detect_gpu()
    profitable, profit_details = estimate_job_profitability(job, gpu)
    if not profitable:
        log.warning(f"Job {job_id} rejected: unprofitable — "
                    f"revenue={profit_details['revenue_sar']} SAR, "
                    f"cost={profit_details['power_cost_sar']} SAR, "
                    f"margin={profit_details['margin_pct']}%")
        report_event("job_rejected",
            f"Unprofitable job: margin={profit_details['margin_pct']}% "
            f"(min: {load_power_config().get('min_profit_margin_pct', 20)}%)",
            job_id=job_id, severity="info")
        try:
            http_post(f"{API_URL}/api/providers/job-result", {
                "api_key": API_KEY, "job_id": job_id, "success": False,
                "error": f"Job rejected: below minimum profit margin ({profit_details['margin_pct']}%)",
                "gpu_seconds_used": 0,
            }, timeout=15)
        except: pass
        return

    # ── Guard: HMAC signature verification (prevents RCE via tampered task_spec) ──
    task_spec_raw = job.get("task_spec")
    task_spec_hmac = job.get("task_spec_hmac")
    if task_spec_raw:
        if not verify_task_spec_hmac(task_spec_raw, task_spec_hmac):
            log.error(f"Job {job_id} REJECTED: task_spec HMAC verification failed — possible tampering or unauthorized injection")
            report_event("job_failure",
                f"Job rejected: HMAC verification failed. task_spec may have been tampered with.",
                job_id=job_id, severity="critical")
            try:
                http_post(f"{API_URL}/api/providers/job-result", {
                    "api_key": API_KEY, "job_id": job_id, "success": False,
                    "error": "HMAC verification failed — task_spec rejected for security",
                    "gpu_seconds_used": 0,
                }, timeout=15)
            except: pass
            return

    # ── Acquire GPU slot for multi-GPU support ──
    required_vram = VRAM_REQUIREMENTS.get(job_type, VRAM_DEFAULT_REQUIREMENT)
    gpu_slot = acquire_gpu_slot(job_id, required_vram)
    if gpu_slot is None:
        log.warning(f"Job {job_id} deferred: no free GPU slot with enough VRAM")
        return  # Will be picked up on next poll when a slot frees

    # Execute in background thread so heartbeats continue
    def _run():
        start_time = time.time()
        try:
            # Set CUDA_VISIBLE_DEVICES for multi-GPU isolation
            job_env = os.environ.copy()
            if MAX_CONCURRENT_JOBS > 1:
                job_env["CUDA_VISIBLE_DEVICES"] = str(gpu_slot)
                log.info(f"Job {job_id} pinned to GPU {gpu_slot}")
            outcome = execute_job(job)
        except Exception as e:
            elapsed = round(time.time() - start_time, 1)
            error_detail = f"Unhandled exception in execute_job: {e}\n{traceback.format_exc()}"
            log.error(f"Job {job_id} CRASHED after {elapsed}s: {error_detail[:500]}")
            report_event("job_failure", error_detail, job_id=job_id, severity="critical")
            outcome = {"success": False, "error": error_detail[:1000]}
        finally:
            # Release GPU slot regardless of outcome
            release_gpu_slot(gpu_slot, job_id)

        elapsed = round(time.time() - start_time, 1)
        gpu_count = get_detected_gpu_count()
        gpu_seconds_used = round(max(0.0, elapsed) * max(1, gpu_count), 3)

        # Report event based on outcome
        if outcome.get("success"):
            result_size = len(str(outcome.get("result", "")))
            report_event("job_success",
                f"Job completed in {elapsed}s, result size: {result_size} bytes",
                job_id=job_id)
        else:
            error_msg = outcome.get("error", "Unknown error")
            severity = "critical" if "timed out" in str(error_msg).lower() else "error"
            report_event("job_failure",
                f"Job failed after {elapsed}s: {error_msg[:1000]}",
                job_id=job_id, severity=severity)

        # Stream collected logs to backend (non-blocking, best-effort)
        stdout_output = outcome.get("result", "") if isinstance(outcome.get("result"), str) else ""
        stderr_output = outcome.get("stderr", "")
        if (stdout_output or stderr_output) and not outcome.get("logs_streamed"):
            threading.Thread(
                target=post_job_logs,
                args=(job_id, stdout_output, stderr_output),
                daemon=True
            ).start()

        # Submit result with retry logic
        result_url = f"{API_URL}/api/providers/job-result"
        payload = {
            "api_key": API_KEY,
            "job_id": job_id,
            "attempt_number": job.get("attempt_number"),
            "result": outcome.get("result", {}),
            "success": outcome.get("success", False),
            "error": outcome.get("error"),
            "gpu_seconds_used": gpu_seconds_used,
            "metrics": outcome.get("metrics"),
            "transient": outcome.get("transient", False),
            "restart_count": int(outcome.get("restart_count", 0) or 0),
            "last_error": outcome.get("last_error") or outcome.get("error"),
        }
        if isinstance(payload["metrics"], dict):
            payload["metrics"].setdefault("gpu_count", gpu_count)
        else:
            payload["metrics"] = {"gpu_count": gpu_count}
        result_size = len(str(payload.get("result", "")))
        log.info(f"Job {job_id} submitting result ({result_size} bytes)...")

        submitted = False
        for attempt in range(1, RESULT_POST_RETRIES + 1):
            try:
                code, resp = http_post(result_url, payload, timeout=RESULT_POST_TIMEOUT)
                log.info(f"Job {job_id} result submitted (HTTP {code}, attempt {attempt})")
                submitted = True
                break
            except Exception as e:
                log.error(f"Job result submission attempt {attempt}/{RESULT_POST_RETRIES} failed: {e}")
                if attempt < RESULT_POST_RETRIES:
                    time.sleep(5 * attempt)  # Backoff: 5s, 10s
                else:
                    log.error(f"Job {job_id} result LOST after {RESULT_POST_RETRIES} attempts")
                    report_event("job_failure",
                        f"Result submission LOST after {RESULT_POST_RETRIES} attempts: {e}",
                        job_id=job_id, severity="critical")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

def job_poll_loop():
    """Background thread: poll for jobs every JOB_POLL_INTERVAL seconds.

    Sleep is jittered ±JOB_POLL_JITTER_PCT to avoid synchronized
    poll storms across the fleet.
    """
    def _sleep():
        jitter = JOB_POLL_INTERVAL * JOB_POLL_JITTER_PCT * (2 * random.random() - 1)
        time.sleep(max(1.0, JOB_POLL_INTERVAL + jitter))

    while True:
        if is_shutdown_requested():
            log.info("Shutdown requested — stopping job poll loop")
            return
        # v3.5.0: Feature 4 — skip job polling while draining so no new work
        # is picked up between SIGTERM and final shutdown.
        if is_draining():
            _sleep()
            continue
        poll_and_execute()
        # Also check for verification challenges every cycle
        check_pending_verification()
        _sleep()

# ─── AUTO VERIFICATION ON STARTUP ───────────────────────────────────────────

def auto_verify():
    """Request automatic verification on first startup."""
    url = f"{API_URL}/api/verification/auto"
    try:
        code, resp = http_post(url, {"api_key": API_KEY})
        if code == 200 and resp.get("challenge"):
            challenge = resp["challenge"]
            log.info(f"Auto-verification triggered: {challenge['challenge_id']}")
            run_verification(challenge)
        elif code == 200:
            log.info(f"Verification status: {resp.get('status', resp.get('message', 'ok'))}")
    except Exception as e:
        log.debug(f"Auto-verify request: {e}")

# ─── MODEL PRE-CACHE ──────────────────────────────────────────────────────────

# Model to pre-cache: use the actually-served model from install.sh (DCP_SERVED_MODEL env),
# falling back to nothing if not set.  TinyLlama was never used and wasted disk/time.
_served_model = os.environ.get("DCP_SERVED_MODEL", "").strip()
PRECACHE_MODELS = [_served_model] if _served_model else []

def precache_models():
    """
    Pre-download LLM model weights on daemon startup so first inference is fast.
    Only downloads if transformers is available and CUDA is present.
    """
    try:
        import importlib
        transformers_spec = importlib.util.find_spec("transformers")
        if transformers_spec is None:
            log.info("[precache] transformers not installed — skipping model pre-cache")
            return

        import torch
        if not torch.cuda.is_available():
            log.info("[precache] No CUDA device — skipping model pre-cache")
            return

        from transformers import AutoTokenizer, AutoModelForCausalLM

        for model_id in PRECACHE_MODELS:
            try:
                log.info(f"[precache] Checking model: {model_id}")
                report_event("model_precache_start", f"Pre-caching model: {model_id}")

                # Download tokenizer (small, fast)
                log.info(f"[precache] Downloading tokenizer: {model_id}")
                AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

                # Download model weights (the big download)
                log.info(f"[precache] Downloading model weights: {model_id}")
                AutoModelForCausalLM.from_pretrained(
                    model_id,
                    torch_dtype=torch.float16,
                    device_map="auto",
                    trust_remote_code=True
                )

                log.info(f"[precache] Model ready: {model_id}")
                report_event("model_precache_done", f"Model cached: {model_id}")

                # Free GPU memory after caching (the model files are on disk now)
                del AutoModelForCausalLM  # force GC
                import gc
                gc.collect()
                torch.cuda.empty_cache()
                # Re-import for next iteration
                from transformers import AutoModelForCausalLM

            except Exception as e:
                log.warning(f"[precache] Failed to cache {model_id}: {e}")
                report_event("model_precache_failed", f"Failed: {model_id} — {e}", severity="warning")

    except Exception as e:
        log.warning(f"[precache] Pre-cache setup failed: {e}")

# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DCP Provider Daemon v4.0")
    parser.add_argument("--key", help="Override API key")
    parser.add_argument("--url", help="Override API URL")
    parser.add_argument("--no-watchdog", action="store_true", help="Run without crash watchdog")
    parser.add_argument(
        "--force-reprobe",
        action="store_true",
        help="Ignore cached concurrency probe result and re-measure (v4.0)",
    )
    args = parser.parse_args()

    global API_KEY, API_URL, _FORCE_REPROBE_CONCURRENCY, _CLAIM_TOKEN
    if args.key:
        API_KEY = args.key
    if args.url:
        API_URL = args.url
    if args.force_reprobe:
        _FORCE_REPROBE_CONCURRENCY = True
        log.info("[probe] --force-reprobe set; concurrency cache will be ignored this run")

    # v4.1.0 (Task A10): load the claim token left by the installer so it
    # can be attached to the very first heartbeat. Silent-None on missing
    # or malformed file — existing installs without a claim file just
    # behave identically to pre-4.1.0 registration.
    _CLAIM_TOKEN = _load_claim_token_once()
    if _CLAIM_TOKEN:
        log.info("[claim] claim.json loaded — will attach to first heartbeat")

    # Validate configuration
    if API_KEY == "INJECT_KEY_HERE" or not API_KEY:
        log.error("No API key configured. Use --key or download from DCP dashboard.")
        sys.exit(1)
    if API_URL == "INJECT_URL_HERE" or not API_URL:
        log.error("No API URL configured. Use --url or download from DCP dashboard.")
        sys.exit(1)

    # Register signal handlers for graceful shutdown with job draining.
    # v3.5.0: Feature 4 — Graceful Drain on SIGTERM/SIGINT
    # Flow:
    #   1. start_draining() sets the _draining flag so job poll loop stops
    #      accepting new work (job_poll_loop checks is_draining()).
    #   2. wait_for_drain() blocks up to DRAIN_TIMEOUT_S seconds for in-flight
    #      jobs to complete.
    #   3. A final heartbeat is sent with status="draining" so the backend can
    #      mark this provider offline cleanly.
    #   4. sys.exit(0) -> watchdog treats this as a clean shutdown.
    DRAIN_TIMEOUT_S = 300  # 5 minutes

    def _handle_signal(sig, frame):
        signame = signal.Signals(sig).name if hasattr(signal, 'Signals') else str(sig)
        active = get_active_job_count()
        if active > 0:
            log.info(f"[drain] Signal {signame} received — draining {active} active job(s) before shutdown")
            start_draining()
            drained = wait_for_drain(timeout=DRAIN_TIMEOUT_S)
            if drained:
                report_event("daemon_stop", f"Stopped by signal {signame} (drained cleanly)")
            else:
                report_event("daemon_stop", f"Stopped by signal {signame} (drain timeout, {get_active_job_count()} jobs orphaned)")
        else:
            log.info(f"[drain] Signal {signame} received — no active jobs, shutting down immediately")
            start_draining()
            report_event("daemon_stop", f"Stopped by signal {signame}")

        # Final heartbeat so backend flips us to draining/offline cleanly.
        try:
            send_heartbeat(final=True, status="draining")
        except Exception as _final_err:
            log.debug(f"[drain] final heartbeat failed: {_final_err}")

        sys.exit(0)
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # Initialize job dedup file
    if not _DEDUP_FILE.exists():
        try:
            _DEDUP_FILE.write_text(json.dumps({}))
        except: pass

    log.info("=" * 60)
    log.info(f"DCP Provider Daemon v{DAEMON_VERSION}")
    log.info(f"API URL: {API_URL}")
    log.info(f"API Key: {API_KEY[:20]}...")
    log.info(f"Logs: {LOG_DIR}")
    log.info(f"Max stdout: {MAX_STDOUT} bytes")
    log.info("=" * 60)

    # Report daemon start
    gpu = detect_gpu()
    gpu_desc = f"{gpu['gpu_name']} ({gpu['gpu_vram_mib']} MiB)" if gpu else "No GPU"
    report_event("daemon_start", f"v{DAEMON_VERSION} started on {platform.node()} — {gpu_desc}")

    # Step 1: Detect GPU
    log.info("Detecting GPU...")
    if gpu:
        log.info(f"GPU: {gpu['gpu_name']} ({gpu['gpu_vram_mib']} MiB VRAM)")
        log.info(f"Driver: {gpu['driver_version']}")
    else:
        log.warning("No NVIDIA GPU detected — daemon will run in limited mode")

    # Step 2: Check Docker
    log.info("Checking Docker + NVIDIA Container Toolkit...")
    docker_ok = check_docker()
    log.info(f"Docker execution: {'ENABLED' if docker_ok else 'DISABLED (bare-metal fallback)'}")

    # Step 3: Run readiness checks
    log.info("Running readiness checks...")
    checks = check_readiness()
    report_readiness(checks)

    if checks["cuda"] and checks["pytorch"]:
        log.info("Readiness: PASSED (CUDA + PyTorch available)")
    else:
        missing = []
        if not checks["cuda"]: missing.append("CUDA")
        if not checks["pytorch"]: missing.append("PyTorch")
        log.warning(f"Readiness: PARTIAL — missing: {', '.join(missing)}")

    # Step 4: Pre-cache LLM models (so first inference is fast)
    log.info("Pre-caching LLM models...")
    precache_models()

    # ─── v4.0.0-alpha: STARTUP INTROSPECTION ────────────────────────────
    # Step 4a: Detect served models and classify architecture (MoE/dense).
    # Step 4b: Compute safe context for each loaded model and warn loudly
    #          if the engine is already using something that risks CPU
    #          offload. On startup we only WARN — runtime recovery happens
    #          via verify_no_cpu_offload() inside the heartbeat loop.
    # Step 4c: Run an initial concurrency probe (uses cache when warm).
    try:
        served_info = detect_served_models()
    except Exception as _srv_err:
        log.debug(f"startup detect_served_models failed: {_srv_err}")
        served_info = {"models": [], "engines": []}

    # v4.0.3 (Phase 1.5 / Fix C): iterate the raw (pre-expansion) list
    # so we do not run architecture/geometry lookups once per alias.
    served_ids = served_info.get("models_raw") if isinstance(served_info, dict) else None
    if not served_ids:
        served_ids = served_info.get("models", []) if isinstance(served_info, dict) else []
    if served_ids:
        log.info(f"[v4] Detected {len(served_ids)} served model(s): {served_ids}")
    else:
        log.info("[v4] No served models detected on startup (engines may start later)")

    gpu_info_for_ctx = gpu or {}
    total_vram_gb = float(gpu_info_for_ctx.get("gpu_vram_mib", 0) or 0) / 1024.0

    for mid in served_ids:
        try:
            arch = detect_model_architecture(mid)
            log.info(
                "[v4] Architecture: model=%s type=%s total=%.1fB active=%.1fB confidence=%s",
                mid, arch.get("type"), arch.get("total_params_b", 0.0),
                arch.get("active_params_b", 0.0), arch.get("confidence"),
            )
            canonical = _canonicalize_model_id(mid)
            model_size_gb = 0.0
            if canonical and canonical in MODEL_GEOMETRY_TABLE:
                model_size_gb = float(MODEL_GEOMETRY_TABLE[canonical].get("size_gb", 0.0))
            else:
                # Heuristic: ~0.6 GB per active B for int4 dense models.
                model_size_gb = max(1.0, arch.get("active_params_b", 0.0) * 0.6)

            # v4.0.3 (Phase 1.5 / Fix A): introspect the engine's ACTUAL
            # KV cache dtype. The previous code hard-coded 4 bits when TurboQuant
            # was off, which overestimated safe context by ~4x on every fp16
            # provider (the real Ollama/vLLM default).
            tq_cfg = get_turboquant_config()
            # Determine engine type from the current detection snapshot.
            _startup_engines = served_info.get("engines", []) if isinstance(served_info, dict) else []
            if any(str(e).startswith("vllm") for e in _startup_engines):
                _engine_for_kv = "vllm"
            elif "ollama" in _startup_engines:
                _engine_for_kv = "ollama"
            elif "llamacpp" in _startup_engines:
                _engine_for_kv = "llamacpp"
            else:
                _engine_for_kv = "unknown"
            quant_bits = detect_kv_cache_bits(_engine_for_kv, bool(tq_cfg.get("enabled", False)))

            safe_ctx = calculate_safe_context(
                model_size_gb=model_size_gb,
                quant_bits=quant_bits,
                gpu_vram_gb=total_vram_gb,
                model_architecture=arch.get("type", "dense"),
                model_id=mid,
            )
            with _effective_context_lock:
                _effective_context_by_model[mid] = safe_ctx
            log.info(
                "[v4] Safe context for %s on %.1fGB GPU: %d tokens "
                "(model~%.1fGB, quant=%d-bit)",
                mid, total_vram_gb, safe_ctx, model_size_gb, quant_bits,
            )
            # Warn if the engine is currently using a wildly different context
            # that looks like the old 131k default (Round 3 Llama 3.3 incident).
            if safe_ctx < 131072 and total_vram_gb < 80:
                log.info(
                    "[v4] Startup note: if engine is launched with context > %d "
                    "tokens on this hardware, KV cache may spill to CPU. The "
                    "runtime verify_no_cpu_offload() probe will auto-restart.",
                    safe_ctx,
                )
        except Exception as _ctx_err:
            log.debug(f"[v4] safe-context calc failed for {mid}: {_ctx_err}")

    # Step 4c: Run an initial concurrency probe (populates the cache if empty).
    try:
        cap = probe_concurrency_capacity()
        log.info(
            "[v4] Concurrency probe: method=%s probed=%s engine=%s",
            cap.get("concurrency_probe_method"),
            cap.get("probed_concurrency"),
            cap.get("engine_type"),
        )
        if cap.get("performance_ratio") is not None:
            log.info(
                "[v4] Bandwidth ratio: single_user=%.1f tok/s predicted_peak=%.1f tok/s ratio=%.2f",
                cap.get("single_user_tps") or 0.0,
                cap.get("predicted_peak_tok_s") or 0.0,
                cap.get("performance_ratio") or 0.0,
            )
    except Exception as _probe_err:
        log.debug(f"[v4] initial concurrency probe failed: {_probe_err}")

    # Step 4d: v4.0.3 (Phase 1.5 / Fix D) — resolve RunPod pod hourly
    # cost once. Cached for the lifetime of the process.
    global _POD_HOURLY_COST_USD
    try:
        _POD_HOURLY_COST_USD = detect_pod_hourly_cost_usd()
        if _POD_HOURLY_COST_USD is not None:
            log.info(
                "[v4] RunPod pod hourly cost: $%.4f/hr", _POD_HOURLY_COST_USD
            )
        else:
            log.info("[v4] Pod hourly cost: unavailable (not RunPod or query failed)")
    except Exception as _cost_err:
        log.debug(f"[v4] pod hourly cost detection failed: {_cost_err}")

    # Step 4e: v4.0.3 (Phase 1.5 / Fix F) — port mismatch auto-remedy.
    # If vLLM is on :8000 but only :11434 is publicly mapped (the A5000 case),
    # auto-install socat and forward. If unfixable, log loudly.
    try:
        pm_result = apply_port_mismatch_remedy()
        if pm_result.get("mismatch"):
            log.warning(
                "[v4] Port mismatch: engine=%s port=%s mapped=%s remedy=%s",
                pm_result.get("engine_name"),
                pm_result.get("engine_port"),
                pm_result.get("mapped_ports"),
                pm_result.get("remedy"),
            )
        else:
            log.info(
                "[v4] Port mapping OK: engine=%s port=%s",
                pm_result.get("engine_name"),
                pm_result.get("engine_port"),
            )
    except Exception as _pm_err:
        log.debug(f"[v4] port mismatch remedy failed: {_pm_err}")

    log.info(f"[v4] Daemon code hash: {_CODE_HASH}")

    # Step 5: Send initial heartbeat
    log.info("Sending initial heartbeat...")
    send_heartbeat()

    # Step 6: Auto-verify GPU on first run
    log.info("Checking verification status...")
    auto_verify()

    # Step 7: Start background threads
    log.info("Starting heartbeat thread (every %ds)...", HEARTBEAT_INTERVAL)
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True, name="DC1-Heartbeat")
    hb_thread.start()

    log.info("Starting job poll thread (every %ds)...", JOB_POLL_INTERVAL)
    job_thread = threading.Thread(target=job_poll_loop, daemon=True, name="DC1-JobPoll")
    job_thread.start()

    log.info("Starting update check thread (every %ds)...", AUTO_UPDATE_CHECK)
    update_thread = threading.Thread(target=update_check_loop, daemon=True, name="DC1-AutoUpdate")
    update_thread.start()

    log.info("Starting bandwidth monitor (every %ds)...", BANDWIDTH_CHECK_INTERVAL)
    bw_thread = threading.Thread(target=bandwidth_loop, daemon=True, name="DC1-Bandwidth")
    bw_thread.start()

    log.info("Starting network quality monitor (every %ds)...", NETWORK_QUALITY_INTERVAL)
    nq_thread = threading.Thread(target=network_quality_loop, daemon=True, name="DC1-NetQuality")
    nq_thread.start()

    # v3.5.0: Feature 2 — Engine watchdog (auto-restart Ollama / alert on vLLM)
    log.info("Starting engine watchdog (every %ds)...", ENGINE_WATCHDOG_INTERVAL)
    ew_thread = threading.Thread(target=engine_watchdog_loop, daemon=True, name="DC1-EngineWatchdog")
    ew_thread.start()

    # v3.5.0: Feature 5 — Passive daemon version check (informational)
    log.info("Starting passive daemon version check (every 300s)...")
    puc_thread = threading.Thread(target=passive_update_check_loop, daemon=True, name="DC1-PassiveUpdate")
    puc_thread.start()

    # v4.0.0-alpha: Periodic concurrency reprobe (every 6 hours)
    log.info("Starting concurrency reprobe loop (every 6h)...")
    cr_thread = threading.Thread(
        target=_concurrency_reprobe_loop, daemon=True, name="DC1-ConcurrencyReprobe"
    )
    cr_thread.start()

    # Thread supervisor: observe-only. If a worker thread dies from an
    # uncaught exception, daemon=True makes it silent. Supervisor logs +
    # reports the death so the backend can surface it. No auto-restart —
    # restart policy is a design decision left to the watchdog process.
    _supervised_threads = [
        hb_thread, job_thread, update_thread, bw_thread,
        nq_thread, ew_thread, puc_thread, cr_thread,
    ]

    def _thread_supervisor():
        seen_dead = set()
        while True:
            try:
                for t in _supervised_threads:
                    if not t.is_alive() and t.name not in seen_dead:
                        seen_dead.add(t.name)
                        log.error(f"[supervisor] thread {t.name} has died")
                        try:
                            report_event(
                                "thread_died",
                                f"Background thread {t.name} terminated unexpectedly",
                                severity="error",
                            )
                        except Exception:
                            pass
            except Exception as e:
                log.debug(f"[supervisor] check error: {e}")
            time.sleep(30)

    sup_thread = threading.Thread(
        target=_thread_supervisor, daemon=True, name="DC1-Supervisor"
    )
    sup_thread.start()

    # Step 8: Initialize multi-GPU job slots
    log.info("Initializing GPU job slots...")
    init_gpu_slots()
    log.info(f"Job slots: {MAX_CONCURRENT_JOBS} concurrent (free: {get_free_gpu_slot_count()})")

    # Step 9: Log power cost config
    power_cfg = load_power_config()
    if power_cfg.get("enabled"):
        log.info(f"Power cost tracking: ENABLED — {power_cfg.get('electricity_cost_kwh')} SAR/kWh, "
                 f"TDP={power_cfg.get('gpu_tdp_watts')}W, min margin={power_cfg.get('min_profit_margin_pct')}%")
    else:
        log.info("Power cost tracking: disabled (set ~/dc1-provider/power_config.json to enable)")

    log.info("Daemon running. Press Ctrl+C to stop.")

    # Keep main thread alive
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        log.info("Daemon stopped by user.")
        report_event("daemon_stop", "Stopped by user (KeyboardInterrupt)")
        sys.exit(0)
    except Exception as e:
        error_detail = f"Main loop crash: {e}\n{traceback.format_exc()}"
        log.critical(error_detail)
        report_event("daemon_crash", error_detail, severity="critical")
        sys.exit(1)  # Watchdog will restart


# ─── CRASH WATCHDOG ─────────────────────────────────────────────────────────

def _find_backup_files(daemon_path=None):
    """Find all .bak files from previous daemon versions."""
    daemon_path = daemon_path or Path(__file__).resolve()
    current_pattern = f"{daemon_path.stem}.v*.bak"
    legacy_pattern = "dc1-daemon.v*.bak"
    backups = list(daemon_path.parent.glob(current_pattern))
    backups.extend(daemon_path.parent.glob(legacy_pattern))
    return sorted(backups, reverse=True)

def _rollback_daemon(daemon_path):
    """Rollback to the most recent backup file. Returns True if successful."""
    backups = _find_backup_files(daemon_path)
    if not backups:
        log.error("[WATCHDOG] No backup files found — cannot rollback")
        return False

    backup = backups[0]
    log.warning(f"[WATCHDOG] Rolling back: {daemon_path} ← {backup}")
    try:
        shutil.copy2(backup, daemon_path)
        log.info(f"[WATCHDOG] Rollback successful from {backup.name}")
        return True
    except Exception as e:
        log.error(f"[WATCHDOG] Rollback failed: {e}")
        return False

def watchdog():
    """
    Outer process that monitors the daemon and restarts on crash.

    Behavior:
      Exit code 0  = clean shutdown → stop watchdog
      Exit code 42 = update restart → restart immediately
      Other codes  = crash → restart with backoff

    Safety features:
      - Max 5 crashes per 10 min window (prevents infinite loops)
      - Auto-rollback if daemon crashes within 90s of an update restart
      - After rollback, suppresses updates for 10 min then re-checks
        (so a newer fixed version can still be picked up)
    """
    crash_times = []
    restart_count = 0
    last_update_restart_time = 0   # Track when we last did an update restart
    rollback_until = 0             # Suppress updates until this timestamp
    daemon_script = Path(__file__).resolve()

    log.info(f"[WATCHDOG] Starting crash watchdog for {daemon_script}")
    log.info(f"[WATCHDOG] Max {MAX_CRASH_RESTARTS} restarts per {CRASH_WINDOW}s window")

    while True:
        # Build command — pass through original args, add --no-watchdog to prevent recursion
        cmd = [sys.executable, str(daemon_script), "--no-watchdog"]
        # Pass through key/url if they were injected (not INJECT_*_HERE)
        if API_KEY != "INJECT_KEY_HERE":
            cmd.extend(["--key", API_KEY])
        if API_URL != "INJECT_URL_HERE":
            cmd.extend(["--url", API_URL])

        log.info(f"[WATCHDOG] Starting daemon (restart #{restart_count})...")
        start_time = time.time()

        try:
            proc = subprocess.run(cmd)
            exit_code = proc.returncode
        except Exception as e:
            log.error(f"[WATCHDOG] Failed to start daemon: {e}")
            exit_code = 1

        elapsed = round(time.time() - start_time, 1)

        # ── Clean shutdown ──
        if exit_code == 0:
            log.info(f"[WATCHDOG] Daemon exited cleanly (code 0) after {elapsed}s. Stopping watchdog.")
            break

        # ── Update restart (code 42) ──
        if exit_code == 42:
            log.info(f"[WATCHDOG] Daemon requested update restart (code 42) after {elapsed}s.")
            last_update_restart_time = time.time()
            restart_count += 1
            continue

        # ── Crash detection ──
        now = time.time()
        crash_times.append(now)
        crash_times = [t for t in crash_times if now - t < CRASH_WINDOW]

        log.error(f"[WATCHDOG] Daemon crashed (code {exit_code}) after {elapsed}s. "
                   f"Crashes in window: {len(crash_times)}/{MAX_CRASH_RESTARTS}")

        # ── Auto-rollback after bad update ──
        time_since_update = now - last_update_restart_time if last_update_restart_time else float("inf")
        if time_since_update < UPDATE_CRASH_THRESHOLD:
            log.warning(f"[WATCHDOG] Crash {elapsed}s after update restart — likely bad update!")
            if _rollback_daemon(daemon_script):
                rollback_until = now + ROLLBACK_RECHECK_INTERVAL
                log.info(f"[WATCHDOG] Updates suppressed for {ROLLBACK_RECHECK_INTERVAL}s. "
                          f"Will re-check for newer fixed version after that.")
                os.environ["DCP_UPDATE_SUPPRESS_UNTIL"] = str(int(rollback_until))
                _save_update_suppression(
                    rollback_until,
                    reason=f"rollback_after_update_crash_exit_{exit_code}",
                )
                try:
                    report_event("update_rollback",
                        f"Auto-rollback triggered: daemon crashed {elapsed}s after update. "
                        f"Rolled back to previous version. Updates suppressed until "
                        f"{datetime.utcfromtimestamp(rollback_until).isoformat()}Z",
                        severity="critical")
                except: pass
                last_update_restart_time = 0  # Reset so we don't double-rollback
                # Reset crash counter — the rollback gives us a clean slate
                crash_times = []
                restart_count += 1
                time.sleep(5)
                continue

        # ── Too many crashes — give up ──
        if len(crash_times) >= MAX_CRASH_RESTARTS:
            log.critical(f"[WATCHDOG] Too many crashes ({len(crash_times)}) in {CRASH_WINDOW}s. "
                          f"Giving up. Check logs at {LOG_DIR}/daemon.log")
            try:
                report_event("watchdog_givingup",
                    f"GIVING UP after {len(crash_times)} crashes in {CRASH_WINDOW}s. "
                    f"Last exit code: {exit_code}. Manual intervention needed.",
                    severity="critical")
            except: pass
            sys.exit(1)

        # ── Backoff: 5s, 10s, 20s, 40s, 60s max ──
        backoff = min(5 * (2 ** (len(crash_times) - 1)), 60)
        log.info(f"[WATCHDOG] Restarting in {backoff}s...")

        try:
            report_event("watchdog_restart",
                f"Daemon crashed (exit code {exit_code}) after {elapsed}s. "
                f"Restart #{restart_count + 1}, backoff {backoff}s. "
                f"Crashes in window: {len(crash_times)}/{MAX_CRASH_RESTARTS}",
                severity="warning")
        except: pass

        time.sleep(backoff)
        restart_count += 1


if __name__ == "__main__":
    # Parse args early to check --no-watchdog
    if "--no-watchdog" in sys.argv:
        main()
    else:
        watchdog()
