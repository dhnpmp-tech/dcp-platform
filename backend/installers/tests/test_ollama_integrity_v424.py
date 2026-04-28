"""Tests for v4.2.4 Ollama blob-integrity sweep (audit M2).

Covers verify_ollama_model, _ollama_list_installed, verify_all_ollama_models,
is_ollama_model_verified, and the auto-repull throttle / accepting_jobs gate.
"""
import json
import sys
import pathlib
import threading
import time
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


# ─── helpers ─────────────────────────────────────────────────────────────────


class _FakeResp:
    def __init__(self, status, payload=None):
        self.status_code = status
        self.ok = 200 <= status < 300
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


def _reset_integrity_state():
    """Each test starts with a clean cache so cross-test bleed is impossible."""
    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"].clear()
        d._OLLAMA_INTEGRITY["last_full_sweep"] = 0.0
    with d._OLLAMA_REPULL_LOCK:
        d._OLLAMA_REPULL_HISTORY.clear()
        d._OLLAMA_REPULL_ACTIVE.clear()


@pytest.fixture(autouse=True)
def _clean_state():
    _reset_integrity_state()
    yield
    _reset_integrity_state()


# ─── verify_ollama_model ─────────────────────────────────────────────────────


def test_verify_ollama_model_ok(monkeypatch):
    """200 from /api/show -> (True, None)."""
    def fake_post(url, json=None, timeout=None):
        assert url.endswith("/api/show")
        assert json == {"name": "qwen3:4b"}
        return _FakeResp(200, {"modelfile": "..."})

    monkeypatch.setattr(d, "HAS_REQUESTS", True)
    monkeypatch.setattr(d.requests, "post", fake_post)
    ok, err = d.verify_ollama_model("qwen3:4b")
    assert ok is True
    assert err is None


def test_verify_ollama_model_404_broken(monkeypatch):
    """4xx from /api/show -> (False, "http_404"). This is the corrupt-blob signal."""
    def fake_post(url, json=None, timeout=None):
        return _FakeResp(404, {"error": "not found"})

    monkeypatch.setattr(d, "HAS_REQUESTS", True)
    monkeypatch.setattr(d.requests, "post", fake_post)
    ok, err = d.verify_ollama_model("nonexistent")
    assert ok is False
    assert err == "http_404"


def test_verify_ollama_model_network_error(monkeypatch):
    """Timeout / refused -> (False, truncated message)."""
    def fake_post(url, json=None, timeout=None):
        raise ConnectionError("connection refused")

    monkeypatch.setattr(d, "HAS_REQUESTS", True)
    monkeypatch.setattr(d.requests, "post", fake_post)
    ok, err = d.verify_ollama_model("anything")
    assert ok is False
    assert "connection refused" in err


# ─── _ollama_list_installed ──────────────────────────────────────────────────


def test_list_installed_parses_name_digest_size(monkeypatch):
    """Each /api/tags entry should expose name + digest + size."""
    payload = {
        "models": [
            {"name": "qwen3:4b", "digest": "sha256:abc123" + "0" * 50, "size": 2_500_000_000},
            {"name": "mistral:7b", "digest": "sha256:def456" + "0" * 50, "size": 4_100_000_000},
        ]
    }

    def fake_get(url, timeout=None):
        assert url.endswith("/api/tags")
        return _FakeResp(200, payload)

    monkeypatch.setattr(d, "HAS_REQUESTS", True)
    monkeypatch.setattr(d.requests, "get", fake_get)
    out = d._ollama_list_installed()
    assert len(out) == 2
    assert {e["name"] for e in out} == {"qwen3:4b", "mistral:7b"}
    assert out[0]["digest"].startswith("sha256:")
    assert out[0]["size"] > 0


