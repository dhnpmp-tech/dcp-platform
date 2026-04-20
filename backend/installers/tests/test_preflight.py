"""Tests for the DCP preflight validation gate (v4.1.0 Task A8).

Covers all 8 checks across happy + failure paths (16+ cases), plus the
aggregator behavior: hard failure → passed=False, soft failure → passed
stays True but warnings populates, info always non-blocking.
"""

import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.dirname(HERE)
if DAEMON_DIR not in sys.path:
    sys.path.insert(0, DAEMON_DIR)

import preflight  # noqa: E402


# ─── check_gpu_detected ─────────────────────────────────────────────────────

class TestCheckGpuDetected(unittest.TestCase):
    def test_happy_nvidia(self):
        result = preflight.check_gpu_detected(
            {"gpu_name": "NVIDIA RTX 4090", "vram_mb": 24576}
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["tier"], "hard")

    def test_cpu_only_hard_fails(self):
        result = preflight.check_gpu_detected({"gpu_name": "CPU only", "vram_mb": 0})
        self.assertFalse(result["ok"])
        self.assertEqual(result["tier"], "hard")
        self.assertIsNotNone(result["remediation_url"])

    def test_no_gpu_info_hard_fails(self):
        result = preflight.check_gpu_detected(None)
        self.assertFalse(result["ok"])
        self.assertEqual(result["tier"], "hard")


# ─── check_cuda_driver ──────────────────────────────────────────────────────

class TestCheckCudaDriver(unittest.TestCase):
    def test_happy_path(self):
        r = preflight.check_cuda_driver({"driver_version": "550.54.14"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["tier"], "soft")

    def test_missing_driver_soft_warns(self):
        r = preflight.check_cuda_driver({"driver_version": None, "gpu_name": "NVIDIA RTX 4090"})
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "soft")
        self.assertIn("nvidia.com", r["remediation_url"])

    def test_apple_silicon_skipped(self):
        r = preflight.check_cuda_driver({"is_apple_silicon": True, "driver_version": "Metal"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["tier"], "info")


# ─── check_python_version ───────────────────────────────────────────────────

class TestCheckPythonVersion(unittest.TestCase):
    def test_current_python_passes(self):
        # Test env is >=3.8 or the test suite couldn't even collect.
        r = preflight.check_python_version()
        self.assertTrue(r["ok"])

    def test_old_python_hard_fails(self):
        with mock.patch.object(preflight.sys, "version_info", (3, 6, 0, "final", 0)):
            r = preflight.check_python_version()
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "hard")
        self.assertIn("python.org", r["remediation_url"])


# ─── check_disk_free ────────────────────────────────────────────────────────

class TestCheckDiskFree(unittest.TestCase):
    def test_happy_path(self):
        fake_usage = mock.Mock(free=100 * (1024 ** 3))  # 100 GB
        with mock.patch.object(preflight.shutil, "disk_usage", return_value=fake_usage):
            r = preflight.check_disk_free(path="/tmp", min_gb=20)
        self.assertTrue(r["ok"])
        self.assertEqual(r["tier"], "soft")

    def test_low_disk_soft_warns(self):
        fake_usage = mock.Mock(free=5 * (1024 ** 3))  # 5 GB
        with mock.patch.object(preflight.shutil, "disk_usage", return_value=fake_usage):
            r = preflight.check_disk_free(path="/tmp", min_gb=20)
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "soft")
        self.assertIn("storage", r["remediation_url"])

    def test_stat_error_soft_warns(self):
        with mock.patch.object(preflight.shutil, "disk_usage",
                                side_effect=OSError("nonexistent")):
            r = preflight.check_disk_free(path="/nonexistent", min_gb=20)
        self.assertFalse(r["ok"])


# ─── check_network_reachable ────────────────────────────────────────────────

