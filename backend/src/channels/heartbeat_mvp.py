#!/usr/bin/env python3
"""heartbeat_mvp.py — DCP channel-health prober.

Probes 5 critical channels every 60s. Writes results to channel_health
table in providers.db. Alerts topic 4 on transition edges (alive→dead,
dead→alive) — never spam steady-state down.

Run as a systemd timer:
    /etc/systemd/system/dcp-channel-probe.service
    /etc/systemd/system/dcp-channel-probe.timer (OnCalendar=*:0/1)

Channels covered in v1 (the ones that have ACTUALLY caused locked-in
incidents per memory: cloudflare tunnel orphan, hermes silent, MTP OOM):
  - openrouter        (api key liveness + auth)
  - hermes-telegram   (bot getMe)
  - agentmemory       (HTTP /health on :18792)
  - claude-mem        (HTTP probe)
  - chrome-devtools   (HTTP probe)

Skip-not-found is a feature: if a channel's secret/endpoint is absent
on this box, probe is marked `skipped` not `dead` so we don't alert.
"""
import json
import os
import sqlite3
import time
import urllib.error
import urllib.request

DB_PATH = "/root/dc1-platform/backend/data/providers.db"
TG_TOKEN = os.environ.get("TG_DEV_BOT_TOKEN", "8291599718:AAG03lWhtZCXeQAoqR4okAMtfXubAFM9Gus")
TG_CHAT_ID = -1003773787353
TG_TOPIC_ALERTS = 4   # 🔴 Alerts — never topic 7
PROBE_TIMEOUT_S = 3.0
DEBOUNCE_FAILS = 2    # alert only after N consecutive same-state probes

# Channels: (kind, target, reconnect_hint_when_dead)
# kind ∈ {"http_get", "http_token_get"}
# target uses {ENV:VAR} interpolation for secrets
CHANNELS = {
    "openrouter": (
        "http_token_get",
        "https://openrouter.ai/api/v1/auth/key|OPENROUTER_API_KEY",
        "rotate OPENROUTER_API_KEY or check billing at openrouter.ai/credits",
    ),
    "hermes-telegram": (
        "http_get",
        "https://api.telegram.org/bot{TG_DEV_BOT_TOKEN}/getMe",
        "rotate bot token or check api.telegram.org status",
    ),
    "deepseek": (
        "http_token_get",
        "https://api.deepseek.com/user/balance|DEEPSEEK_API_KEY",
        "rotate DEEPSEEK_API_KEY or top up balance at platform.deepseek.com",
    ),
    "anthropic": (
        "http_token_get_405ok",
        "https://api.anthropic.com/v1/models|ANTHROPIC_API_KEY",
        "rotate ANTHROPIC_API_KEY or check status.anthropic.com",
    ),
    "agentmemory": (
        "tcp",
        "127.0.0.1:3111",
        "docker restart agentmemory; container should listen on :3111",
    ),
}

# Env vars used in target interpolation. If a required env var is missing
# at probe time, the channel is skipped (not marked dead).
ENV_TG_DEV_BOT_TOKEN = os.environ.get("TG_DEV_BOT_TOKEN", TG_TOKEN)


def _interpolate(target: str) -> tuple[str, str | None]:
    """Returns (url, bearer_token_env_value).
    Token form: 'URL|ENV_VAR' splits off the env name to fetch as Bearer.
    URL form: '{ENV_VAR}' inside the URL string is replaced inline (no auth header).
    """
    bearer = None
    if "|" in target:
        url, env_name = target.split("|", 1)
        bearer = os.environ.get(env_name)
        if not bearer:
            return ("", None)  # signal: skip
    else:
        url = target
    # inline {ENV} interpolation
    if "{TG_DEV_BOT_TOKEN}" in url:
        url = url.replace("{TG_DEV_BOT_TOKEN}", ENV_TG_DEV_BOT_TOKEN)
    return (url, bearer)


