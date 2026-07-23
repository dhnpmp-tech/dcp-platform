# DCP Coordination

**Problem:** Codex owns the repo, Claude owns the VPS, Hermes glues Telegram — no shared board, Paperclip never bootstrapped, old agent swarm is dead.

**Solution:** This directory is the single source of truth.

| File | Purpose |
|------|---------|
| [ROLES.md](./ROLES.md) | Who owns what |
| [HANDOFF.md](./HANDOFF.md) | How to pass work |
| [board.json](./board.json) | Machine-readable board |
| [BOARD.md](./BOARD.md) | Human-readable board (auto) |
| [board.py](./board.py) | CLI |

## Quick start

```bash
cd ~/dc1-platform   # or /root/dc1-platform on VPS after pull
python3 ops/coord/board.py status
python3 ops/coord/board.py list --owner claude
python3 ops/coord/board.py claim DCP-NODE2-480 --owner claude
python3 ops/coord/board.py note DCP-NODE2-480 "daemon_version=4.8.0 confirmed"
python3 ops/coord/board.py done DCP-NODE2-480 --note "verified via admin API"
```

## Rules (short)

1. No work without a board item + owner.
2. Codex = git/PR. Claude = VPS. Hermes = assign/report. Tareq = approve/deploy.
3. Merge ≠ deploy.
4. Paperclip is frozen until Tareq decides bootstrap or kill.
