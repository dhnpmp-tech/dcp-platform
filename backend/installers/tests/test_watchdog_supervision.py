"""Tests for watchdog supervision flip (v4.1.0 Task A11).

Structural checks against the unix installer — the systemd unit
must declare Restart=always with a tight RestartSec so the daemon
is revived on any exit, not just failures. This is a critical
reliability property: the claim-token handshake and heartbeat
cadence depend on the daemon being available within seconds of any
crash or clean exit.

Stdlib only — no systemd, no subprocess.
"""

import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
INSTALLER_DIR = os.path.dirname(HERE)
UNIX_SCRIPT = os.path.join(INSTALLER_DIR, "dcp-setup-unix.sh")


class TestWatchdogSupervision(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(UNIX_SCRIPT) as f:
            cls.src = f.read()

    def test_unit_uses_restart_always(self):
        """Must be 'always', not 'on-failure' — we want revival on every exit."""
        self.assertIn("Restart=always", self.src)
        self.assertNotIn("Restart=on-failure", self.src)

    def test_unit_uses_tight_restart_interval(self):
        """RestartSec must be <= 5 so recovery is sub-heartbeat."""
        m = re.search(r"RestartSec=(\d+)", self.src)
        self.assertIsNotNone(m, "RestartSec directive missing from unit file")
        self.assertLessEqual(int(m.group(1)), 5)

    def test_unit_declares_service_section(self):
        """Sanity: the unit has a [Service] stanza we just modified."""
        self.assertIn("[Service]", self.src)
        self.assertIn("ExecStart=", self.src)

    def test_unit_enabled_on_boot(self):
        """Must persist across reboots."""
        self.assertIn("systemctl enable dc1-provider", self.src)


if __name__ == "__main__":
    unittest.main()
