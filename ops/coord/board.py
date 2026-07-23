#!/usr/bin/env python3
"""DCP coordination board CLI — single source of truth for Hermes/Codex/Claude work.

Usage:
  python3 ops/coord/board.py list [--status doing] [--owner claude]
  python3 ops/coord/board.py status
  python3 ops/coord/board.py add "title" [--owner codex] [--priority P1]
  python3 ops/coord/board.py claim DCP-XXX --owner claude
  python3 ops/coord/board.py set DCP-XXX --status review
  python3 ops/coord/board.py note DCP-XXX "text"
  python3 ops/coord/board.py done DCP-XXX [--note "shipped"]
  python3 ops/coord/board.py block DCP-XXX --note "waiting on tareq"
  python3 ops/coord/board.py sync-md   # rewrite BOARD.md from board.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BOARD_JSON = ROOT / "board.json"
BOARD_MD = ROOT / "BOARD.md"

OWNERS = ("codex", "claude", "hermes", "tareq", "unassigned")
STATUSES = ("backlog", "doing", "blocked", "review", "done")
PRIORITIES = ("P0", "P1", "P2", "P3")


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load() -> dict:
    if not BOARD_JSON.exists():
        data = {"version": 1, "updated_at": now_iso(), "items": []}
        save(data)
        return data
    return json.loads(BOARD_JSON.read_text(encoding="utf-8"))


def save(data: dict) -> None:
    data["updated_at"] = now_iso()
    BOARD_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_md(data)


def find_item(data: dict, item_id: str) -> dict:
    for it in data["items"]:
        if it["id"].upper() == item_id.upper():
            return it
    raise SystemExit(f"Unknown item: {item_id}")


def next_id(data: dict, prefix: str = "DCP-TASK") -> str:
    nums = []
    for it in data["items"]:
        m = re.match(rf"^{re.escape(prefix)}-(\d+)$", it["id"], re.I)
        if m:
            nums.append(int(m.group(1)))
    n = (max(nums) + 1) if nums else 1
    return f"{prefix}-{n:03d}"


def write_md(data: dict) -> None:
    lines = [
        "# DCP Coordination Board",
        "",
        f"_Auto-generated from `board.json` at {data.get('updated_at', '')}. Do not hand-edit; use `board.py`._",
        "",
        "See [ROLES.md](./ROLES.md) and [HANDOFF.md](./HANDOFF.md).",
        "",
        "| ID | Pri | Status | Owner | Title |",
        "|----|-----|--------|-------|-------|",
    ]
    order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    st_order = {"doing": 0, "blocked": 1, "review": 2, "backlog": 3, "done": 4}
    items = sorted(
        data["items"],
        key=lambda x: (st_order.get(x.get("status", "backlog"), 9), order.get(x.get("priority", "P3"), 9), x["id"]),
    )
    for it in items:
        if it.get("status") == "done":
            continue
        lines.append(
            f"| `{it['id']}` | {it.get('priority','')} | **{it.get('status','')}** | {it.get('owner','')} | {it.get('title','')} |"
        )
    lines += ["", "## Done (recent)", ""]
    done = [it for it in items if it.get("status") == "done"][-10:]
    if not done:
        lines.append("_None._")
    else:
        for it in reversed(done):
            lines.append(f"- `{it['id']}` {it.get('title','')}")
    lines += ["", "## Notes (active)", ""]
    for it in items:
        if it.get("status") == "done":
            continue
        notes = it.get("notes") or []
        if not notes:
            continue
        lines.append(f"### {it['id']}")
        for n in notes[-5:]:
            lines.append(f"- {n}")
        lines.append("")
    BOARD_MD.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def cmd_list(args: argparse.Namespace) -> None:
    data = load()
    rows = data["items"]
    if args.status:
        rows = [i for i in rows if i.get("status") == args.status]
    if args.owner:
        rows = [i for i in rows if i.get("owner") == args.owner]
    if not args.all:
        rows = [i for i in rows if i.get("status") != "done"]
    if not rows:
        print("(no items)")
        return
    for it in rows:
        print(f"{it['id']:16} {it.get('priority','?'):2} {it.get('status','?'):8} {it.get('owner','?'):10} {it.get('title','')}")


def cmd_status(_: argparse.Namespace) -> None:
    data = load()
    by = {s: [] for s in STATUSES}
    for it in data["items"]:
        by.setdefault(it.get("status", "backlog"), []).append(it)
    print(f"Board updated: {data.get('updated_at')}")
    for s in STATUSES:
        items = by.get(s) or []
        if s == "done":
            print(f"\n{s.upper()} ({len(items)} total, showing last 5)")
            for it in items[-5:]:
                print(f"  - {it['id']}: {it['title']}")
            continue
        print(f"\n{s.upper()} ({len(items)})")
        for it in items:
            print(f"  {it.get('priority','?'):2} {it['id']:16} @{it.get('owner','?'):8} {it['title']}")


def cmd_add(args: argparse.Namespace) -> None:
    data = load()
    item = {
        "id": args.id or next_id(data),
        "title": args.title,
        "owner": args.owner,
        "status": args.status,
        "priority": args.priority,
        "notes": [f"{now_iso()}: created"] + ([args.note] if args.note else []),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    data["items"].append(item)
    save(data)
    print(f"Added {item['id']} → {item['owner']} [{item['status']}]")


def cmd_claim(args: argparse.Namespace) -> None:
    data = load()
    it = find_item(data, args.id)
    it["owner"] = args.owner
    it["status"] = "doing"
    it["updated_at"] = now_iso()
    it.setdefault("notes", []).append(f"{now_iso()}: claimed by {args.owner}")
    save(data)
    print(f"{it['id']} claimed by {args.owner}")


def cmd_set(args: argparse.Namespace) -> None:
    data = load()
    it = find_item(data, args.id)
    if args.status:
        it["status"] = args.status
    if args.owner:
        it["owner"] = args.owner
    if args.priority:
        it["priority"] = args.priority
    it["updated_at"] = now_iso()
    if args.note:
        it.setdefault("notes", []).append(f"{now_iso()}: {args.note}")
    save(data)
    print(f"{it['id']} → status={it['status']} owner={it['owner']} pri={it['priority']}")


def cmd_note(args: argparse.Namespace) -> None:
    data = load()
    it = find_item(data, args.id)
    it.setdefault("notes", []).append(f"{now_iso()}: {args.text}")
    it["updated_at"] = now_iso()
    save(data)
    print(f"Noted on {it['id']}")


def cmd_done(args: argparse.Namespace) -> None:
    data = load()
    it = find_item(data, args.id)
    it["status"] = "done"
    it["updated_at"] = now_iso()
    note = args.note or "marked done"
    it.setdefault("notes", []).append(f"{now_iso()}: {note}")
    save(data)
    print(f"{it['id']} done")


def cmd_block(args: argparse.Namespace) -> None:
    data = load()
    it = find_item(data, args.id)
    it["status"] = "blocked"
    it["updated_at"] = now_iso()
    it.setdefault("notes", []).append(f"{now_iso()}: BLOCKED — {args.note}")
    save(data)
    print(f"{it['id']} blocked")


def cmd_sync_md(_: argparse.Namespace) -> None:
    data = load()
    write_md(data)
    print(f"Wrote {BOARD_MD}")


def main() -> None:
    p = argparse.ArgumentParser(description="DCP coordination board")
    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("list", help="List items")
    pl.add_argument("--status", choices=STATUSES)
    pl.add_argument("--owner", choices=OWNERS)
    pl.add_argument("--all", action="store_true", help="Include done")
    pl.set_defaults(func=cmd_list)

    ps = sub.add_parser("status", help="Summary by status")
    ps.set_defaults(func=cmd_status)

    pa = sub.add_parser("add", help="Add item")
    pa.add_argument("title")
    pa.add_argument("--id")
    pa.add_argument("--owner", default="unassigned", choices=OWNERS)
    pa.add_argument("--status", default="backlog", choices=STATUSES)
    pa.add_argument("--priority", default="P2", choices=PRIORITIES)
    pa.add_argument("--note")
    pa.set_defaults(func=cmd_add)

    pc = sub.add_parser("claim", help="Claim item (sets doing)")
    pc.add_argument("id")
    pc.add_argument("--owner", required=True, choices=OWNERS)
    pc.set_defaults(func=cmd_claim)

    pset = sub.add_parser("set", help="Set fields")
    pset.add_argument("id")
    pset.add_argument("--status", choices=STATUSES)
    pset.add_argument("--owner", choices=OWNERS)
    pset.add_argument("--priority", choices=PRIORITIES)
    pset.add_argument("--note")
    pset.set_defaults(func=cmd_set)

    pn = sub.add_parser("note", help="Append note")
    pn.add_argument("id")
    pn.add_argument("text")
    pn.set_defaults(func=cmd_note)

    pd = sub.add_parser("done", help="Mark done")
    pd.add_argument("id")
    pd.add_argument("--note")
    pd.set_defaults(func=cmd_done)

    pb = sub.add_parser("block", help="Mark blocked")
    pb.add_argument("id")
    pb.add_argument("--note", required=True)
    pb.set_defaults(func=cmd_block)

    psy = sub.add_parser("sync-md", help="Regenerate BOARD.md")
    psy.set_defaults(func=cmd_sync_md)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
