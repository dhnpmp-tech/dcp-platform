"""Tests for v4.5.0 run-mode / GPU-cap / temp-limit enforcement (Backlog #9).

The daemon now enforces the provider's run preferences from
~/dcp-provider/config.json in the job-accept decision. Pre-4.5.0 it READ the
file (force_bare_metal) but IGNORED run_mode / scheduled_start / scheduled_end /
gpu_usage_cap_pct / temp_limit_c.

The single most important property under test is the SAFE-ROLLOUT default:
an unset / unknown / "always-on" run_mode MUST accept jobs (zero behaviour
change for existing providers), and a missing config file MUST accept. We also
assert headless rigs (no GPU util signal) are NEVER stranded under run_mode=idle.
"""
import sys
import pathlib
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import dcp_daemon as d


# ─── fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_enforcement_state():
    """Reset the per-process idle/temp state machines around each test."""
    with d._idle_state_lock:
        d._idle_util_busy_since = None
    with d._temp_limit_lock:
        d._temp_limit_tripped = False
        d._temp_limit_last_event = 0.0
    yield
    with d._idle_state_lock:
        d._idle_util_busy_since = None
    with d._temp_limit_lock:
        d._temp_limit_tripped = False
        d._temp_limit_last_event = 0.0


def _gpu(util=0, temp=0, driver="550.54", apple=False):
    g = {"gpu_util_pct": util, "temp_c": temp, "driver_version": driver}
    if apple:
        g["is_apple_silicon"] = True
        g["driver_version"] = "Metal"
    return g


def _prefs(**over):
    base = {
        "run_mode": "always-on",
        "scheduled_start": None,
        "scheduled_end": None,
        "gpu_usage_cap_pct": None,
        "temp_limit_c": None,
    }
    base.update(over)
    return base


# ─── SAFE-ROLLOUT DEFAULT: the property a reviewer must confirm ───────────────


def test_default_always_on_accepts():
    """run_mode='always-on' → accept (the installer's default value)."""
    accept, reason = d.evaluate_job_admission(prefs=_prefs(run_mode="always-on"),
                                               gpu=_gpu(util=99, temp=70))
    assert accept is True, reason


def test_unset_run_mode_accepts():
    """Empty/None run_mode resolves to always-on → accept."""
    accept, _ = d.evaluate_job_admission(prefs=_prefs(run_mode=""), gpu=_gpu(util=99))
    assert accept is True


def test_unknown_run_mode_accepts():
    """An unrecognised run_mode must fall through to accept, never refuse."""
    accept, _ = d.evaluate_job_admission(prefs=_prefs(run_mode="banana"), gpu=_gpu(util=99))
    assert accept is True


def test_manual_run_mode_accepts():
    """'manual' (a real frontend value) is not a gating mode → accept."""
    accept, _ = d.evaluate_job_admission(prefs=_prefs(run_mode="manual"), gpu=_gpu(util=99))
    assert accept is True


def test_missing_config_file_yields_always_on(monkeypatch, tmp_path):
    """No config.json → load_run_preferences() returns the always-on default."""
    monkeypatch.setattr(d, "CONFIG_DIR", tmp_path)  # empty dir, no config.json
    prefs = d.load_run_preferences()
    assert prefs["run_mode"] == "always-on"
    accept, _ = d.evaluate_job_admission(prefs=prefs, gpu=_gpu(util=99))
    assert accept is True


def test_gate_fails_open_on_error(monkeypatch):
    """job_admission_gate() must accept (fail open) if evaluation throws."""
    def _boom():
        raise RuntimeError("simulated bug in enforcement")
    monkeypatch.setattr(d, "evaluate_job_admission", lambda *a, **k: _boom())
    assert d.job_admission_gate() is True


# ─── run_mode = idle ──────────────────────────────────────────────────────────


def test_idle_busy_gpu_refuses():
    """run_mode=idle with a busy GPU (util high) → refuse."""
    accept, reason = d.evaluate_job_admission(prefs=_prefs(run_mode="idle"),
                                              gpu=_gpu(util=90, driver="550.54"))
    assert accept is False
    assert "idle" in reason


