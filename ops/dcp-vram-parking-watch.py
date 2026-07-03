#!/usr/bin/env python3
"""
dcp-vram-parking-watch.py

Detector for PARKED GPU memory on DCP provider nodes: a process holding most
of the VRAM while computing nothing. Signature (the Node-2 / Jul-3 incident:
a vLLM left running after Phase-0 tests): used/total > 80%, gpu_util ~0%,
sustained > 30 min. Every pod launch on such a node fails honestly with
"Insufficient VRAM" — this watch surfaces the cause BEFORE a renter hits it.

Edge-triggered like its siblings: one alert per provider per episode to the
Alerts topic (4), plus a recovery notice. State in /var/lib/dcp-monitor.

Cron: */10 * * * * /usr/bin/python3 /usr/local/bin/dcp-vram-parking-watch.py
"""
import json, os, sqlite3, time, urllib.request, urllib.parse

DB = "/root/dc1-platform/backend/data/providers.db"
STATE_DIR = "/var/lib/dcp-monitor"
STATE_FILE = os.path.join(STATE_DIR, "vram-parking.state")  # {pid: {"since": ts, "alerted": bool}}

TG_TOKEN = "8291599718:AAGRueItu6nK_tmjJ5kopTD7ihdBo1FatvM"
TG_CHAT = "-1003773787353"
TG_TOPIC = 4

USED_PCT_THRESHOLD = 0.80
UTIL_PCT_THRESHOLD = 5
SUSTAIN_SECONDS = 30 * 60
HEARTBEAT_FRESH_SECONDS = 20 * 60  # ignore stale heartbeats — offline is another watcher's job

def tg(text):
    data = urllib.parse.urlencode({
        "chat_id": TG_CHAT, "message_thread_id": TG_TOPIC,
        "text": text, "disable_web_page_preview": "true",
    }).encode()
    urllib.request.urlopen(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data, timeout=15)

def main():
    os.makedirs(STATE_DIR, exist_ok=True)
    state = {}
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            state = json.load(f)

    now = time.time()
    con = sqlite3.connect(DB)
    rows = con.execute(
        "SELECT id, name, gpu_status, strftime('%s', updated_at) FROM providers WHERE status='online'"
    ).fetchall()
    con.close()

    seen_parked = set()
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
        pct = used / total
        key = str(pid)

        if pct > USED_PCT_THRESHOLD and util <= UTIL_PCT_THRESHOLD:
            seen_parked.add(key)
            ep = state.get(key) or {"since": now, "alerted": False}
            state.setdefault(key, ep)
            if not ep["alerted"] and (now - ep["since"]) >= SUSTAIN_SECONDS:
                mins = int((now - ep["since"]) / 60)
                tg(
                    f"\U0001F534 VRAM PARKED on {name or pid}\n"
                    f"{used:.0f}/{total:.0f} MiB used ({pct:.0%}) at {util}% GPU util "
                    f"for ≥{mins} min.\n"
                    f"A process is holding VRAM while computing nothing — pod launches "
                    f"on this node will fail with Insufficient VRAM.\n"
                    f"Likely cause: an inference server (vLLM preallocates ~all VRAM) left "
                    f"running outside the daemon. Fix on the node: identify via "
                    f"nvidia-smi, stop it (e.g. pkill -f vllm).\n"
                    f"— dcp-vram-parking-watch"
                )
                ep["alerted"] = True
        else:
            ep = state.pop(key, None)
            if ep and ep.get("alerted"):
                tg(
                    f"✅ VRAM recovered on {name or pid}: "
                    f"{used:.0f}/{total:.0f} MiB used ({pct:.0%}), util {util}%. "
                    f"Pod launches should work again.\n— dcp-vram-parking-watch"
                )

    # prune state entries for providers no longer parked/online
    for key in list(state.keys()):
        if key not in seen_parked:
            state.pop(key, None)

    with open(STATE_FILE, "w") as f:
        json.dump(state, f)

if __name__ == "__main__":
    main()
