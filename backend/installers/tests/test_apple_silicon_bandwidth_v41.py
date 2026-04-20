"""Tests for Apple Silicon memory bandwidth table (v4.1.0 Task A7).

Covers:
  - All 15 chip entries (M1/M1 Pro/Max/Ultra, M2/Pro/Max/Ultra, M3/Pro/Max/Ultra, M4/Pro/Max)
  - Longest-match wins ("Apple M1 Ultra" beats "Apple M1")
  - predicted_peak_tok_s falls through to Apple table when not NVIDIA
  - Unknown chips return None
  - Empty / None gpu_name safe
"""

import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.dirname(HERE)
if DAEMON_DIR not in sys.path:
    sys.path.insert(0, DAEMON_DIR)

sys.modules.setdefault("psutil", types.ModuleType("psutil"))

import dcp_daemon  # noqa: E402


class TestAppleSiliconBandwidthTable(unittest.TestCase):
    def test_table_has_fifteen_entries(self):
        """Per Tito's v4.1.0 spec: the table covers 15 chips — M1/M2/M3 × 4 tiers + M4/M4 Pro/M4 Max."""
        self.assertEqual(len(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS), 15)

    def test_m1_family(self):
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M1"], 68)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M1 Pro"], 200)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M1 Max"], 400)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M1 Ultra"], 800)

    def test_m2_family(self):
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M2"], 100)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M2 Pro"], 200)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M2 Max"], 400)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M2 Ultra"], 800)

    def test_m3_family(self):
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M3"], 100)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M3 Pro"], 150)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M3 Max"], 400)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M3 Ultra"], 800)

    def test_m4_family(self):
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M4"], 120)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M4 Pro"], 273)
        self.assertEqual(dcp_daemon.APPLE_SILICON_BANDWIDTH_GBPS["Apple M4 Max"], 546)


class TestAppleSiliconLookup(unittest.TestCase):
    """_apple_silicon_bandwidth must match the longest suffix to avoid
    'Apple M1' shadowing 'Apple M1 Ultra' / 'Apple M1 Max' / 'Apple M1 Pro'."""

    def test_full_gpu_name_wrapper(self):
        # This is the actual format produced by detect_gpu() on macOS:
        # "Apple Silicon (Apple M2 Ultra)".
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M2 Ultra)"),
            800,
        )
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M4 Max)"),
            546,
        )

    def test_longest_match_wins_m1_ultra(self):
        # "Apple M1 Ultra" contains "Apple M1" as a substring. We must get 800, not 68.
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M1 Ultra)"),
            800,
        )

    def test_longest_match_wins_m1_pro(self):
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M1 Pro)"),
            200,
        )

    def test_longest_match_wins_m1_max(self):
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M1 Max)"),
            400,
        )

    def test_bare_m1_matches_base(self):
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M1)"),
            68,
        )

    def test_longest_match_wins_m3_ultra(self):
        self.assertEqual(
            dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M3 Ultra)"),
            800,
        )

    def test_empty_input_returns_none(self):
        self.assertIsNone(dcp_daemon._apple_silicon_bandwidth(None))
        self.assertIsNone(dcp_daemon._apple_silicon_bandwidth(""))

    def test_unknown_chip_returns_none(self):
        self.assertIsNone(dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Apple M99 Omega)"))
        self.assertIsNone(dcp_daemon._apple_silicon_bandwidth("Apple Silicon (Intel i7-9700K)"))

    def test_nvidia_gpu_does_not_match(self):
        # Guard against pattern collision — "Apple" appears nowhere in NVIDIA
        # product strings but we still want a clean None for non-Apple inputs.
        self.assertIsNone(dcp_daemon._apple_silicon_bandwidth("NVIDIA RTX 4090"))


class TestPredictedPeakTokSFallthrough(unittest.TestCase):
    """predicted_peak_tok_s should fall through to Apple Silicon table when
    the gpu_name isn't in the NVIDIA bandwidth dict. Prior to A7 this
    returned None for all Apple Silicon machines."""

    def test_apple_silicon_m2_ultra_7b_model(self):
        # 7B FP16 weights ~= 14 GB. M2 Ultra bandwidth 800 GB/s.
        # Expected: 800 / 14 ~= 57.1 tok/s peak.
        tok_s = dcp_daemon.predicted_peak_tok_s("Apple Silicon (Apple M2 Ultra)", 14.0)
        self.assertIsNotNone(tok_s)
        self.assertAlmostEqual(tok_s, 800.0 / 14.0, places=5)

    def test_apple_silicon_m4_pro_13b_model(self):
        # 13B Q4 weights ~= 7 GB. M4 Pro bandwidth 273 GB/s.
        tok_s = dcp_daemon.predicted_peak_tok_s("Apple Silicon (Apple M4 Pro)", 7.0)
        self.assertIsNotNone(tok_s)
        self.assertAlmostEqual(tok_s, 273.0 / 7.0, places=5)

    def test_nvidia_unchanged(self):
        # Regression: adding the Apple fallback must not alter NVIDIA behavior.
        tok_s = dcp_daemon.predicted_peak_tok_s("NVIDIA GeForce RTX 4090", 14.0)
        self.assertIsNotNone(tok_s)
        self.assertAlmostEqual(tok_s, 1008.0 / 14.0, places=5)

    def test_unknown_gpu_still_returns_none(self):
        self.assertIsNone(
            dcp_daemon.predicted_peak_tok_s("Some Random Future GPU", 14.0)
        )

    def test_zero_model_size_returns_none(self):
        self.assertIsNone(
            dcp_daemon.predicted_peak_tok_s("Apple Silicon (Apple M2 Ultra)", 0)
        )

    def test_negative_model_size_returns_none(self):
        self.assertIsNone(
            dcp_daemon.predicted_peak_tok_s("Apple Silicon (Apple M2 Ultra)", -1)
        )

    def test_none_inputs_safe(self):
        self.assertIsNone(dcp_daemon.predicted_peak_tok_s(None, 14.0))
        self.assertIsNone(dcp_daemon.predicted_peak_tok_s("Apple Silicon (Apple M2)", None))


if __name__ == "__main__":
    unittest.main()
