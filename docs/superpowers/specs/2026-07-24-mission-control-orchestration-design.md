# Mission Control Agent Orchestration — Design Spec

**Date:** 2026-07-24
**Author:** Peter + Claude (lead orchestrator)
**Status:** Approved design, pending implementation plan

## 1. Problem & Goals

Multiple AI coding agents (Codex, Claude workers, Cursor sessions, Nexus, Tito — Grok
or others later) currently coordinate through the DCP Nexus Group Telegram chat.
Chat-based coordination is lossy, unauditable, and race-prone ("bot kindergarten").

Goals:

1. Mission Control (the existing self-hosted task system in `dc1-platform`) becomes
   the **single source of truth** for agent work. HTTP pull is the canonical path.
2. Telegram is demoted to a **write-only notification channel** (digest, assignment
   pings, escalations). Nothing reads commands from chat.
3. **Role split:** Peter + Claude decide high-level items (goals, task creation,
   priorities, review gates). A mechanical dispatcher daemon ("Nexus janitor")
   handles polling hygiene: stale leases, escalations, digests, notifications —
   zero LLM judgment.
4. Structural guarantees against agent chaos: per-agent identity, atomic task
   claiming with leases, scoped write permissions, and a review ladder enforced
   by GitHub branch protection.

Non-goals: replacing Mission Control with an external tracker; agent-to-agent chat;
Paperclip as a work tracker (it only syncs runtime/budget/heartbeat data in);
provider daemons coordinating product work (they only feed liveness data).

## 2. Current State (verified in code)

- Backend `backend/src/routes/mission.js` (~994 lines) already provides: task CRUD
  with filters, comments with `source`/`kind` provenance, reassign, goals,
  milestones, `/overview`, `/on-me/:assignee_id`, `/pulse`, `/digest` (agent-friendly
  markdown), `/fleet`, `/repos`, `/pr-state`, `/me` credential resolution.
- Tables: `mission_assignees` (kind: human|agent), `mission_goals`,
  `mission_milestones`, `mission_tasks`, `mission_task_comments`. Single SQLite store.
- Auth today: admin token, or ONE shared `MISSION_AGENT_KEY` env var
  (`x-mission-agent-key` header), or provider key. No per-agent identity.
- Admin panel (`app/(site)/admin/page.tsx`) renders the task board
  (todo → in_progress → blocked → review → done, priorities p0–p3).
- Telegram: `@dcp_dev_bot` exists with known chat/topic IDs
  (topic 4 = Alerts, topic 7 = Team Chat).

### Gaps this design closes

1. No per-agent identity/audit/revocation (single shared key).
2. No atomic claim: `PATCH /tasks/:id` is a blind update; claim races possible.
3. No dispatcher: nothing schedules digests, expires stale work, or notifies.
4. No Telegram bridge from Mission Control events.
5. No code-authority model binding tasks to PR review/merge rights.

## 3. Architecture Overview

All inside `dc1-platform`, same SQLite store, no new services except one pm2 process:

```
Agents (Codex / Claude worker / Cursor CLI / Nexus agent / Tito runner)
   │  HTTP pull: poll → claim → comment → PR → review
   ▼
/api/mission (extended: agent keys, claim/lease, heartbeat)
   ▲                              │
   │ admin UI (Agents strip)      │ events (polling updated_at)
   │                              ▼
Peter + Claude              Dispatcher daemon (pm2, VPS)
(goals, tasks,              mechanical rules only
 priorities, review)              │ write-only
                                  ▼
                            Telegram @dcp_dev_bot
                            (topic 7 digest/pings, topic 4 escalations)
```

## 4. Data Model Changes

New table:

```sql
CREATE TABLE mission_agent_keys (
  id           TEXT PRIMARY KEY,           -- key_<nanoid>
  assignee_id  TEXT NOT NULL REFERENCES mission_assignees(id),
  key_hash     TEXT NOT NULL,              -- sha256 of the raw key
  label        TEXT,                       -- "codex-cloud", "cursor-peter-mbp"
  scopes       TEXT NOT NULL DEFAULT 'agent', -- 'agent' | 'dispatcher' (admin = env token, not a key scope)
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
```

`mission_tasks` gains (via ALTER TABLE, following the existing migration pattern in
`db.js`): `claimed_by TEXT`, `claimed_at TEXT`, `lease_expires_at TEXT`, and
`tier TEXT DEFAULT 'standard'` (low | standard | critical — drives the review ladder).

`mission_assignees` gains: `last_seen_at TEXT`, `heartbeat_state TEXT`.

Seed `mission_assignees` rows (kind=agent): `codex`, `claude`, `cursor`, `nexus`,
`tito`. Adding an agent later = one row + one key, no code change.

## 5. API Changes (`backend/src/routes/mission.js`)

