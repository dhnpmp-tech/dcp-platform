"""Tests for backend-issued provider task execution in the daemon.

Migration 008 already lets the backend return `pending_tasks` on heartbeat and
accept `task_updates` on the next heartbeat. These tests cover the daemon side
of that channel so cold model pull tasks do not get stranded forever.
"""
import pathlib
import sys
import types

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


@pytest.fixture(autouse=True)
def _reset_provider_task_state():
    with d._PROVIDER_TASK_LOCK:
        d._PROVIDER_TASK_ACTIVE.clear()
        d._PROVIDER_TASK_UPDATES.clear()
    yield
    with d._PROVIDER_TASK_LOCK:
        d._PROVIDER_TASK_ACTIVE.clear()
        d._PROVIDER_TASK_UPDATES.clear()


def _task(task_id=42, pull_uri="qwen3:8b"):
    return {
        "task_id": task_id,
        "task_type": "pull_model",
        "params": {
            "model_id": "qwen3:8b",
            "ollama_pull_uri": pull_uri,
            "download_size_bytes": 10,
        },
    }


def test_provider_task_updates_ack_only_removes_sent_prefix():
    d._queue_provider_task_update(1, "in_progress", 5, "started")
    d._queue_provider_task_update(2, "completed", 100, "done")

    snap = d._snapshot_provider_task_updates()
    assert [u["task_id"] for u in snap] == [1, 2]

    d._queue_provider_task_update(3, "failed", 100, "late", "boom")
    d._ack_provider_task_updates(len(snap))

    remaining = d._snapshot_provider_task_updates()
    assert [u["task_id"] for u in remaining] == [3]


def test_execute_pull_model_task_success(monkeypatch):
    calls = []

    def fake_run(cmd, capture_output=None, text=None, timeout=None):
        calls.append((cmd, timeout))
        return types.SimpleNamespace(returncode=0, stdout="ok", stderr="")

    monkeypatch.setattr(d, "_provider_task_disk_ok", lambda _size: True)
    monkeypatch.setattr(d.subprocess, "run", fake_run)
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    monkeypatch.setattr(d, "report_event", lambda *args, **kwargs: None)

    d._execute_pull_model_task(_task())

    assert calls == [(["ollama", "pull", "qwen3:8b"], d.OLLAMA_PULL_TIMEOUT_SEC)]
    updates = d._snapshot_provider_task_updates()
    assert [u["status"] for u in updates] == ["in_progress", "in_progress", "completed"]
    assert updates[-1]["progress_pct"] == 100
    assert "Pulled and verified" in updates[-1]["progress_message"]


def test_execute_pull_model_task_fails_when_disk_is_too_small(monkeypatch):
    monkeypatch.setattr(d, "_provider_task_disk_ok", lambda _size: False)

    d._execute_pull_model_task(_task())

    updates = d._snapshot_provider_task_updates()
    assert updates == [
        {
            "task_id": 42,
            "status": "failed",
            "progress_pct": 100,
            "progress_message": "Insufficient disk for qwen3:8b",
            "error_reason": "insufficient_disk",
        }
    ]


def test_pending_provider_tasks_do_not_spawn_duplicate_active_task(monkeypatch):
    started = []

    class FakeThread:
        def __init__(self, target=None, daemon=None, name=None):
            self.target = target
            self.daemon = daemon
            self.name = name

        def start(self):
            started.append(self.name)

    monkeypatch.setattr(d.threading, "Thread", FakeThread)

    resp = {"pending_tasks": [_task(77), _task(77)]}
    assert d._handle_pending_provider_tasks(resp) == 1

    with d._PROVIDER_TASK_LOCK:
        assert d._PROVIDER_TASK_ACTIVE == {77}
    assert started == ["DCP-ProviderTask-77"]


def test_unsupported_provider_task_reports_failure():
    assert d._start_provider_task({"task_id": 9, "task_type": "noop", "params": {}}) is False
    assert d._snapshot_provider_task_updates() == [
        {
            "task_id": 9,
            "status": "failed",
            "progress_pct": 100,
            "progress_message": "Unsupported task type noop",
            "error_reason": "unsupported_task_type",
        }
    ]

