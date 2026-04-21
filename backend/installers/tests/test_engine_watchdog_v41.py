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
    """ss -Hltnp "sport = :<port>" output with users:((\"python\",pid=12345,fd=8)) -> [12345]."""
    # -H suppresses the header; sport filter restricts rows to our port.
    sample_ss = (
        'LISTEN 0      128              *:8000            *:*     '
        'users:(("python",pid=12345,fd=8))\n'
    )

    def fake_run(cmd, *args, **kwargs):
        if cmd and cmd[0] == "ss":
            # Verify we invoked ss with the native sport filter (B2 fix).
            assert "-Hltnp" in cmd
            assert any(str(c).startswith("sport = :") for c in cmd)
            return subprocess.CompletedProcess(cmd, 0, stdout=sample_ss, stderr="")
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

def _stub_same_uid(monkeypatch):
    """Helper: make _pid_uid return the same uid as os.getuid() so the
    B3 trust check passes in unit tests."""
    try:
        my_uid = d.os.getuid()
    except Exception:
        my_uid = 1000
    monkeypatch.setattr(d, "_pid_uid", lambda pid: my_uid)


def test_capture_engine_argv_matches_sentinel(monkeypatch):
    _stub_same_uid(monkeypatch)
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["python", "-m", "vllm.entrypoints.openai.api_server", "--model", "x"],
    )
    argv = d._capture_engine_argv(8000, ["vllm.entrypoints.openai.api_server"])
    assert argv == ["python", "-m", "vllm.entrypoints.openai.api_server", "--model", "x"]


def test_capture_engine_argv_rejects_wrong_sentinel(monkeypatch):
    _stub_same_uid(monkeypatch)
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["python", "-m", "flask", "run"],
    )
    assert d._capture_engine_argv(8000, ["vllm"]) is None


# ─── B1 red-team: shell denylist + exact-token matching ────────────────────

def test_capture_engine_argv_rejects_grep_with_sentinel_in_args(monkeypatch):
    """`grep llama-server /var/log/app.log` on the port must NOT respawn."""
    _stub_same_uid(monkeypatch)
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["grep", "llama-server", "/var/log/app.log"],
    )
    assert d._capture_engine_argv(8080, ["llama-server"]) is None


def test_capture_engine_argv_rejects_substring_false_positive(monkeypatch):
    """`./wait-for-vllm-debug` must NOT match sentinel `vllm` (substring)."""
    _stub_same_uid(monkeypatch)
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["./wait-for-vllm-debug", "--port", "8080"],
    )
    assert d._capture_engine_argv(8080, ["vllm"]) is None


def test_capture_engine_argv_accepts_path_basename_match(monkeypatch):
    """`/opt/llamacpp/bin/llama-server` basename must match `llama-server`."""
    _stub_same_uid(monkeypatch)
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["/opt/llamacpp/bin/llama-server", "--port", "8080"],
    )
    argv = d._capture_engine_argv(8080, ["llama-server"])
    assert argv == ["/opt/llamacpp/bin/llama-server", "--port", "8080"]


# ─── B3 red-team: UID trust boundary ───────────────────────────────────────

def test_capture_engine_argv_rejects_foreign_uid(monkeypatch):
    """Process listening on port owned by a different UID → skip."""
    monkeypatch.setattr(d, "_pids_listening_on_port", lambda port: [12345])
    # Foreign UID (daemon uid + 1) — must not be trusted.
    try:
        my_uid = d.os.getuid()
    except Exception:
        my_uid = 1000
    monkeypatch.setattr(d, "_pid_uid", lambda pid: my_uid + 1)
    monkeypatch.setattr(
        d, "_read_proc_cmdline",
        lambda pid: ["python", "-m", "vllm.entrypoints.openai.api_server"],
    )
    assert d._capture_engine_argv(8000, ["vllm.entrypoints.openai.api_server"]) is None


# ─── llama.cpp gating mirror of vLLM no-op test ─────────────────────────────

def test_restart_engine_llamacpp_noop_when_flag_unset(monkeypatch):
    monkeypatch.delenv("ENABLE_LLAMACPP_RESTART", raising=False)

    def spy_popen(*args, **kwargs):
        raise AssertionError("Popen should not be called when flag is unset")

    monkeypatch.setattr(d.subprocess, "Popen", spy_popen)
    result = d.restart_engine("llamacpp", port=8080)
    assert result is False


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
    # I4 review fix: all three std fds must be explicitly closed.
    assert spawn_kwargs.get("stdin") == d.subprocess.DEVNULL
    assert spawn_kwargs.get("stdout") == d.subprocess.DEVNULL
    assert spawn_kwargs.get("stderr") == d.subprocess.DEVNULL