**Auth.** `x-mission-agent-key` is now looked up (SHA-256 hash, timing-safe) in
`mission_agent_keys`; on match, `req.missionAgent = { assignee_id, scopes }` and
`last_used_at` is stamped. The legacy shared `MISSION_AGENT_KEY` env keeps working
until rollout step 6, then is removed. `/me` resolves agent keys to their assignee.

**New endpoints:**

- `POST /tasks/:id/claim` — atomic compare-and-swap in a single SQL UPDATE:
  succeeds only if (`status='todo'` AND (`assignee_id` IS NULL OR = caller)) OR
  (`status IN ('in_progress','blocked')` AND `lease_expires_at` < now). The lease
  is cleared on the `→ review` transition, so tasks in `review` are never
  CAS-claimable. Sets `status='in_progress'`, `claimed_by`,
  `claimed_at`, `lease_expires_at = now + TTL` (default 4h, cap 24h via
  `?ttl_minutes=`). Race loser gets `409 { error: 'claimed' }`. Auto-comments
  "claimed by <agent>".
  **Pool semantics:** `assignee=pool` in `GET /tasks` is a query alias for
  `assignee_id IS NULL` — there is NO `pool` row in `mission_assignees`. Pooled
  work is simply unassigned `todo` tasks, claimable by any agent via the CAS above.
- `POST /tasks/:id/renew` — extends lease; only `claimed_by` may call; 409 otherwise.
- `POST /tasks/:id/release` — returns task to `todo`, clears lease, requires a
  `reason` which is stored as a comment.
- `POST /heartbeat` — updates caller's `last_seen_at` / `heartbeat_state`.
- `GET /protocol` — serves `docs/orchestration/AGENT_PROTOCOL.md` so agents self-brief.

**Scope enforcement (anti-kindergarten, structural):** three scopes:

- `agent` (Codex, Claude worker, Cursor, Nexus agent, Tito): may claim/renew/release
  tasks, comment, PATCH status of tasks they hold (`in_progress → review | blocked`,
  and back `blocked → in_progress` on their own claimed task), and update
  `source_url` on their own tasks. May NOT create/delete tasks, touch
  goals/milestones, reassign, mutate others' tasks, or set `done`/`cancelled`.
