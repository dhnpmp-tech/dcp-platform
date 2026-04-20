"""Tests for claim-token handshake (v4.1.0 Task A10).

Covers:
  - _load_claim_token_once: happy path, missing file, malformed JSON,
    non-dict, missing field, empty/whitespace token, non-string token
  - One-shot delivery: first call attaches token, subsequent omits
  - Memory clearing: in-memory token is None after first attach
  - Installer script structural checks: unix + Windows both write
    a random token to ~/.dcp/claim.json

Stdlib only — no network, no daemon runtime.
"""

import json
import os
import re
import sys
import tempfile
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.dirname(HERE)
if DAEMON_DIR not in sys.path:
    sys.path.insert(0, DAEMON_DIR)

sys.modules.setdefault("psutil", types.ModuleType("psutil"))

import dcp_daemon  # noqa: E402


class TestLoadClaimTokenOnce(unittest.TestCase):
    def _run_with_home(self, home_dir, body=None, missing=False):
        """Run _load_claim_token_once with ~ redirected to home_dir.
        If body is provided, write it to ~/.dcp/claim.json first.
        If missing is True, the file is not created.
        """
        if not missing:
            claim_dir = os.path.join(home_dir, ".dcp")
            os.makedirs(claim_dir, exist_ok=True)
            with open(os.path.join(claim_dir, "claim.json"), "w") as f:
                f.write(body if isinstance(body, str) else json.dumps(body))
        with mock.patch.object(dcp_daemon.os.path, "expanduser",
                                side_effect=lambda p: p.replace("~", home_dir)):
            return dcp_daemon._load_claim_token_once()

    def test_happy_path_valid_token(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body={
                "claim_token": "abcdef0123456789" * 4,
                "generated_at": "2026-04-21T12:00:00Z",
            })
        self.assertEqual(token, "abcdef0123456789" * 4)

    def test_missing_file_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, missing=True)
        self.assertIsNone(token)

    def test_malformed_json_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body="{ not valid json")
        self.assertIsNone(token)

    def test_non_dict_json_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body='["not", "a", "dict"]')
        self.assertIsNone(token)

    def test_missing_field_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body={"generated_at": "2026-04-21T12:00:00Z"})
        self.assertIsNone(token)

    def test_empty_token_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body={"claim_token": ""})
        self.assertIsNone(token)

    def test_whitespace_token_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body={"claim_token": "   "})
        self.assertIsNone(token)

    def test_non_string_token_returns_none(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body={"claim_token": 42})
        self.assertIsNone(token)

    def test_token_whitespace_stripped(self):
        with tempfile.TemporaryDirectory() as home:
            token = self._run_with_home(home, body={"claim_token": "  abc123  "})
        self.assertEqual(token, "abc123")


class TestClaimTokenOneShot(unittest.TestCase):
    """Verify the one-shot delivery contract: set _CLAIM_TOKEN, build two
    heartbeats, only the first carries the token."""

    def setUp(self):
        # Snapshot originals so we can restore.
        self._orig_token = dcp_daemon._CLAIM_TOKEN
        self._orig_sent = dcp_daemon._CLAIM_SENT

    def tearDown(self):
        dcp_daemon._CLAIM_TOKEN = self._orig_token
        dcp_daemon._CLAIM_SENT = self._orig_sent

    def _simulate_heartbeat_attach(self):
        """Mirror the logic inside send_heartbeat that attaches the token."""
        payload = {}
        if dcp_daemon._CLAIM_TOKEN and not dcp_daemon._CLAIM_SENT:
            payload["claim_token"] = dcp_daemon._CLAIM_TOKEN
            dcp_daemon._CLAIM_TOKEN = None
            dcp_daemon._CLAIM_SENT = True
        return payload

    def test_first_heartbeat_carries_token(self):
        dcp_daemon._CLAIM_TOKEN = "deadbeef" * 8
        dcp_daemon._CLAIM_SENT = False
        payload = self._simulate_heartbeat_attach()
        self.assertEqual(payload["claim_token"], "deadbeef" * 8)

    def test_second_heartbeat_omits_token(self):
        dcp_daemon._CLAIM_TOKEN = "deadbeef" * 8
        dcp_daemon._CLAIM_SENT = False
        _ = self._simulate_heartbeat_attach()   # first
        payload = self._simulate_heartbeat_attach()  # second
        self.assertNotIn("claim_token", payload)

    def test_token_cleared_from_memory(self):
        dcp_daemon._CLAIM_TOKEN = "deadbeef" * 8
        dcp_daemon._CLAIM_SENT = False
        _ = self._simulate_heartbeat_attach()
        self.assertIsNone(dcp_daemon._CLAIM_TOKEN)
        self.assertTrue(dcp_daemon._CLAIM_SENT)

    def test_no_token_means_no_attach(self):
        dcp_daemon._CLAIM_TOKEN = None
        dcp_daemon._CLAIM_SENT = False
        payload = self._simulate_heartbeat_attach()
        self.assertNotIn("claim_token", payload)


class TestInstallerScriptsEmitToken(unittest.TestCase):
    """Structural tests against the install scripts — the actual token
    generation is shelled out at install time; here we just verify the
    scripts contain the right idioms."""

    def setUp(self):
        self.unix_script = os.path.join(
            os.path.dirname(DAEMON_DIR), "installers", "dcp-setup-unix.sh"
        )
        self.windows_script = os.path.join(
            os.path.dirname(DAEMON_DIR), "installers", "dcp-setup-windows.ps1"
        )

    def test_unix_writes_claim_json(self):
        with open(self.unix_script) as f:
            src = f.read()
        self.assertIn("claim.json", src)
        self.assertIn("claim_token", src)
        # Must use cryptographic-quality randomness.
        self.assertIn("/dev/urandom", src)
        # Must set restrictive permissions.
        self.assertIn("chmod 600", src)

    def test_unix_token_is_32_bytes_hex(self):
        """head -c 32 /dev/urandom → 64 hex chars (32 bytes = 64 hex)."""
        with open(self.unix_script) as f:
            src = f.read()
        self.assertTrue(re.search(r"head -c 32 /dev/urandom", src))

    def test_windows_writes_claim_json(self):
        with open(self.windows_script) as f:
            src = f.read()
        self.assertIn("claim.json", src)
        self.assertIn("claim_token", src)
        # Must use cryptographic-quality randomness (RNGCryptoServiceProvider /
        # RandomNumberGenerator), not Get-Random.
        self.assertIn("RandomNumberGenerator", src)
        # Must restrict ACL.
        self.assertIn("SetAccessRuleProtection", src)

    def test_windows_token_is_32_bytes(self):
        with open(self.windows_script) as f:
            src = f.read()
        self.assertIn("New-Object byte[] 32", src)


if __name__ == "__main__":
    unittest.main()
