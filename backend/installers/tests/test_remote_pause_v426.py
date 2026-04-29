"""Tests for v4.2.6 remote-pause state mirroring (Tier 4.16 / G47).

Backend toggles providers.is_paused via POST /api/providers/{pause,resume},
then echoes the bit on the heartbeat response. The daemon mirrors it into
_REMOTE_PAUSED and forces accepting_jobs=false on the next heartbeat tick.

Covers:
  - _apply_remote_pause_state with 1 / 0 / None / bool / strings.
  - Transitions emit provider_remote_paused / provider_remote_resumed,
    no-op transitions emit nothing.
  - is_remote_paused() reflects current state.
  - Heartbeat payload accepting_jobs is forced False when remote paused.
  - Backward compat: missing is_paused leaves the flag alone (older backend).
"""
import sys
import pathlib
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


# ─── helpers ─────────────────────────────────────────────────────────────────


def _reset_remote_pause():
    with d._REMOTE_PAUSED_LOCK:
        d._REMOTE_PAUSED = False


@pytest.fixture(autouse=True)
def _clean_state():
    _reset_remote_pause()
    yield
    _reset_remote_pause()


@pytest.fixture
def captured_events(monkeypatch):
    """Capture report_event() calls so transition assertions can inspect them."""
    events = []

    def _fake_report_event(event_type, details=None, job_id=None, severity="info"):
        events.append({
            "event_type": event_type,
            "details": details,
            "job_id": job_id,
            "severity": severity,
        })

    monkeypatch.setattr(d, "report_event", _fake_report_event)
    return events


# ─── _apply_remote_pause_state — value handling ──────────────────────────────


def test_apply_pause_state_one_flips_to_paused(captured_events):
    """is_paused=1 in response -> _REMOTE_PAUSED becomes True."""
    assert d.is_remote_paused() is False
    d._apply_remote_pause_state(1)
    assert d.is_remote_paused() is True
    assert any(e["event_type"] == "provider_remote_paused" for e in captured_events)


def test_apply_pause_state_zero_flips_to_unpaused(captured_events):
    """is_paused=0 after a 1 -> _REMOTE_PAUSED becomes False."""
    d._apply_remote_pause_state(1)
    captured_events.clear()
    d._apply_remote_pause_state(0)
    assert d.is_remote_paused() is False
    assert any(e["event_type"] == "provider_remote_resumed" for e in captured_events)


def test_apply_pause_state_missing_field_no_change(captured_events):
    """is_paused absent (None) -> flag unchanged. Critical for old-backend compat."""
    d._apply_remote_pause_state(1)
    captured_events.clear()
    d._apply_remote_pause_state(None)
    assert d.is_remote_paused() is True, "None must not flip a paused daemon back to unpaused"
    assert captured_events == [], "None must not emit any events"


def test_apply_pause_state_no_event_when_state_unchanged(captured_events):
    """Same value twice -> only one event for the initial transition."""
    d._apply_remote_pause_state(1)
    d._apply_remote_pause_state(1)
    d._apply_remote_pause_state(1)
    paused_events = [e for e in captured_events if e["event_type"] == "provider_remote_paused"]
    assert len(paused_events) == 1, f"Expected exactly 1 paused event, got {len(paused_events)}"


def test_apply_pause_state_accepts_bool(captured_events):
    """Bool True / False also work — backend may upgrade serialization later."""
    d._apply_remote_pause_state(True)
    assert d.is_remote_paused() is True
    d._apply_remote_pause_state(False)
    assert d.is_remote_paused() is False


def test_apply_pause_state_accepts_string_one(captured_events):
    """String '1' coerces — defensive against JSON quirks."""
    d._apply_remote_pause_state("1")
    assert d.is_remote_paused() is True


def test_apply_pause_state_accepts_string_zero(captured_events):
    """String '0' coerces to False."""
    d._apply_remote_pause_state(1)
    d._apply_remote_pause_state("0")
    assert d.is_remote_paused() is False