def test_idle_no_util_signal_accepts_headless():
    """CRITICAL: headless rig / no util signal under run_mode=idle → eligible.

    A GPU with no trustworthy util reading (driver 'unknown' / Apple Metal /
    no GPU) must NOT be treated as 'never idle' and stranded."""
    # Apple Silicon (placeholder util=0, Metal driver) → no signal → accept.
    accept_apple, _ = d.evaluate_job_admission(prefs=_prefs(run_mode="idle"),
                                               gpu=_gpu(apple=True))
    assert accept_apple is True
    # No GPU at all → no signal → accept.
    accept_none, _ = d.evaluate_job_admission(prefs=_prefs(run_mode="idle"), gpu=None)
    assert accept_none is True


def test_idle_requires_sustained_window():
    """A single low sample is not enough; idle requires the sustained window."""
    gpu = _gpu(util=5, driver="550.54")
    t0 = 1000.0
    # First low sample: starts the clock, not idle yet.
    assert d.is_gpu_idle(gpu, now_monotonic=t0) is False
    # Still inside the window.
    assert d.is_gpu_idle(gpu, now_monotonic=t0 + 10) is False
    # Past the sustained window → idle.
    assert d.is_gpu_idle(gpu, now_monotonic=t0 + d._IDLE_SUSTAINED_WINDOW_S + 1) is True


def test_idle_busy_sample_resets_window():
    """A busy sample resets the idle clock so we don't accept mid-burst."""
    gpu_low = _gpu(util=5, driver="550.54")
    gpu_busy = _gpu(util=80, driver="550.54")
    t0 = 2000.0
    d.is_gpu_idle(gpu_low, now_monotonic=t0)                  # start clock
    d.is_gpu_idle(gpu_busy, now_monotonic=t0 + 30)            # busy → reset
    # Even though wall time advanced, the window restarted at the busy sample.
    assert d.is_gpu_idle(gpu_low, now_monotonic=t0 + 31) is False


# ─── run_mode = scheduled ─────────────────────────────────────────────────────


def test_scheduled_wraps_midnight_inside_window():
    """23:00→07:00 window: 02:00 is inside."""
    import datetime as _dt
    now = _dt.datetime(2026, 5, 30, 2, 0)
    assert d.is_within_schedule("23:00", "07:00", now=now) is True


def test_scheduled_wraps_midnight_outside_window():
    """23:00→07:00 window: 12:00 is outside."""
    import datetime as _dt
    now = _dt.datetime(2026, 5, 30, 12, 0)
    assert d.is_within_schedule("23:00", "07:00", now=now) is False


def test_scheduled_same_day_window():
    """09:00→17:00 window: 13:00 inside, 20:00 outside."""
    import datetime as _dt
    assert d.is_within_schedule("09:00", "17:00", now=_dt.datetime(2026, 5, 30, 13, 0)) is True
    assert d.is_within_schedule("09:00", "17:00", now=_dt.datetime(2026, 5, 30, 20, 0)) is False


def test_scheduled_missing_bounds_behaves_always_on():
    """Absent/malformed schedule bounds → undefined window → accept (always-on)."""
    assert d.is_within_schedule(None, None) is True
    assert d.is_within_schedule("garbage", "07:00") is True
    accept, _ = d.evaluate_job_admission(
        prefs=_prefs(run_mode="scheduled", scheduled_start=None, scheduled_end=None),
        gpu=_gpu())
    assert accept is True


def test_scheduled_outside_window_refuses():
    import datetime as _dt
    accept, reason = d.evaluate_job_admission(
        prefs=_prefs(run_mode="scheduled", scheduled_start="23:00", scheduled_end="07:00"),
        gpu=_gpu(),
        now=_dt.datetime(2026, 5, 30, 12, 0))
    assert accept is False
    assert "scheduled" in reason


# ─── gpu_usage_cap_pct ─────────────────────────────────────────────────────────


def test_cap_none_or_100_no_gate():
    """No cap / 100% → never refuse on capacity."""
    ok, _ = d.evaluate_gpu_cap(None, max_slots=4, active_jobs=3)
    assert ok is True
    ok2, _ = d.evaluate_gpu_cap(100, max_slots=4, active_jobs=3)
    assert ok2 is True


def test_cap_low_never_zeroes_single_gpu():
    """A 10% cap on a single-GPU rig still allows at least 1 concurrent job."""
    ok, _ = d.evaluate_gpu_cap(10, max_slots=1, active_jobs=0)
    assert ok is True