- `dispatcher` (the daemon's key, exactly two extra rights): create provider-repair
  tasks — enforced at the API level by requiring a non-null `external_id` on
  dispatcher-scoped `POST /tasks` (rejected otherwise) — and reset expired leases
  on any task (`in_progress → todo` when `lease_expires_at < now` — nothing else;
  the reset auto-comments "lease expired (was <agent>)" server-side, the same way
  claim auto-comments, so the dispatcher needs no separate comment right).
- admin auth (Peter + Claude): everything, including task creation/prioritization,
  `done`/`cancelled` (both admin-only, treated identically by scope rules), and key
  issuance/revocation (`POST/DELETE /agent-keys`).

Existing mission rate limiter extends to the new endpoints.

## 6. Dispatcher Daemon (`orchestration/dispatcher/`)

Node script, pm2-managed on the VPS beside the backend, timer loop (every 5 min).
Purely mechanical rules, no LLM calls:

1. **Lease expiry:** `lease_expires_at < now` on `in_progress` → back to `todo`,
   clear lease, comment "lease expired (was <agent>)", notify topic 7.
2. **Escalation:** `blocked` > 24h, or `p0` in `todo` untouched > 4h → topic 4 alert
   (deduped: one alert per task per 24h).
3. **Morning digest:** 08:00 Asia/Dubai, fetch `GET /digest`, post to topic 7.
4. **Assignment pings:** poll `updated_at`; on new assignment → "task <id> assigned
   to <agent>" in topic 7. Humans get pinged; agents discover via their own polling
   (the ping is for human visibility, not agent command).
5. **Provider-repair tasks:** from provider liveness data (existing backend APIs),
   auto-create tasks deduped by `external_id` (e.g. `provider-down-<id>`).

State (last-seen cursor, dedup ledger) in a small JSON file or SQLite table.
Failure mode: dispatcher down ⇒ notifications pause, but the task system remains
fully functional — agents still poll/claim/work via the API. Nothing depends on the
dispatcher for correctness, only for hygiene.

Note on naming: the dispatcher is the "Nexus janitor" role. Nexus-the-LLM-agent
separately polls for tasks assigned to `nexus` like any other agent.

## 7. Telegram Bridge

Inside the dispatcher, using the existing `@dcp_dev_bot` token. **Write-only**:
the bridge never reads chat messages, never accepts commands. Topic 7 (Team Chat):
digest + assignment pings. Topic 4 (Alerts): escalations. Message format links back
to the Mission Control UI (`/admin`) task anchor.

## 8. Agent Protocol (`docs/orchestration/AGENT_PROTOCOL.md`)

Rules every agent gets (also via `GET /api/mission/protocol`):

1. Poll `GET /tasks?assignee=<me>&status=todo,in_progress` (plus the pooled queue:
   `assignee=pool`). Never act on work not claimed.
2. Claim before working; renew while working; release with reason if abandoning.
3. All coordination via task comments — never contact another agent directly.
4. Comment at meaningful checkpoints (started, key finding, PR opened, blocked).
5. Branch naming `agent/<name>/<task-id>-<slug>`; link PR via `source_url`.
6. Finish = move to `review`. Only Peter/Claude move tasks to `done`.
7. Telegram is not a command channel; never parse or respond to chat.

Plus a ~100-line `mission-agent` CLI helper (curl wrapper: `poll | claim | comment |
renew | release | review`) checked into `scripts/`, for Cursor sessions and any
local runner; token from `MISSION_AGENT_KEY` env in the local shell.

## 9. Code Authority Model

**Principle: agents propose, Claude reviews, Peter merges.** Enforced by GitHub,
not by agent goodwill.

- Branch protection on `main`: PRs only, required review, green CI — applies to
  everyone including Claude. Each agent commits under its own identity (Codex's
  GitHub identity; others via machine users or commit trailers) so blame always
  resolves to agent + task.
- Review ladder, driven by the task's `tier` field and enforced via CODEOWNERS on
  critical paths:

| Tier | Examples | Required to merge |
|---|---|---|
| low | docs, tests, comments, non-prod scripts | Claude approval |
| standard | features, fixes, refactors | Claude review + Tareq merge |
| critical | auth, billing, provider daemons, migrations, deploy scripts, `security/` | Claude + security pass + Tareq merge |

*(Amended 2026-07-25: Tareq — GitHub `HaakBank` — is the final merge approver;
Peter retains org ownership, admin rights, and the emergency lane.)*

- Claude is mandatory first reviewer on every agent PR; verdict posted as a task
  comment (APPROVE / CHANGES + severity). Tito provides advisory verification for
  benchmark/QA claims before Claude signs off; no agent approves in GitHub's sense.
- Merge = deploy (Vercel auto-deploys `main`; VPS backend via `safe-reload.sh`),
  so merge rights are deploy rights. `review → done` only after merge AND deploy
  evidence (Vercel URL / reload log) is posted to the task.
- Emergency lane: Peter may hotfix directly with a post-hoc task documenting it.
- Tareq (`HaakBank`): final merge approver on standard/critical tiers.
  Fadi: Mission Control viewer + Telegram consumer; no code authority.
- Note for planning: branch protection, CODEOWNERS, and machine-user setup are
  GitHub configuration, not repo code — treat as a checklist task, not a code phase.

## 10. Admin UI Addition

One addition to the existing Mission Control board in `app/(site)/admin/page.tsx`:
an **Agents strip** — per agent: last heartbeat (relative), current claim (task
link), key status (active/revoked). Read-only except admin key issue/revoke actions.
Follows the existing admin panel patterns; no new page.

## 11. Security

- Keys: 32-byte random, shown once at issuance, stored SHA-256 hashed, timing-safe
  compare, revocable per key, `last_used_at` audit.
- Scoped writes as per §5; agents cannot expand their own scope.
- Rate limiting on all new endpoints via the existing mission limiter.
- No secrets in the protocol doc or task comments (protocol rule + review check).
- Dispatcher holds only: its `dispatcher`-scoped mission key (see §5 — NOT admin),
  and the Telegram bot token — via env on the VPS, not in the repo.

## 12. Error Handling

- Claim race → 409, agent picks the next task. Lease expiry recovers crashed agents.
- Dispatcher crash → pm2 restart; correctness unaffected (see §6 failure mode).
- Telegram API failure → log and continue; never blocks task operations.
- Legacy shared key remains valid until explicitly retired (rollout step 6),
  so nothing breaks mid-migration.

## 13. Testing

Follow existing `backend/src/__tests__` patterns:

- Claim CAS: two concurrent claims → exactly one 200, one 409.
- Lease expiry + reclaim by another agent (fake clock).
- Scope enforcement: agent key cannot create/delete/`done`/`cancelled`/touch
  others' tasks; dispatcher key cannot POST a task without `external_id`.
- Auth resolution: `/me` for agent keys; revoked key → 401; legacy key still works.
- Dispatcher rules unit-tested with injected clock + mocked Telegram sender.
- E2E happy path: seed task → claim → comment → review → (admin) done.

## 14. Rollout

1. Schema + auth + claim/heartbeat endpoints; deploy (legacy key still valid).
2. Seed agent assignees; issue per-agent keys.
3. Dispatcher on pm2 in log-only mode (no Telegram) for one day; verify decisions.
4. Enable Telegram bridge.
5. Onboard agents one at a time, Codex first; verify each does one full
   claim → PR → review cycle cleanly.
6. Retire shared `MISSION_AGENT_KEY`; branch protection + CODEOWNERS live.