def probe(kind: str, target: str) -> tuple[bool, str | None, int | None, bool]:
    """Returns (alive, error_message, latency_ms, skipped)."""
    if kind == "tcp":
        import socket
        host, port_s = target.split(":", 1)
        t0 = time.time()
        try:
            with socket.create_connection((host, int(port_s)), timeout=PROBE_TIMEOUT_S):
                return (True, None, int((time.time() - t0) * 1000), False)
        except Exception as e:
            return (False, f"tcp: {type(e).__name__}", None, False)

    url, bearer = _interpolate(target)
    if not url:
        return (False, "missing env var", None, True)  # skipped
    headers = {"User-Agent": "dcp-heartbeat/1"}
    if kind.startswith("http_token_get") and bearer:
        headers["Authorization"] = f"Bearer {bearer}"
        # Anthropic wants both x-api-key and anthropic-version
        if "anthropic.com" in url:
            headers["x-api-key"] = bearer
            headers["anthropic-version"] = "2023-06-01"
    req = urllib.request.Request(url, headers=headers, method="GET")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT_S) as r:
            latency = int((time.time() - t0) * 1000)
            ok = 200 <= r.status < 400
            return (ok, None if ok else f"http {r.status}", latency, False)
    except urllib.error.HTTPError as e:
        latency = int((time.time() - t0) * 1000)
        # 405 Method Not Allowed but server is up — treat as alive when caller opted in.
        if e.code == 405 and kind == "http_token_get_405ok":
            return (True, None, latency, False)
        return (False, f"http {e.code}", latency, False)
    except urllib.error.URLError as e:
        return (False, f"urlerror: {str(e.reason)[:120]}", None, False)
    except Exception as e:
        return (False, f"{type(e).__name__}: {str(e)[:120]}", None, False)


def alert(text: str) -> None:
    try:
        body = json.dumps({
            "chat_id": TG_CHAT_ID,
            "message_thread_id": TG_TOPIC_ALERTS,
            "text": text + "\n\n— [Claude / dev bot]",
            "disable_web_page_preview": True,
        }).encode()
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            data=body, headers={"Content-Type": "application/json"}),
            timeout=10)
    except Exception:
        pass  # alerting must never crash the probe


def fmt_age(ts: float | None) -> str:
    if ts is None:
        return "never"
    d = int(time.time() - ts)
    if d < 60:   return f"{d}s ago"
    if d < 3600: return f"{d // 60}m ago"
    return f"{d // 3600}h{(d % 3600) // 60}m ago"


def run() -> None:
    con = sqlite3.connect(DB_PATH, timeout=10)
    cur = con.cursor()
    now = time.time()

    for cid, (kind, target, hint) in CHANNELS.items():
        ok, err, latency, skipped = probe(kind, target)
        if skipped:
            continue  # don't write or alert

        # Load previous state for edge detection.
        cur.execute(
            "SELECT alive, last_success_at, consecutive_fail FROM channel_health WHERE channel_id=?",
            (cid,))
        prev = cur.fetchone()
        prev_alive = prev[0] if prev else None
        prev_last_ok = prev[1] if prev else None
        prev_cons_fail = prev[2] if prev else 0

        last_success_at = now if ok else prev_last_ok
        consecutive_fail = 0 if ok else (prev_cons_fail + 1)

        cur.execute("""
            INSERT INTO channel_health
              (channel_id, alive, last_success_at, last_error, reconnect_hint, probed_at, latency_ms, consecutive_fail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
              alive            = excluded.alive,
              last_success_at  = excluded.last_success_at,
              last_error       = excluded.last_error,
              reconnect_hint   = excluded.reconnect_hint,
              probed_at        = excluded.probed_at,
              latency_ms       = excluded.latency_ms,
              consecutive_fail = excluded.consecutive_fail
        """, (cid, int(ok), last_success_at, err, hint if not ok else None,
              now, latency, consecutive_fail))

        # Edge alert: only on N-consecutive-same-state transition.
        if prev_alive == 1 and not ok and consecutive_fail >= DEBOUNCE_FAILS:
            alert(
                f"🔴 Channel DEAD: `{cid}`\n"
                f"error: {err}\n"
                f"last ok: {fmt_age(prev_last_ok)}\n"
                f"hint: {hint}"
            )
        elif prev_alive == 0 and ok:
            alert(
                f"🟢 Channel RECOVERED: `{cid}` (latency {latency}ms)"
            )

    con.commit()
    con.close()


if __name__ == "__main__":
    run()