class TestCheckNetworkReachable(unittest.TestCase):
    def test_happy_path(self):
        # Inject a no-op connect function so we don't hit the real network.
        r = preflight.check_network_reachable(
            host="api.dcp.sa", port=443,
            connect_fn=lambda h, p, t: None,
        )
        self.assertTrue(r["ok"])
        self.assertEqual(r["tier"], "hard")

    def test_unreachable_hard_fails(self):
        def _raise(h, p, t):
            raise ConnectionRefusedError("simulated firewall")
        r = preflight.check_network_reachable(connect_fn=_raise)
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "hard")
        self.assertIn("firewall", r["remediation_url"])


# ─── check_cache_writable ───────────────────────────────────────────────────

class TestCheckCacheWritable(unittest.TestCase):
    def test_happy_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = preflight.check_cache_writable(cache_dir=tmp)
        self.assertTrue(r["ok"])

    def test_read_only_hard_fails(self):
        # Simulate makedirs + open failing.
        with mock.patch.object(preflight.os, "makedirs",
                                side_effect=PermissionError("read-only fs")):
            r = preflight.check_cache_writable(cache_dir="/totally/read/only/path")
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "hard")


# ─── check_engine_binary ────────────────────────────────────────────────────

class TestCheckEngineBinary(unittest.TestCase):
    def test_happy_path_any_found(self):
        with mock.patch.object(preflight.shutil, "which",
                                side_effect=lambda b: "/usr/bin/" + b if b == "vllm" else None):
            r = preflight.check_engine_binary()
        self.assertTrue(r["ok"])

    def test_none_found_hard_fails(self):
        with mock.patch.object(preflight.shutil, "which", return_value=None):
            r = preflight.check_engine_binary()
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "hard")
        self.assertIn("install", r["remediation_url"])


# ─── check_known_broken_combos ──────────────────────────────────────────────

class TestKnownBrokenCombos(unittest.TestCase):
    def test_no_config_skips(self):
        r = preflight.check_known_broken_combos(None, None)
        self.assertTrue(r["ok"])
        self.assertEqual(r["tier"], "info")

    def test_unknown_combo_passes(self):
        r = preflight.check_known_broken_combos("llama-3-8b", "vllm")
        self.assertTrue(r["ok"])

    def test_gemma4_on_ollama_flagged(self):
        r = preflight.check_known_broken_combos("gemma-4-9b-it", "ollama")
        self.assertFalse(r["ok"])
        self.assertEqual(r["tier"], "info")
        self.assertIn("gemma4-llamacpp", r["remediation_url"])


# ─── Aggregator ─────────────────────────────────────────────────────────────

class TestRunAllChecks(unittest.TestCase):
    def test_all_green(self):
        with mock.patch.object(preflight.shutil, "disk_usage",
                                return_value=mock.Mock(free=100 * (1024 ** 3))), \
             mock.patch.object(preflight.shutil, "which", return_value="/usr/bin/vllm"), \
             tempfile.TemporaryDirectory() as tmp:
            result = preflight.run_all_checks(
                gpu_info={"gpu_name": "NVIDIA RTX 4090", "vram_mb": 24576, "driver_version": "550.54.14"},
                cache_dir=tmp,
                primary_model="llama-3-8b",
                primary_engine="vllm",
                connect_fn=lambda h, p, t: None,
            )
        self.assertTrue(result["passed"])
        self.assertEqual(result["hard_failures"], [])
        self.assertEqual(result["warnings"], [])

    def test_hard_failure_blocks(self):
        with mock.patch.object(preflight.shutil, "disk_usage",
                                return_value=mock.Mock(free=100 * (1024 ** 3))), \
             mock.patch.object(preflight.shutil, "which", return_value="/usr/bin/vllm"), \
             tempfile.TemporaryDirectory() as tmp:
            result = preflight.run_all_checks(
                gpu_info={"gpu_name": "CPU only", "vram_mb": 0},  # hard fail
                cache_dir=tmp,
                connect_fn=lambda h, p, t: None,
            )
        self.assertFalse(result["passed"])
        self.assertTrue(any(c["name"] == "gpu_detected" for c in result["hard_failures"]))

    def test_soft_failure_passes_with_warnings(self):
        # Low disk is soft — should not block.
        with mock.patch.object(preflight.shutil, "disk_usage",
                                return_value=mock.Mock(free=5 * (1024 ** 3))), \
             mock.patch.object(preflight.shutil, "which", return_value="/usr/bin/vllm"), \
             tempfile.TemporaryDirectory() as tmp:
            result = preflight.run_all_checks(
                gpu_info={"gpu_name": "NVIDIA RTX 4090", "vram_mb": 24576, "driver_version": "550.54.14"},
                cache_dir=tmp,
                connect_fn=lambda h, p, t: None,
            )
        self.assertTrue(result["passed"])
        self.assertTrue(any(w["name"] == "disk_free" for w in result["warnings"]))

    def test_platform_block_populated(self):
        with mock.patch.object(preflight.shutil, "disk_usage",
                                return_value=mock.Mock(free=100 * (1024 ** 3))), \
             mock.patch.object(preflight.shutil, "which", return_value="/usr/bin/vllm"), \
             tempfile.TemporaryDirectory() as tmp:
            result = preflight.run_all_checks(
                gpu_info={"gpu_name": "NVIDIA RTX 4090", "vram_mb": 24576},
                cache_dir=tmp,
                connect_fn=lambda h, p, t: None,
            )
        self.assertIn("os", result["platform"])
        self.assertIn("python", result["platform"])


