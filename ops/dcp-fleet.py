#!/usr/bin/env python3
"""dcp-fleet — agent/CLI-readable DCP fleet truth.

Reports EARNED state (real probes), never the spoofable heartbeat. Any agent
(or human) can read this; it's the machine twin of the /admin/fleet screen.

Usage:
  dcp-fleet.py            # JSON to stdout (default; for agents)
  dcp-fleet.py --human    # compact human table

Env:
  DCP_MONITOR_RENTER_KEY   active renter key (enables the real inference probe)
  DCP_API                  default https://api.dcp.sa
  DCP_VPS                  e.g. root@76.54... — if set, adds WireGuard mesh truth via ssh
  NODE2_WG_PEER            Node 2's WG pubkey (default known)

Exit code: 0 if DCP can serve inference right now, 1 if not (so CI/loops can gate).
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

API = os.environ.get("DCP_API", "https://api.dcp.sa").rstrip("/")
KEY = os.environ.get("DCP_MONITOR_RENTER_KEY", "")
VPS = os.environ.get("DCP_VPS", "")
NODE2_PEER = os.environ.get("NODE2_WG_PEER", "vHFwGo4EvyQ8AFrC04YYQBRQYjk7iDH8hc22yon/PhM=")


def _get(path, timeout=8):
    try:
        with urllib.request.urlopen(f"{API}{path}", timeout=timeout) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")
    except Exception as e:
        return 0, str(e)


def probe_inference(model):
    """Fire one real completion. The single most honest 'are we serving' signal."""
    if not model:
        return {"ok": False, "reason": "no_capacity", "http": None, "latency_ms": None, "model": None}
    if not KEY:
        return {"ok": False, "reason": "no_renter_key", "http": None, "latency_ms": None, "model": model}
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": "ping"}],
                       "max_tokens": 4, "temperature": 0, "stream": False}).encode()
    req = urllib.request.Request(f"{API}/v1/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            ms = int((time.time() - t0) * 1000)
            ok = r.status == 200 and '"choices"' in txt
            return {"ok": ok, "reason": "served" if ok else "no_completion", "http": r.status, "latency_ms": ms, "model": model}
    except urllib.error.HTTPError as e:
        return {"ok": False, "reason": f"http_{e.code}", "http": e.code, "latency_ms": int((time.time() - t0) * 1000), "model": model,
                "body": e.read().decode(errors="replace")[:200]}
    except Exception as e:
        return {"ok": False, "reason": f"error:{type(e).__name__}", "http": None, "latency_ms": None, "model": model}


def mesh_truth():
    """WireGuard handshake age per peer (kernel truth) — only if DCP_VPS + ssh available."""
    if not VPS:
        return None
    try:
        out = subprocess.run(["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", VPS,
                              "wg show wg0 latest-handshakes 2>/dev/null; echo ---; date +%s"],
                             capture_output=True, text=True, timeout=20).stdout
        body, _, now_s = out.partition("---")
        now = int(now_s.strip() or "0")
        peers = []
        for line in body.strip().splitlines():
            parts = line.split()
            if len(parts) == 2:
                hs = int(parts[1])
                peers.append({"peer": parts[0][:16] + "…", "handshake_age_s": (now - hs) if hs else None,
                              "is_node2": parts[0] == NODE2_PEER})
        return peers
    except Exception as e:
        return [{"error": str(e)}]


def main():
    hs, health = _get("/api/health")
    _, detailed = _get("/api/health/detailed")
    _, models_raw = _get("/v1/models")
    H = json.loads(health) if health.startswith("{") else {}
    D = json.loads(detailed) if detailed.startswith("{") else {}
    M = json.loads(models_raw) if models_raw.startswith("{") else {}
    served = [m.get("id") for m in M.get("data", []) if (m.get("provider_count") or 0) > 0]

    infer = probe_inference(served[0] if served else None)
    mesh = mesh_truth()

    metering = (D.get("metering") or {})
    snap = {
        "ts": int(time.time()),
        "api_up": hs == 200 and H.get("status") == "ok",
        "db": H.get("db"),
        "serving_now": infer["ok"],                       # ← the earned verdict agents should read
        "inference_probe": infer,
        "served_models_count": len(served),
        "served_models": served,
        "catalog_count": len(M.get("data", [])),
        "providers_claimed": H.get("providers"),          # heartbeat-based; spoofable until earned-online ships
        "jobs": H.get("jobs"),
        "metering_last_token_at": metering.get("last_token_record_at"),
        "metering_tokens_24h": metering.get("total_tokens_24h"),
        "mesh_wireguard": mesh,
        "note": "serving_now = a real /v1 completion just succeeded. providers_claimed is heartbeat-based "
                "(spoofable) until earned-online verification ships. mesh_wireguard requires DCP_VPS+ssh.",
    }

    if "--human" in sys.argv:
        v = "🟢 SERVING" if snap["serving_now"] else "🔴 NOT SERVING"
        print(f"DCP fleet @ {time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime(snap['ts']))}")
        print(f"  {v}  (probe: {infer['reason']}, model={infer['model']}, http={infer['http']}, {infer['latency_ms']}ms)")
        print(f"  api_up={snap['api_up']} db={snap['db']}  served_models={snap['served_models_count']}/{snap['catalog_count']}")
        print(f"  providers(claimed)={snap['providers_claimed']}  jobs={snap['jobs']}")
        print(f"  metering last token: {snap['metering_last_token_at']} (24h tokens: {snap['metering_tokens_24h']})")
        if mesh:
            for p in mesh:
                tag = " [NODE 2]" if p.get("is_node2") else ""
                print(f"  wg {p.get('peer')}{tag}: handshake {p.get('handshake_age_s')}s ago")
    else:
        print(json.dumps(snap, indent=2))

    sys.exit(0 if snap["serving_now"] else 1)


if __name__ == "__main__":
    main()
