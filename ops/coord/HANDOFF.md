# DCP Handoff Protocol

## When handing off

Write a board note (or Telegram message) with:

```
HANDOFF → <codex|claude|hermes|tareq>
ITEM: <id>
DONE:
- bullet of what landed (paths, PR #, commit, VPS command)
NEXT:
- single next action for the receiver
BLOCKED:
- none | reason + who unblocks
VERIFY:
- exact command or check
```

## Definition of done by lane

| Owner | Done means |
|-------|------------|
| Codex | PR open (or merged if approved), CI status noted, board → `review` or `done` |
| Claude | VPS change executed + verified (command output), board note with evidence |
| Hermes | Board updated, owner assigned, human notified if blocked |
| Tareq | Decision recorded on board (`approve` / `reject` / `defer`) |

## Anti-patterns (ban these)

- Two agents "looking at" the same bug without a claim
- "Someone should deploy" with no owner
- Codex rewriting VPS state while Claude is mid-incident
- Claude opening parallel branches that collide with Codex PRs
- Hermes declaring complete without board update
- Depending on Paperclip until bootstrap is an explicit P0 item owned by Tareq

## Daily cadence (lightweight)

1. Hermes: `python3 ops/coord/board.py status` → post P0/P1 to Telegram if anything moved
2. Codex: pull claimed `codex` items only
3. Claude: pull claimed `claude` items only
4. End of session: every `doing` item gets a note or is moved to `blocked`/`review`/`done`