# ─── Transition events have the right shape ──────────────────────────────────


def test_pause_transition_event_severity_info(captured_events):
    """Pause/resume are operator actions, not errors — severity must be 'info'."""
    d._apply_remote_pause_state(1)
    d._apply_remote_pause_state(0)
    paused = [e for e in captured_events if e["event_type"] == "provider_remote_paused"]
    resumed = [e for e in captured_events if e["event_type"] == "provider_remote_resumed"]
    assert len(paused) == 1 and paused[0]["severity"] == "info"
    assert len(resumed) == 1 and resumed[0]["severity"] == "info"


# ─── Heartbeat payload gate: accepting_jobs forced False when paused ─────────


def test_payload_gate_forces_accepting_jobs_false_when_remote_paused():
    """Mirror the heartbeat payload gate logic. With _REMOTE_PAUSED=True the
    `accepting_jobs and is_remote_paused()` branch must flip the field to
    False, even though all engines are healthy."""
    d._apply_remote_pause_state(1)
    payload = {"accepting_jobs": True}
    if payload["accepting_jobs"] and d.is_remote_paused():
        payload["accepting_jobs"] = False
        payload["remote_paused"] = True
    assert payload["accepting_jobs"] is False
    assert payload.get("remote_paused") is True


def test_payload_gate_leaves_accepting_jobs_true_when_not_paused():
    """With _REMOTE_PAUSED=False (default) the gate is a no-op."""
    payload = {"accepting_jobs": True}
    if payload["accepting_jobs"] and d.is_remote_paused():
        payload["accepting_jobs"] = False
        payload["remote_paused"] = True
    assert payload["accepting_jobs"] is True
    assert "remote_paused" not in payload


def test_payload_gate_does_not_overwrite_already_false_accepting_jobs():
    """If accepting_jobs is already False (engine down), the gate is a no-op
    so we don't add a misleading remote_paused=True flag."""
    d._apply_remote_pause_state(1)
    payload = {"accepting_jobs": False}
    if payload["accepting_jobs"] and d.is_remote_paused():
        payload["accepting_jobs"] = False
        payload["remote_paused"] = True
    assert payload["accepting_jobs"] is False
    assert "remote_paused" not in payload


# ─── Backward-compat: old backend response doesn't break daemon ──────────────


def test_old_backend_response_without_is_paused_field_is_ignored(captured_events):
    """An old backend that doesn't include is_paused in its heartbeat response
    must leave the daemon's local flag untouched. Models a daemon talking to
    a backend that hasn't been redeployed yet."""
    # Simulate the response-handling code path
    fake_old_response = {
        "success": True,
        "message": "Heartbeat received",
        "needs_update": False,
        # NOTE: deliberately no is_paused key
    }
    d._apply_remote_pause_state(fake_old_response.get("is_paused"))
    assert d.is_remote_paused() is False
    assert captured_events == []


def test_new_backend_response_with_is_paused_zero_keeps_unpaused(captured_events):
    """Default new-backend response with is_paused=0 is the steady state for
    a healthy unpaused provider. Must not emit a spurious resumed event."""
    fake_new_response = {
        "success": True,
        "is_paused": 0,
    }
    d._apply_remote_pause_state(fake_new_response.get("is_paused"))
    assert d.is_remote_paused() is False
    # First call from clean state with value 0 — state didn't change, so no event.
    assert captured_events == []


def test_new_backend_response_with_is_paused_one_flips_state(captured_events):
    """End-to-end shape: parse the actual response dict shape we expect."""
    fake_new_response = {
        "success": True,
        "is_paused": 1,
        "approval_status": "approved",
    }
    d._apply_remote_pause_state(fake_new_response.get("is_paused"))
    assert d.is_remote_paused() is True
    assert any(e["event_type"] == "provider_remote_paused" for e in captured_events)
