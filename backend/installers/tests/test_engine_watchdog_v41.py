"""Tests for v4.1.0 engine watchdog extensions (vLLM + llama.cpp restart).

These helpers live in dcp_daemon.py as stdlib-only utilities that capture
the argv of an engine currently listening on a given port so the daemon
can re-spawn it identically after a crash. The full restart path is gated
behind ENABLE_VLLM_RESTART / ENABLE_LLAMACPP_RESTART env flags (default OFF).
"""
import os
import sys
import pathlib
import subprocess
import types
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


# ─── _pids_listening_on_port ────────────────────────────────────────────────

def test_pids_listening_on_port_parses_ss_output(monkeypatch):
    """ss -tlnp output with users:((\"python\",pid=12345,fd=8)) -> [12345]."""
    sample_ss = (
        "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n"
        'LISTEN 0      128              *:8000            *:*     '
        'users:(("python",pid=12345,fd=8))\n'
    )

    def fake_run(cmd, *args, **kwargs):
        # Only satisfy the first attempt (ss); subsequent tools shouldn't be called.
        if cmd and cmd[0] == "ss":
            return subprocess.CompletedProcess(cmd, 0, stdout=sample_ss, stderr="")
        # If ss was skipped for any reason, simulate lsof/netstat failure.
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="not found")

    monkeypatch.setattr(d.subprocess, "run", fake_run)
    pids = d._pids_listening_on_port(8000)
    assert pids == [12345]


# ─── _read_proc_cmdline ─────────────────────────────────────────────────────

def test_read_proc_cmdline_parses_linux_proc(monkeypatch):
    """On Linux, /proc/<pid>/cmdline is \\x00-separated argv."""
    raw = (
        b"python\x00-m\x00vllm.entrypoints.openai.api_server\x00"
        b"--model\x00Qwen/Qwen3-8B\x00--port\x008000\x00"
    )

    # Force the Linux code path regardless of host OS so this test runs on
    # macOS CI too.
    monkeypatch.setattr(d.sys, "platform", "linux")

    class FakePath:
        def __init__(self, p):
            self.p = p

        def exists(self):
            return self.p == "/proc/12345/cmdline"

        def read_bytes(self):
            assert self.p == "/proc/12345/cmdline"
            return raw

    # _read_proc_cmdline should use pathlib.Path; we patch it inside the module.
    monkeypatch.setattr(d, "Path", FakePath)

    result = d._read_proc_cmdline(12345)
    assert result == [
        "python",
        "-m",
        "vllm.entrypoints.openai.api_server",
        "--model",
        "Qwen/Qwen3-8B",
        "--port",
        "8000",
    ]


# ─── _capture_engine_argv ───────────────────────────────────────────────────

def test_capture_engine_argv_matches_sentinel(monkeypatch):
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["python", "-m", "vllm.entrypoints.openai.api_server", "--model", "x"],
    )
    argv = d._capture_engine_argv(8000, ["vllm"])
    assert argv == ["python", "-m", "vllm.entrypoints.openai.api_server", "--model", "x"]


def test_capture_engine_argv_rejects_wrong_sentinel(monkeypatch):
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["python", "-m", "flask", "run"],
    )
    assert d._capture_engine_argv(8000, ["vllm"]) is None


# ─── restart_engine gating + spawn ──────────────────────────────────────────

def test_restart_engine_vllm_noop_when_flag_unset(monkeypatch):
    monkeypatch.delenv("ENABLE_VLLM_RESTART", raising=False)

    calls = []

    def spy_popen(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("Popen should not be called when flag is unset")

    monkeypatch.setattr(d.subprocess, "Popen", spy_popen)

    result = d.restart_engine("vllm", port=8000)
    assert result is False
    assert calls == []


def test_restart_engine_vllm_spawns_when_flag_set_and_argv_captured(monkeypatch):
    monkeypatch.setenv("ENABLE_VLLM_RESTART", "1")

    captured_argv = ["python", "-m", "vllm.entrypoints.openai.api_server"]
    monkeypatch.setattr(d, "_capture_engine_argv", lambda port, sentinels: captured_argv)

    calls = []

    class FakePopen:
        def __init__(self, argv, **kwargs):
            calls.append((argv, kwargs))
            self.pid = 99999

    monkeypatch.setattr(d.subprocess, "Popen", FakePopen)

    result = d.restart_engine("vllm", port=8000)
    assert result is True
    assert len(calls) == 1
    spawn_argv, spawn_kwargs = calls[0]
    assert spawn_argv == captured_argv
    assert spawn_kwargs.get("start_new_session") is True