def test_list_installed_returns_empty_on_failure(monkeypatch):
    """If Ollama is down, return [] — caller treats it as no-op (non-Ollama provider)."""
    def fake_get(url, timeout=None):
        raise ConnectionError("ollama down")

    monkeypatch.setattr(d, "HAS_REQUESTS", True)
    monkeypatch.setattr(d.requests, "get", fake_get)
    assert d._ollama_list_installed() == []


# ─── is_ollama_model_verified (heartbeat filter) ─────────────────────────────


def test_is_verified_default_true_for_unknown():
    """Names not in the cache pass through. This is critical for vLLM/llama.cpp
    models we never integrity-check, and for the very first heartbeat before
    the sweep has populated the cache."""
    assert d.is_ollama_model_verified("never-seen") is True


def test_is_verified_true_when_cache_says_ok():
    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"]["good"] = {
            "ok": True, "checked_at": time.time(), "error": None, "digest": ""
        }
    assert d.is_ollama_model_verified("good") is True


def test_is_verified_false_when_cache_says_broken():
    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"]["bad"] = {
            "ok": False, "checked_at": time.time(), "error": "http_404", "digest": "sha256:xx"
        }
    assert d.is_ollama_model_verified("bad") is False


# ─── verify_all_ollama_models ────────────────────────────────────────────────


def test_sweep_reports_broken_and_emits_event(monkeypatch):
    """One ok + one broken model. Event should fire only for the broken one
    and include the digest (roadmap item 4 — manifest sha256 correlation key)."""
    monkeypatch.setattr(d, "HAS_REQUESTS", True)

    list_payload = {
        "models": [
            {"name": "ok-model", "digest": "sha256:" + "a" * 64, "size": 100},
            {"name": "broken-model", "digest": "sha256:" + "b" * 64, "size": 200},
        ]
    }

    def fake_get(url, timeout=None):
        assert "/api/tags" in url
        return _FakeResp(200, list_payload)

    def fake_post(url, json=None, timeout=None):
        if json["name"] == "ok-model":
            return _FakeResp(200, {"modelfile": "..."})
        return _FakeResp(404, {"error": "blob not found"})

    monkeypatch.setattr(d.requests, "get", fake_get)
    monkeypatch.setattr(d.requests, "post", fake_post)

    events = []

    def fake_report_event(event_type, details=None, job_id=None, severity="info"):
        events.append({
            "event_type": event_type,
            "details": details,
            "severity": severity,
        })

    monkeypatch.setattr(d, "report_event", fake_report_event)

    result = d.verify_all_ollama_models()

    assert result["ok"] == ["ok-model"]
    assert result["broken"] == ["broken-model"]
    assert "broken-model" in result["errors"]

    integrity_events = [e for e in events if e["event_type"] == "model_integrity_failed"]
    assert len(integrity_events) == 1
    assert "name=broken-model" in integrity_events[0]["details"]
    # Item 4: digest is keyed in the event for cross-provider correlation.
    assert "digest=sha256:" in integrity_events[0]["details"]
    assert integrity_events[0]["severity"] == "warning"


def test_sweep_prunes_stale_entries(monkeypatch):
    """A model that disappears from /api/tags between sweeps should be removed
    from the integrity cache."""
    monkeypatch.setattr(d, "HAS_REQUESTS", True)

    # Pre-seed a model that no longer exists.
    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"]["old-model"] = {
            "ok": True, "checked_at": 0.0, "error": None, "digest": ""
        }

    def fake_get(url, timeout=None):
        return _FakeResp(200, {"models": [{"name": "current", "digest": "x", "size": 1}]})

    def fake_post(url, json=None, timeout=None):
        return _FakeResp(200, {})

    monkeypatch.setattr(d.requests, "get", fake_get)
    monkeypatch.setattr(d.requests, "post", fake_post)
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: None)

    d.verify_all_ollama_models()

    with d._OLLAMA_INTEGRITY_LOCK:
        assert "old-model" not in d._OLLAMA_INTEGRITY["models"]
        assert "current" in d._OLLAMA_INTEGRITY["models"]


