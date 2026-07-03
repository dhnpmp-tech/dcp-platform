#!/usr/bin/env python3
"""
dcp-vram-parking-watch.py — v2

Detector for PARKED GPU memory on DCP provider nodes (a process holding
VRAM while computing nothing — the Node-2 / 2026-07-03 vLLM incident).

v2 additions (Tito post-incident recs #4/#5, Nexus-refined):
  - PARTIAL parking tier: 40-80% VRAM at ~0% util for 2h+ — forgotten test
    instances that will eventually grow. Softer alert, longer window.
  - Exception register: /var/lib/dcp-monitor/vram-exceptions.json
      {"<provider_id>": {"until": <epoch>, "note": "registered experiment"}}
    Registered, time-boxed experiments are skipped until expiry.
  - Deterministic diagnosis: daemon >=4.7.0 heartbeats carry
    gpu_status.foreign_gpu_procs — the alert then NAMES the process
    (engine, pid, MiB) instead of guessing.

Edge-triggered per provider per episode; recovery notice on clear.
Cron: */10 * * * * /usr/bin/python3 /usr/local/bin/dcp-vram-parking-watch.py
"""
import json, os, sqlite3, time, urllib.request, urllib.parse

DB = "/root/dc1-platform/backend/data/providers.db"
STATE_DIR = "/var/lib/dcp-monitor"
STATE_FILE = os.path.join(STATE_DIR, "vram-parking.state")
EXCEPTIONS_FILE = os.path.join(STATE_DIR, "vram-exceptions.json")

TG_TOKEN = "8291599718:AAGRueItu6nK_tmjJ5kopTD7ihdBo1FatvM"
TG_CHAT = "-1003773787353"
TG_TOPIC = 4

FULL_PCT, FULL_SUSTAIN = 0.80, 30 * 60
PARTIAL_PCT, PARTIAL_SUSTAIN = 0.40, 2 * 3600
UTIL_MAX = 5
HEARTBEAT_FRESH_SECONDS = 20 * 60


def tg(text):
    data = urllib.parse.urlencode({
        "chat_id": TG_CHAT, "message_thread_id": TG_TOPIC,
        "text": text, "disable_web_page_preview": "true",
    }).encode()
    urllib.request.urlopen(
        "https://api.telegram.org/bot%s/sendMessage" % TG_TOKEN, data=data, timeout=15)


def diagnose(g):
    """One line naming the culprit from foreign_gpu_procs (daemon >=4.7.0),
    or a generic hint for older daemons."""
    procs = g.get("foreign_gpu_procs") or []
    bare = [p for p in procs if not p.get("pod_managed")]
    if bare:
        worst = max(bare, key=lambda p: p.get("used_mib", 0))
        eng = worst.get("engine") or "unknown process"
        return ("Cause (from daemon scan): %s pid %s holding %s MiB outside any pod. "
                "Fix on the node: python3 ~/.dcp/dcp_daemon.py --clean"
                % (eng, worst.get("pid"), worst.get("used_mib", 0)))
    return ("Likely an inference server left running outside the daemon "
            "(vLLM preallocates ~all VRAM). Fix on the node: identify via "
            "nvidia-smi, stop it (e.g. pkill -f vllm).")


def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    state = {}
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            state = json.load(f)
    exceptions = {}
    if os.path.exists(EXCEPTIONS_FILE):
        try:
            with open(EXCEPTIONS_FILE) as f:
                exceptions = json.load(f)
        except ValueError:
            exceptions = {}

    now = time.time()
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT id, name, gpu_status, strftime('%s', updated_at) "
        "FROM providers WHERE status='online'"
    ).fetchall()
    # v2.1: providers currently serving a PAID pod are healthy by definition —
    # a renter parking VRAM inside their own pod is the product working, not
    # an incident (learned 2026-07-03 when Tareq's pod re-occupied Node 2
    # minutes after the tier-3 eviction freed it).
    pod_active = {str(r[0]) for r in con.execute(
        "SELECT DISTINCT provider_id FROM jobs WHERE job_type='interactive_pod' "
        "AND status IN ('running','pulling','assigned','provisioning','queued','pending')"
    ).fetchall()}
    con.close()

    seen = set()
    for pid, name, gpu_status, hb_ts in rows:
        try:
            g = json.loads(gpu_status or "{}")
        except ValueError:
            continue
        total = g.get("gpu_vram_mib") or g.get("vram_mb") or 0
        used = g.get("memory_used_mb")
        if used is None and g.get("free_vram_mib") is not None and total:
            used = total - g["free_vram_mib"]
        util = g.get("gpu_util_pct")
        if not total or used is None or util is None:
            continue
        if hb_ts and (now - int(hb_ts)) > HEARTBEAT_FRESH_SECONDS:
            continue
        key = str(pid)

        exc = exceptions.get(key)
        if exc and now < float(exc.get("until", 0)):
            continue  # registered, time-boxed experiment — respected

        pct = used / total
        tier = None
        if key not in pod_active and util <= UTIL_MAX:
            if pct > FULL_PCT:
                tier = "full"
            elif pct > PARTIAL_PCT:
                tier = "partial"

        if tier:
            seen.add(key)
            ep = state.get(key) or {"since": now, "alerted": False, "tier": tier}
            if ep.get("tier") != "full":
                ep["tier"] = tier
            state[key] = ep
            sustain = FULL_SUSTAIN if ep["tier"] == "full" else PARTIAL_SUSTAIN
            if not ep["alerted"] and (now - ep["since"]) >= sustain:
                mins = int((now - ep["since"]) / 60)
                head = "\U0001F534 VRAM PARKED" if ep["tier"] == "full" else "\U0001F7E1 VRAM partially parked"
                tg(
                    "%s on %s\n%.0f/%.0f MiB used (%.0f%%) at %s%% GPU util for >=%d min.\n%s\n— dcp-vram-parking-watch v2"
                    % (head, name or pid, used, total, pct * 100, util, mins, diagnose(g))
                )
                ep["alerted"] = True
        else:
            ep = state.pop(key, None)
            if ep and ep.get("alerted"):
                tg(
                    "✅ VRAM recovered on %s: %.0f/%.0f MiB used (%.0f%%), util %s%%. "
                    "Pod launches should work again.\n— dcp-vram-parking-watch v2"
                    % (name or pid, used, total, pct * 100, util)
                )

    for key in list(state.keys()):
        if key not in seen:
            state.pop(key, None)

    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


if __name__ == "__main__":
    main()
