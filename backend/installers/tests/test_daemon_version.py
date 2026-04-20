"""Tests for DAEMON_VERSION constant (v4.1.0 Task A13)."""
import os, sys, types, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.dirname(HERE)
if DAEMON_DIR not in sys.path:
    sys.path.insert(0, DAEMON_DIR)
sys.modules.setdefault("psutil", types.ModuleType("psutil"))
import dcp_daemon

class TestDaemonVersion(unittest.TestCase):
    def test_daemon_version_is_410(self):
        self.assertEqual(dcp_daemon.DAEMON_VERSION, "4.1.0")
    def test_daemon_version_is_string(self):
        self.assertIsInstance(dcp_daemon.DAEMON_VERSION, str)
    def test_daemon_version_follows_semver(self):
        parts = dcp_daemon.DAEMON_VERSION.split(".")
        self.assertEqual(len(parts), 3)
        for p in parts:
            self.assertTrue(p.isdigit())
    def test_daemon_version_is_ge_410(self):
        major, minor, _ = [int(x) for x in dcp_daemon.DAEMON_VERSION.split(".")]
        self.assertGreaterEqual((major, minor), (4, 1))

if __name__ == "__main__":
    unittest.main()