def test_sweep_busts_served_models_cache(monkeypatch):
    """After a sweep, _SERVED_MODELS_CACHE must be invalidated so the next
    heartbeat reflects the new verified set without waiting for the 60s TTL."""
    monkeypatch.setattr(d, "HAS_REQUESTS", True)

    # Pre-populate served-models cache as if a heartbeat just ran.
    with d._served_models_lock:
        d._SERVED_MODELS_CACHE["data"] = {"models": ["stale"], "engines": ["ollama"]}
        d._SERVED_MODELS_CACHE["timestamp"] = time.time()

    def fake_get(url, timeout=None):
        return _FakeResp(200, {"models": [{"name": "x", "digest": "d", "size": 1}]})

    def fake_post(url, json=None, timeout=None):
        return _FakeResp(200, {})

    monkeypatch.setattr(d.requests, "get", fake_get)
    monkeypatch.setattr(d.requests, "post", fake_post)
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: None)

    d.verify_all_ollama_models()

    with d._served_models_lock:
        assert d._SERVED_MODELS_CACHE["data"] is None


# ─── auto-repull throttle + accepting_jobs gate ──────────────────────────────


def test_repull_disabled_by_default():
    """Without DCP_OLLAMA_AUTO_REPULL, _maybe_repull never spawns."""
    # OLLAMA_REPULL_ENABLED is read at module load; force the test path.
    assert d.OLLAMA_REPULL_ENABLED in (True, False)
    if d.OLLAMA_REPULL_ENABLED:
        pytest.skip("DCP_OLLAMA_AUTO_REPULL=1 in this env; skip default-off test")
    assert d._maybe_repull("anything") is False


def test_repull_throttle_blocks_second_attempt(monkeypatch):
    """Two _maybe_repull calls in quick succession should produce one Popen."""
    monkeypatch.setattr(d, "OLLAMA_REPULL_ENABLED", True)
    monkeypatch.setattr(d, "OLLAMA_REPULL_THROTTLE_SEC", 3600)
    # v4.2.5 — disable retry inside the throttle test so it asserts only the
    # name-level throttle, not the per-attempt retry budget.
    monkeypatch.setattr(d, "OLLAMA_REPULL_MAX_ATTEMPTS", 1)
    monkeypatch.setattr(d, "OLLAMA_REPULL_BACKOFF_SEC", 0)
    monkeypatch.setattr(d, "OLLAMA_REPULL_BACKOFF_CAP_SEC", 0)
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: None)

    spawned = []

    class FakeProc:
        def wait(self, timeout=None):
            return 0

    def fake_popen(cmd, *args, **kwargs):
        spawned.append(cmd)
        return FakeProc()

    monkeypatch.setattr(d.subprocess, "Popen", fake_popen)

    assert d._maybe_repull("model-a") is True
    assert d._maybe_repull("model-a") is False
    assert len([c for c in spawned if "model-a" in c]) == 1


def test_is_repull_in_flight_reflects_active_set():
    assert d.is_repull_in_flight() is False
    with d._OLLAMA_REPULL_LOCK:
        d._OLLAMA_REPULL_ACTIVE.add("foo")
    assert d.is_repull_in_flight() is True
    with d._OLLAMA_REPULL_LOCK:
        d._OLLAMA_REPULL_ACTIVE.discard("foo")
    assert d.is_repull_in_flight() is False


# ─── detect_served_models filtering ──────────────────────────────────────────


# ─── audit M3: repull retry + post-pull verify (v4.2.5) ──────────────────────


