#!/usr/bin/env python3
"""
dcp-provider-serving-watch.py

Proactive "online but NOT serving" detector for DCP providers.

A provider whose daemon heartbeats shows status=online, but if its inference
endpoint isn't reachable (endpoint_reachable=0) it can't take a single job and
earns nothing. That gap is invisible today until the provider complains
(the Fadi case, 2026-07-02: online for hours, WireGuard tunnel never up).

This watch flags that state to the 🔴 Alerts topic (4) of the DCP Nexus Group,
WITH a diagnosis of the likely cause (tunnel down / no endpoint / no models /
port), and posts a recovery notice when the provider starts serving.

Edge-triggered: one alert per provider per not-serving episode (state file),
plus a recovery notice. No spam.

Cron: */10 * * * * /usr/bin/python3 /usr/local/bin/dcp-provider-serving-watch.py
"""
import json, os, sqlite3, urllib.request, urllib.parse

DB = "/root/dc1-platform/backend/data/providers.db"
STATE_DIR = "/var/lib/dcp-monitor"
STATE_FILE = os.path.join(STATE_DIR, "serving-alerts.state")  # {provider_id: "not_serving"}

# Same bot + Alerts topic the other DCP watchdogs use (feedback_auto_alerts_topic).
TG_TOKEN = "8291599718:AAGRueItu6nK_tmjJ5kopTD7ihdBo1FatvM"
TG_CHAT = "-1003773787353"
TG_TOPIC = 4

# Exclude obvious internal / synthetic accounts so ops isn't paged for them.
TEST_EMAIL_MARKERS = ("dcp.local", "example.com", "smoke", "benchmark", "sec-audit", "test@")


def diagnose(p):
    """Return a human cause for why an online provider can't serve."""
    hs = p["wg_handshake_age_s"]
    err = (p["endpoint_probe_error"] or "").strip()
    models = (p["cached_models"] or "[]").strip()
    if hs is None:
        return "WireGuard tunnel not up (no handshake) — provider unreachable over the mesh"
    if err == "no_endpoint_url":
        return "daemon isn't reporting an inference endpoint yet (tunnel/serving not started)"
    if models in ("", "[]", "null"):
        return "no models loaded on the provider"
    if isinstance(hs, (int, float)) and hs > 180:
        return f"WireGuard handshake stale ({int(hs)}s old) — mesh link dropped"
    if err:
        return f"endpoint probe failing: {err}"
    return "endpoint not reachable (endpoint_reachable=0)"


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(s):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(s, f)
    os.replace(tmp, STATE_FILE)


def send(text):
    if os.environ.get("DRY_RUN"):
        print("[DRY_RUN would post to topic 4]:\n" + text + "\n---")
        return True
    data = urllib.parse.urlencode({
        "chat_id": TG_CHAT,
        "message_thread_id": TG_TOPIC,
        "text": text,
        "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
        return True
    except Exception as e:
        print(f"send failed: {e}")
        return False


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT id,name,gpu_model,email,status,endpoint_reachable,"
        "wg_handshake_age_s,endpoint_probe_error,cached_models "
        "FROM providers WHERE COALESCE(is_burst,0)=0 AND status='online'"
    ).fetchall()
    con.close()

    state = load_state()
    new_state = {}
    changed = False

    for r in rows:
        email = (r["email"] or "").lower()
        if any(m in email for m in TEST_EMAIL_MARKERS):
            continue
        pid = str(r["id"])
        serving = (r["endpoint_reachable"] == 1)
        prev = state.get(pid)

        if not serving:
            new_state[pid] = "not_serving"
            if prev != "not_serving":  # edge: just entered not-serving
                cause = diagnose(r)
                send(
                    "🟠 Provider ONLINE but NOT serving\n"
                    f"{r['name']} (id {pid}) — {r['gpu_model'] or 'GPU ?'}\n"
                    f"Cause: {cause}\n"
                    "Its daemon is alive but it can't take jobs, so it earns 0. "
                    "Check the provider's tunnel / setup."
                )
                changed = True
        else:
            if prev == "not_serving":  # edge: recovered
                send(
                    f"🟢 Provider now SERVING: {r['name']} (id {pid}) — "
                    f"{r['gpu_model'] or 'GPU'}. Endpoint reachable; it can take jobs."
                )
                changed = True
            # serving providers are simply dropped from state

    if changed or new_state != {k: v for k, v in state.items() if k in new_state}:
        save_state(new_state)


if __name__ == "__main__":
    main()