# ─── A9: link-level remediation coverage ────────────────────────────────────

class TestRemediationCoverage(unittest.TestCase):
    """Every non-ok hard or soft check must carry a remediation_url."""

    def test_gpu_failure_has_link(self):
        r = preflight.check_gpu_detected({"gpu_name": "CPU only", "vram_mb": 0})
        self.assertIsNotNone(r["remediation_url"])

    def test_cuda_failure_has_link(self):
        r = preflight.check_cuda_driver({"driver_version": None})
        self.assertIsNotNone(r["remediation_url"])

    def test_disk_failure_has_link(self):
        fake_usage = mock.Mock(free=1 * (1024 ** 3))
        with mock.patch.object(preflight.shutil, "disk_usage", return_value=fake_usage):
            r = preflight.check_disk_free(path="/tmp", min_gb=20)
        self.assertIsNotNone(r["remediation_url"])

    def test_network_failure_has_link(self):
        r = preflight.check_network_reachable(
            connect_fn=lambda h, p, t: (_ for _ in ()).throw(OSError("down")),
        )
        self.assertIsNotNone(r["remediation_url"])

    def test_python_failure_has_link(self):
        with mock.patch.object(preflight.sys, "version_info", (3, 6, 0, "final", 0)):
            r = preflight.check_python_version()
        self.assertIsNotNone(r["remediation_url"])

    def test_engine_failure_has_link(self):
        with mock.patch.object(preflight.shutil, "which", return_value=None):
            r = preflight.check_engine_binary()
        self.assertIsNotNone(r["remediation_url"])


# ─── Report formatter ───────────────────────────────────────────────────────

class TestFormatReport(unittest.TestCase):
    def test_renders_passed(self):
        result = {
            "checks": [
                {"name": "gpu_detected", "tier": "hard", "ok": True,
                 "message": "RTX 4090", "remediation_url": None},
            ],
            "hard_failures": [], "warnings": [], "info": [], "passed": True,
            "platform": {},
        }
        text = preflight.format_preflight_report(result)
        self.assertIn("PASSED", text)
        self.assertIn("gpu_detected", text)

    def test_renders_failed_with_fix_links(self):
        result = {
            "checks": [
                {"name": "gpu_detected", "tier": "hard", "ok": False,
                 "message": "No GPU", "remediation_url": "https://docs.dcp.sa/gpu"},
            ],
            "hard_failures": [
                {"name": "gpu_detected", "tier": "hard", "ok": False,
                 "message": "No GPU", "remediation_url": "https://docs.dcp.sa/gpu"}
            ],
            "warnings": [], "info": [], "passed": False, "platform": {},
        }
        text = preflight.format_preflight_report(result)
        self.assertIn("FAILED", text)
        self.assertIn("Fix: https://docs.dcp.sa/gpu", text)


if __name__ == "__main__":
    unittest.main()
