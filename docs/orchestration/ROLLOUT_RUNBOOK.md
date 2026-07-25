# Mission Control Orchestration — Rollout Runbook

Companion to the design spec
(`docs/superpowers/specs/2026-07-24-mission-control-orchestration-design.md`)
and `AGENT_PROTOCOL.md`. Six steps, in order; each is safe to pause on.

## Step 1 — Deploy the backend

Merge `feat/mission-orchestration` → `main`, then deploy via the established
`safe-reload.sh` flow. This step changes nothing for existing callers: the
legacy shared `MISSION_AGENT_KEY` still authenticates, the admin UI board is
unchanged (plus the new Agents strip), and no dispatcher is running yet.

Verify:

```bash
curl -s https://api.dcp.sa/api/mission/protocol -H "x-mission-agent-key: $MISSION_AGENT_KEY" | head -5
# → markdown, HTTP 200
```

## Step 2 — Seed the roster and issue keys

On the VPS:

```bash
cd /root/dc1-platform/backend
node scripts/mission-seed-agents.js --issue-keys
```

Prints 6 assignees (codex, claude, cursor, nexus, tito, dispatcher) and one raw
key each — **shown once, only hashes are stored.** Distribute immediately:

| Key | Goes to | Where it lives |
| --- | --- | --- |
| codex | Codex sessions/automation | Codex env (`MISSION_AGENT_KEY`) |
| claude | Claude Code worker sessions | Peter's shell env / session config |
| cursor | Cursor helper CLI | Local shell env on the dev machine |
| nexus | Nexus agent runtime | Nexus agent server env |
| tito | Tito runner | Tito's host env |
| dispatcher | The pm2 daemon ONLY | VPS env as `MISSION_DISPATCHER_KEY` |

Revoke/re-issue anytime: `POST/DELETE /api/mission/agent-keys` (admin) or the
Agents strip. A revoked key fails with 401 immediately.

## Step 3 — Dispatcher in dry-run (one day)

```bash
export MISSION_DISPATCHER_KEY=<dispatcher key from step 2>
pm2 start backend/ecosystem.dispatcher.config.js   # DISPATCHER_DRY_RUN=1 default
pm2 logs dc1-mission-dispatcher
```

Review a day of `[dry-run] would ...` lines. Expect: no reset_lease (nothing
claimed yet), possibly create_repair_task lines mirroring real provider
outages, one digest line after 08:00 Dubai. Anything surprising → fix before
step 4.

## Step 4 — Enable Telegram + go live

```bash
# VPS env: DCP_TG_BOT_TOKEN, DCP_TG_CHAT_ID (+ topic overrides if needed)
DISPATCHER_DRY_RUN=0 pm2 restart dc1-mission-dispatcher --update-env
```

Verify: digest arrives in Team Chat (topic 7) next morning; escalations go to
Alerts (topic 4). The bridge is structurally write-only — it cannot read chat.

## Step 5 — Onboard agents one at a time

Order: start with ONE agent (whichever is kept — the system is roster-agnostic),
verify a full clean cycle, then add the next.

Per-agent onboarding check (all via their own key):

1. `scripts/mission-agent protocol` (or GET /protocol) — agent reads the rules.
2. Admin creates a small real task, assigns it to the agent.
3. Agent: `poll → claim → comment "started" → work → PATCH status=review +
   source_url=<PR>` (CLI: `mission-agent review <id> --pr <url>`).
4. Human verifies: comments attributed, lease handled, PR linked, task in
   `review`, assignment ping arrived in Telegram.
5. Admin merges/reviews and sets `done`.

Only after a clean cycle does the agent get pool access (i.e., you start
leaving unassigned tasks for it).

## Step 6 — Retire the legacy key + GitHub governance

**Legacy key:** remove `MISSION_AGENT_KEY` from the VPS env and reload the
backend. From then on only per-agent keys authenticate agent traffic
(admin/renter/provider auth unaffected). Grep CI/scripts for stragglers first.

**GitHub configuration (checklist — config, not code):**

- [ ] Grant Tareq (`HaakBank`) repo admin — requires an org owner of
      `dhnpmp-tech` (Peter's account; recovery email likely dhnpmp@gmail.com).
      Tareq is the final merge approver (spec §9, amended 2026-07-25).
- [ ] Branch protection on `main`: require PR, ≥1 required review, required
      status checks (backend tests), no force pushes. Applies to admins.
- [ ] CODEOWNERS covering critical paths (tier `critical` in the spec §9):
      `backend/src/routes/`, `backend/src/db.js`, `backend/src/middleware/`,
      `security/`, deploy scripts, `backend/ecosystem*.config.js` → `@HaakBank`
      (+ Peter's account once recovered).
- [ ] Per-agent commit identity: Codex uses its GitHub identity; other agents
      use machine users or `Co-Authored-By` trailers so blame → agent + task.
- [ ] Branch naming convention enforced socially (protocol rule 5):
      `agent/<name>/<task-id>-<slug>`.
- [ ] Review ladder documented in PR template: low = Claude approval,
      standard/critical = Tareq merges (spec §9 table, amended 2026-07-25).

## Operational notes

- **Dispatcher down** = notifications pause; the task system keeps working.
  pm2 restarts it; state file (`backend/data/mission-dispatcher-state.json`)
  is a dedup ledger — deleting it risks duplicate pings, nothing worse.
- **Stuck task** (agent died mid-claim): wait for lease expiry (default 4h) —
  the dispatcher resets it — or admin-PATCH it back to `todo` immediately.
- **Rotate a key**: DELETE the old one (instant 401), POST a new one, update
  the one env location from the table above.
- **Add an agent**: one `mission_assignees` row + one key (`POST /agent-keys`
  or extend the seed script's ROSTER). No code changes.