def _stub_repull_env(monkeypatch, max_attempts=3, backoff_sec=0):
    """Configure _maybe_repull's retry tunables for fast tests."""
    monkeypatch.setattr(d, "OLLAMA_REPULL_ENABLED", True)
    monkeypatch.setattr(d, "OLLAMA_REPULL_THROTTLE_SEC", 0)
    monkeypatch.setattr(d, "OLLAMA_REPULL_MAX_ATTEMPTS", max_attempts)
    monkeypatch.setattr(d, "OLLAMA_REPULL_BACKOFF_SEC", backoff_sec)
    monkeypatch.setattr(d, "OLLAMA_REPULL_BACKOFF_CAP_SEC", backoff_sec)
    monkeypatch.setattr(d, "OLLAMA_PULL_TIMEOUT_SEC", 60)
    # No real sleeping in tests.
    monkeypatch.setattr(d.time, "sleep", lambda _s: None)


class _FakeProc:
    def __init__(self, rc):
        self._rc = rc

    def wait(self, timeout=None):
        return self._rc

    def kill(self):
        pass


def _wait_for_thread_join(timeout=2.0):
    """Block until the Repull watcher thread finishes (it's daemon=True)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        active = [t for t in threading.enumerate() if t.name.startswith("DCP-OllamaRepull-")]
        if not active:
            return True
        time.sleep(0.01)
    return False


def test_repull_succeeds_first_attempt_and_marks_verified(monkeypatch):
    """rc=0 + verify ok on attempt 1 => integrity cache flipped to ok=True,
    no retry, no exhaustion event."""
    _stub_repull_env(monkeypatch, max_attempts=3, backoff_sec=0)

    popens = []
    monkeypatch.setattr(d.subprocess, "Popen", lambda *a, **kw: (popens.append(a) or _FakeProc(0)))
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    events = []
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: events.append((a, kw)))

    # Pre-mark broken so we can confirm the post-success flip.
    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"]["m1"] = {"ok": False, "checked_at": 0.0, "error": "http_500"}

    assert d._maybe_repull("m1") is True
    assert _wait_for_thread_join()

    assert len(popens) == 1
    with d._OLLAMA_INTEGRITY_LOCK:
        assert d._OLLAMA_INTEGRITY["models"]["m1"]["ok"] is True
    # No exhaustion event on success.
    assert not any(ev[0][0] == "model_repull_exhausted" for ev in events)
    # Active flag cleared.
    assert d.is_repull_in_flight() is False


def test_repull_retries_on_nonzero_then_succeeds(monkeypatch):
    """First two pulls rc!=0; third rc=0 + verify ok => 3 Popens, marked ok."""
    _stub_repull_env(monkeypatch, max_attempts=3, backoff_sec=0)

    rc_sequence = iter([1, 1, 0])
    popens = []

    def fake_popen(*a, **kw):
        popens.append(a)
        return _FakeProc(next(rc_sequence))

    monkeypatch.setattr(d.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: None)

    assert d._maybe_repull("m2") is True
    assert _wait_for_thread_join()

    assert len(popens) == 3
    with d._OLLAMA_INTEGRITY_LOCK:
        assert d._OLLAMA_INTEGRITY["models"]["m2"]["ok"] is True


def test_repull_exhausted_after_max_attempts(monkeypatch):
    """All N attempts rc!=0 => exhausted event, integrity cache untouched."""
    _stub_repull_env(monkeypatch, max_attempts=2, backoff_sec=0)

    monkeypatch.setattr(d.subprocess, "Popen", lambda *a, **kw: _FakeProc(99))
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    events = []
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: events.append((a, kw)))

    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"]["m3"] = {"ok": False, "checked_at": 0.0, "error": "http_500"}

    assert d._maybe_repull("m3") is True
    assert _wait_for_thread_join()

    # Exhaustion event reported.
    assert any(ev[0][0] == "model_repull_exhausted" for ev in events)
    # Cache still ok=False (not promoted).
    with d._OLLAMA_INTEGRITY_LOCK:
        assert d._OLLAMA_INTEGRITY["models"]["m3"]["ok"] is False


def test_repull_rc0_but_verify_fails_counts_as_attempt(monkeypatch):
    """rc=0 but /api/show says broken => verify_failed event + retry consumed."""
    _stub_repull_env(monkeypatch, max_attempts=2, backoff_sec=0)

    monkeypatch.setattr(d.subprocess, "Popen", lambda *a, **kw: _FakeProc(0))
    # First verify fails, second succeeds.
    verify_seq = iter([(False, "http_404"), (True, None)])
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: next(verify_seq))
    events = []
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: events.append((a, kw)))

    assert d._maybe_repull("m4") is True
    assert _wait_for_thread_join()

    # Verify failure surfaced as its own event.
    assert any(ev[0][0] == "model_repull_verify_failed" for ev in events)
    # Eventual success on attempt 2 marks ok.
    with d._OLLAMA_INTEGRITY_LOCK:
        assert d._OLLAMA_INTEGRITY["models"]["m4"]["ok"] is True


def test_repull_keeps_active_flag_for_full_retry_window(monkeypatch):
    """is_repull_in_flight stays True across all attempts so the heartbeat
    keeps accepting_jobs=False until the watcher exits."""
    _stub_repull_env(monkeypatch, max_attempts=2, backoff_sec=0)

    seen_active = []

    def fake_popen(*a, **kw):
        # Snapshot is_repull_in_flight at each spawn — should be True every time.
        seen_active.append(d.is_repull_in_flight())
        return _FakeProc(1)

    monkeypatch.setattr(d.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: None)

    assert d._maybe_repull("m5") is True
    assert _wait_for_thread_join()

    assert seen_active == [True, True]
    assert d.is_repull_in_flight() is False


def test_repull_pull_timeout_classified_as_attempt(monkeypatch):
    """Subprocess timeout counts as a failed attempt and feeds the retry loop."""
    import subprocess as _sp
    _stub_repull_env(monkeypatch, max_attempts=2, backoff_sec=0)

    class _TimeoutProc:
        def __init__(self):
            self.killed = False

        def wait(self, timeout=None):
            raise _sp.TimeoutExpired(cmd="ollama pull", timeout=timeout or 1)

        def kill(self):
            self.killed = True

    monkeypatch.setattr(d.subprocess, "Popen", lambda *a, **kw: _TimeoutProc())
    monkeypatch.setattr(d, "verify_ollama_model", lambda name: (True, None))
    events = []
    monkeypatch.setattr(d, "report_event", lambda *a, **kw: events.append((a, kw)))

    assert d._maybe_repull("m6") is True
    assert _wait_for_thread_join()

    # Two attempts were made and exhaustion was reported.
    assert any(ev[0][0] == "model_repull_exhausted" for ev in events)


# ─── detect_served_models filtering ──────────────────────────────────────────


def test_detect_served_models_filters_broken_ollama(monkeypatch):
    """Models flagged broken in the integrity cache must be omitted from
    the detect_served_models() output that feeds heartbeat.cached_models."""
    # Prime the served-models cache as cold.
    with d._served_models_lock:
        d._SERVED_MODELS_CACHE["data"] = None
        d._SERVED_MODELS_CACHE["timestamp"] = 0.0

    # Broken model is in the integrity cache as ok=False.
    with d._OLLAMA_INTEGRITY_LOCK:
        d._OLLAMA_INTEGRITY["models"]["broken-one"] = {
            "ok": False, "checked_at": time.time(), "error": "http_404", "digest": ""
        }

    monkeypatch.setattr(d, "HAS_REQUESTS", True)

    def fake_get(url, timeout=None):
        if "/api/tags" in url:
            return _FakeResp(200, {"models": [
                {"name": "good-one"}, {"name": "broken-one"}
            ]})
        # vLLM and llama.cpp: empty
        return _FakeResp(404, {})

    monkeypatch.setattr(d.requests, "get", fake_get)
    # Don't let alias expansion bring "broken-one" back in via aliases.
    monkeypatch.setattr(d, "expand_model_identities", lambda x: [x])

    out = d.detect_served_models()
    assert "good-one" in out["models"]
    assert "broken-one" not in out["models"]
    assert "broken-one" not in out["models_raw"]