def test_cap_refuses_when_exceeding_allowance():
    """50% cap on 4 slots → max 2 concurrent; a 3rd is refused."""
    ok, reason = d.evaluate_gpu_cap(50, max_slots=4, active_jobs=2)
    assert ok is False
    assert "cap" in reason.lower()


def test_cap_allows_within_allowance():
    ok, _ = d.evaluate_gpu_cap(50, max_slots=4, active_jobs=1)
    assert ok is True


# ─── temp_limit_c with hysteresis ─────────────────────────────────────────────


def test_temp_under_limit_accepts():
    ok, reason = d.evaluate_temp_limit(_gpu(temp=70), temp_limit_c=85)
    assert ok is True and reason is None


def test_temp_placeholder_zero_never_trips(monkeypatch):
    """temp_c=0 (Apple/Windows fallback placeholder) carries no signal → accept."""
    monkeypatch.setattr(d, "start_draining", lambda: None)
    ok, _ = d.evaluate_temp_limit(_gpu(temp=0), temp_limit_c=85)
    assert ok is True


def test_temp_over_limit_trips_and_drains(monkeypatch):
    drained = {"called": False}
    monkeypatch.setattr(d, "start_draining", lambda: drained.__setitem__("called", True))
    monkeypatch.setattr(d, "report_event", lambda *a, **k: None)
    ok, reason = d.evaluate_temp_limit(_gpu(temp=90), temp_limit_c=85)
    assert ok is False
    assert "exceeds" in reason
    assert drained["called"] is True


def test_temp_hysteresis_holds_until_cooldown(monkeypatch):
    """After tripping at 90°C (limit 85), still refuse at 82°C (above resume 80)."""
    monkeypatch.setattr(d, "start_draining", lambda: None)
    monkeypatch.setattr(d, "report_event", lambda *a, **k: None)
    d.evaluate_temp_limit(_gpu(temp=90), temp_limit_c=85)   # trip
    ok, _ = d.evaluate_temp_limit(_gpu(temp=82), temp_limit_c=85)  # 82 > 80 resume
    assert ok is False


def test_temp_resumes_at_hysteresis_threshold(monkeypatch):
    """Cooled to 80°C (limit 85, resume 85-5=80) → resume accepting."""
    monkeypatch.setattr(d, "start_draining", lambda: None)
    monkeypatch.setattr(d, "report_event", lambda *a, **k: None)
    d.evaluate_temp_limit(_gpu(temp=90), temp_limit_c=85)   # trip
    ok, _ = d.evaluate_temp_limit(_gpu(temp=80), temp_limit_c=85)  # at resume threshold
    assert ok is True


# ─── load_run_preferences parsing ─────────────────────────────────────────────


def test_load_prefs_parses_all_fields(monkeypatch, tmp_path):
    import json
    (tmp_path / "config.json").write_text(json.dumps({
        "api_key": "x", "run_mode": "Scheduled", "scheduled_start": "23:00",
        "scheduled_end": "07:00", "gpu_usage_cap_pct": 60, "temp_limit_c": 75,
    }))
    monkeypatch.setattr(d, "CONFIG_DIR", tmp_path)
    prefs = d.load_run_preferences()
    assert prefs["run_mode"] == "scheduled"   # lowercased
    assert prefs["scheduled_start"] == "23:00"
    assert prefs["gpu_usage_cap_pct"] == 60
    assert prefs["temp_limit_c"] == 75


def test_load_prefs_ignores_cap_100_and_zero(monkeypatch, tmp_path):
    """gpu_usage_cap_pct of 0 or >=100 means 'no cap' → None."""
    import json
    (tmp_path / "config.json").write_text(json.dumps({"gpu_usage_cap_pct": 100}))
    monkeypatch.setattr(d, "CONFIG_DIR", tmp_path)
    assert d.load_run_preferences()["gpu_usage_cap_pct"] is None
    (tmp_path / "config.json").write_text(json.dumps({"gpu_usage_cap_pct": 0}))
    assert d.load_run_preferences()["gpu_usage_cap_pct"] is None


def test_load_prefs_garbage_json_returns_defaults(monkeypatch, tmp_path):
    (tmp_path / "config.json").write_text("{not json")
    monkeypatch.setattr(d, "CONFIG_DIR", tmp_path)
    prefs = d.load_run_preferences()
    assert prefs["run_mode"] == "always-on"
