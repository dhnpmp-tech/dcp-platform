# DCP Launcher (`dcp`) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `dcp` — a terminal command that opens a model/agent selector and launches Claude Code pointed at DCP's consumer-GPU inference, so a developer types `dcp` and starts coding on DCP.

**Architecture:** Two parts. (1) Backend: a NEW renter-key-gated Anthropic surface `POST /anthropic/v1/messages` on `api.dcp.sa` that serves a DCP coding model to Claude Code (the existing `/api/agent/gateway/v1/messages` for Nexus is left untouched). (2) A Node/Ink CLI published to npm that authenticates, lists live models, sets Claude Code's env vars correctly, and launches it. The make-or-break is streaming multi-step tool-calling, so we prove that end-to-end **first**.

**Tech Stack:** Node 20, Ink (React TUI), `commander` (args), `undici` (HTTP), `execa` (spawn); backend is the existing Express app (`backend/src/`), better-sqlite3, vLLM native Anthropic endpoint on a provider.

**Spec:** `docs/superpowers/specs/2026-07-02-dcp-launcher-design.md`

**Repo layout for this work:**
- Backend changes: `dc1-platform/backend/`
- CLI package: `dc1-platform/clients/dcp-cli/` (self-contained; extract to its own repo / publish as `@dcp/cli` at release).

---

## File structure

**Backend (new/changed):**
- Create `backend/src/routes/anthropic.js` — the renter `/anthropic/v1/messages` (+ `/count_tokens`) surface. One responsibility: accept Anthropic Messages requests, authenticate the renter, route to a vLLM-Anthropic provider, stream back.
- Create `backend/src/lib/anthropic-proxy.js` — pure-ish helper: given a resolved provider + Anthropic body/headers, forward to the provider's vLLM `/v1/messages` and pipe the (SSE or JSON) response. Reuses provider selection from `v1.js` patterns.
- Modify `backend/src/server.js` — mount the new router at `/anthropic` (near the `/v1` mount).
- Modify `backend/src/routes/v1.js` — add `GET /v1/coding/models` (curated coding list) next to the existing `GET /models` (line ~757); reuse `provider_engines` join + status logic.
- Create `backend/src/routes/cli-auth.js` — device-code endpoints (`POST /v1/cli/device/code`, `POST /v1/cli/device/token`).
- Create `backend/migrations/0NN_cli_device_codes.sql` — table for device-code login.

**CLI (`clients/dcp-cli/`):**
- `package.json`, `bin/dcp.js` (shebang entry), `src/cli.js` (commander wiring)
- `src/config.js` (`~/.dcp/config.json` read/write, 0600)
- `src/api.js` (DCP API client: models, balance, device-code)
- `src/auth.js` (key-paste + browser device-code flows)
- `src/adapters/claudeCode.js` (env wiring + detect + launch) ; `src/adapters/index.js` (registry incl. coming-soon stubs)
- `src/launch.js` (spawn agent, inherit env, stream stdio, exit code)
- `src/ui/App.jsx`, `src/ui/AgentPicker.jsx`, `src/ui/ModelPicker.jsx` (Ink)
- `test/` mirrors `src/`

---

# PHASE 0 — Kill the tool-calling risk first

### Task 1: Stand up the raw model+engine path (no DCP glue yet)

Prove a coding model on vLLM's native Anthropic endpoint handles streaming tool-use, BEFORE writing any proxy. If this can't be made to work, everything else is moot.

**Files:** none in-repo; ops on a provider box (Node 2 `10.8.0.6` or a fresh DCP pod).

- [ ] **Step 1:** On the provider, serve `Qwen/Qwen3-Coder-30B-A3B-Instruct` (AWQ) with vLLM's OpenAI+Anthropic server and a tool-call parser, e.g.:
  `vllm serve Qwen/Qwen3-Coder-30B-A3B-Instruct-AWQ --enable-auto-tool-choice --tool-call-parser hermes --port 8000` (confirm the installed vLLM version exposes `/v1/messages`; upgrade if not).
- [ ] **Step 2:** Verify the native Anthropic endpoint answers a **non-streaming** tool-use request:
  `curl -s localhost:8000/v1/messages -H 'content-type: application/json' -d '{"model":"...","max_tokens":256,"tools":[{"name":"read_file","description":"read","input_schema":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}],"messages":[{"role":"user","content":"read ./x"}]}'`
  Expected: a response containing a `tool_use` content block.
- [ ] **Step 3:** Verify **streaming** (`"stream":true`) emits SSE `event: content_block_start` frames including a `tool_use` block that assembles cleanly (no raw XML — the exact class of bug flagged in `vllm#31871`).
- [ ] **Step 4:** Record the working vLLM version + launch flags + model id in `docs/superpowers/plans/dcp-launcher-notes.md`. If streaming tool_use is broken on this stack, STOP and escalate (decide: pin a known-good vLLM, switch parser, or fall back to a DCP-side Anthropic↔OpenAI translation — a separate spec).
- [ ] **Step 5:** Commit the notes file.

### Task 2: Renter `/anthropic/v1/messages` — non-streaming proxy

**Files:**
- Create: `backend/src/routes/anthropic.js`
- Create: `backend/src/lib/anthropic-proxy.js`
- Modify: `backend/src/server.js` (mount `/anthropic`)
- Test: `backend/test/routes/anthropic.test.js`

- [ ] **Step 1: Write the failing test** — a renter-authed POST to `/anthropic/v1/messages` with a stub provider returns the provider's Anthropic JSON, and an unauth request returns 401.

```js
// backend/test/routes/anthropic.test.js
const request = require('supertest');
const app = require('../../src/app-for-test'); // or build an app mounting the router
test('rejects missing renter key', async () => {
  const r = await request(app).post('/anthropic/v1/messages').send({ model:'x', messages:[] });
  expect(r.status).toBe(401);
});
test('proxies to provider vLLM /v1/messages for an authed renter', async () => {
  // mock resolveCodingProvider -> a fake upstream returning {type:'message', content:[{type:'text',text:'ok'}]}
  const r = await request(app).post('/anthropic/v1/messages')
    .set('x-renter-key', TEST_RENTER_KEY)
    .send({ model: TEST_MODEL, max_tokens: 64, messages:[{role:'user',content:'hi'}] });
  expect(r.status).toBe(200);
  expect(r.body.content[0].text).toBe('ok');
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd backend && npx jest test/routes/anthropic.test.js` → FAIL (router not mounted).
- [ ] **Step 3: Implement minimal router + proxy.** In `anthropic.js`: reuse the SAME renter-auth middleware chain `/v1/chat/completions` uses (`rateLimiterMiddleware` + the renter-key resolver in `middleware/auth`; a provider key must be rejected — mirror `looksLikeProviderKey`). Resolve a provider serving the requested coding model on a vLLM engine via the existing `provider_engines` query (see `v1.js:843-1088`). Call `anthropicProxy.forward(provider, req.body, req.headers)` which POSTs to `http(s)://<provider-wg-host>:8000/v1/messages` over the mesh (same host resolution `proxyToProvider` uses, different path), and returns the JSON. Preserve `anthropic-version` + any `anthropic-beta` headers; do NOT strip them.
- [ ] **Step 4: Run it, verify PASS.**
- [ ] **Step 5: Commit** — `feat(backend): renter-gated /anthropic/v1/messages (non-streaming)`.

### Task 3: Streaming (SSE) passthrough

**Files:** Modify `anthropic.js`, `anthropic-proxy.js`; Test `backend/test/routes/anthropic.stream.test.js`

- [ ] **Step 1: Failing test** — when `body.stream===true`, the response has `content-type: text/event-stream` and forwards the provider's SSE frames byte-for-byte; assert a mocked upstream emitting two SSE frames yields both downstream.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — when `stream`, set SSE headers, `flushHeaders()`, and pipe the upstream response stream straight through (no buffering — a buffering gateway breaks Claude Code). Handle mid-stream upstream error by emitting a terminal SSE error frame and ending (mirror the pattern at `v1.js:397-406`). Ensure no `Content-Length`/compression middleware buffers this route.
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `feat(backend): SSE streaming for /anthropic/v1/messages`.

### Task 4: tool_use passthrough, count_tokens, billing hook

**Files:** Modify `anthropic.js`; Test `anthropic.tooluse.test.js`

- [ ] **Step 1: Failing tests** — (a) a request with `tools` + a `tool_result` message round-trips unchanged to the upstream; (b) `POST /anthropic/v1/messages/count_tokens` returns a token count (or 404 that Claude Code tolerates); (c) on a completed response, an inference billing/settlement record is written for the renter (reuse `inferenceTracker`/`settleInferenceOnce` used by `/v1/chat/completions`).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — pass `tools`/`tool_use`/`tool_result` through untouched; add the `/count_tokens` sub-route (proxy if upstream supports it, else return a simple estimate); wire the same per-request settlement the OpenAI path uses so renters are billed once. Enforce balance > 0 before forwarding (402 otherwise), matching `/v1/chat/completions`.
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `feat(backend): tool_use passthrough + billing + count_tokens on /anthropic`.

### Task 5: THE SHIP GATE — Claude Code end-to-end tool-use integration test

**Files:** Create `backend/test/integration/claude-code-e2e.test.js` (+ a README note that it needs a live staging endpoint + `claude` installed; runs in CI-nightly / manual, not unit CI).

- [ ] **Step 1: Write the test harness** — spawn real Claude Code (`claude -p "In /tmp/dcp-e2e, read notes.txt, append a line, then run 'ls' — use your tools"`) with env `ANTHROPIC_BASE_URL=<staging>/anthropic`, `ANTHROPIC_AUTH_TOKEN=<test renter key>`, and all three model vars (`ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`) set to the DCP coding model id. Assert: exit 0, the file was actually appended, and Claude Code performed ≥2 tool calls (read + edit/bash) without a tool-call error.
- [ ] **Step 2: Run it against staging** — Expected initially: may FAIL (this is the risk we're proving down). Iterate on Task 1–4 (parser flags, streaming, beta headers, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`) until it passes.
- [ ] **Step 3:** Once green, record the exact working config (vLLM flags + env) in the notes file. **This passing test is the gate to build the CLI.**
- [ ] **Step 4: Commit** — `test(backend): Claude Code multi-step tool-use e2e against /anthropic (ship gate)`.

---

# PHASE 1 — Supporting backend

### Task 6: `GET /v1/coding/models`

**Files:** Modify `backend/src/routes/v1.js` (add handler near line 757); Test `backend/test/routes/coding-models.test.js`

- [ ] **Step 1: Failing test** — returns `{models:[{id,label,vram_gb,price_halala_per_mtok,status:'available'|'busy'}]}`, only models on a vLLM engine that Claude Code can use, with live status from provider heartbeat/`provider_engines`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — reuse the `provider_engines` + provider-status joins already in `v1.js`; filter to a curated coding allow-list (start: the Qwen3-Coder id from Task 1); derive `status` from fresh-heartbeat + engine availability.
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `feat(backend): GET /v1/coding/models`.

### Task 7: Device-code login endpoints

**Files:** Create `backend/src/routes/cli-auth.js`, `backend/migrations/0NN_cli_device_codes.sql`; Modify `server.js`; Test `backend/test/routes/cli-auth.test.js`

- [ ] **Step 1: Failing tests** — `POST /v1/cli/device/code` returns `{device_code, user_code, verification_uri, interval, expires_in}` and persists a pending row; `POST /v1/cli/device/token` returns `authorization_pending` until approved, then returns a scoped renter key; expired codes return `expired_token`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — migration table `cli_device_codes(device_code, user_code, renter_id, status, created_at, expires_at)`; endpoints follow the OAuth device-flow shape; approval happens when the logged-in user visits `verification_uri` (a small page under the existing web app posts approval — separate small frontend task, or reuse dashboard). Issue/scope a renter key on approval (reuse renter-key issuance).
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `feat(backend): CLI device-code login endpoints`.

---

# PHASE 2 — CLI foundation

### Task 8: Scaffold `@dcp/cli`

**Files:** Create `clients/dcp-cli/package.json`, `bin/dcp.js`, `src/cli.js`; Test `clients/dcp-cli/test/cli.test.js`

- [ ] **Step 1: Failing test** — `dcp --version` prints the package version; `dcp --help` lists `login`, `logout`, `status`, `launch`.
- [ ] **Step 2: Verify fail** (`cd clients/dcp-cli && npm test`).
- [ ] **Step 3: Implement** — `package.json` with `"bin": {"dcp": "bin/dcp.js"}`, deps (ink, react, commander, undici, execa, open); `bin/dcp.js` requires `src/cli.js`; commander wires the subcommands (handlers stubbed to throw "not implemented").
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `feat(cli): scaffold @dcp/cli`.

### Task 9: Config store

**Files:** Create `src/config.js`; Test `test/config.test.js`

- [ ] TDD: `readConfig()`/`writeConfig()` on `~/.dcp/config.json`, created `0600`, round-trips `{token, baseUrl, lastAgent, lastModel}`; missing file → `{}`. Steps: failing test → fail → implement (use `os.homedir()`, `fs` with `mode:0o600`) → pass → commit `feat(cli): config store`.

### Task 10: DCP API client

**Files:** Create `src/api.js`; Test `test/api.test.js` (mock `undici`)

- [ ] TDD: `getCodingModels(baseUrl, token)`, `getBalance(...)`, `requestDeviceCode(...)`, `pollDeviceToken(...)`; sets `Authorization: Bearer <token>`; maps non-200 to typed errors (`AuthError`, `PaymentRequiredError`). Failing test → fail → implement → pass → commit `feat(cli): DCP API client`.

### Task 11: Auth — key paste

**Files:** Create `src/auth.js`; Test `test/auth.keypaste.test.js`

- [ ] TDD: `loginWithKey(key)` validates via `getBalance` then persists token to config; invalid key → `AuthError`, nothing written. Commit `feat(cli): key-paste login`.

### Task 12: Auth — browser device-code

**Files:** Modify `src/auth.js`; Test `test/auth.device.test.js`

- [ ] TDD: `loginWithBrowser()` calls `requestDeviceCode`, opens `verification_uri` (via `open`), prints the `user_code`, polls `pollDeviceToken` at `interval` until it gets a key (or times out), persists it. Mock the API + `open`. Commit `feat(cli): browser device-code login`.

---

# PHASE 3 — Configure & launch

### Task 13: ClaudeCodeAdapter (the make-it-work env wiring)

**Files:** Create `src/adapters/claudeCode.js`, `src/adapters/index.js`; Test `test/adapters/claudeCode.test.js`

- [ ] **Step 1: Failing test** — `configureEnv({modelId, token, baseUrl})` returns an env object where `ANTHROPIC_BASE_URL === baseUrl + '/anthropic'`, `ANTHROPIC_AUTH_TOKEN === token`, and **`ANTHROPIC_MODEL === ANTHROPIC_DEFAULT_HAIKU_MODEL === ANTHROPIC_DEFAULT_OPUS_MODEL === modelId`**, plus `ANTHROPIC_CUSTOM_MODEL_OPTION === modelId` and `ANTHROPIC_CUSTOM_MODEL_OPTION_NAME` set. `detectInstalled()` returns false when `claude` is absent from PATH.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — exactly that env map (this is the detail from the spec that makes it "just work"); `detectInstalled()` via `which claude`/`execa`; `installHint()` returns `npm i -g @anthropic-ai/claude-code`. Register in `adapters/index.js` with `codex`/`cursor` as `{comingSoon:true}` stubs.
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `feat(cli): ClaudeCodeAdapter env wiring`.

### Task 14: Launcher

**Files:** Create `src/launch.js`; Test `test/launch.test.js`

- [ ] TDD: `launch(agentBin, env)` spawns via `execa` with `stdio:'inherit'` and the merged env, resolves with the child's exit code; if `detectInstalled()` is false, throws `AgentNotInstalledError` carrying the install hint. Commit `feat(cli): launcher`.

### Task 15: Non-interactive `dcp launch claude --model <id>`

**Files:** Modify `src/cli.js`; Test `test/launch-cmd.test.js`

- [ ] TDD: wires config→adapter→launch without the TUI; errors clearly if not logged in / model missing / agent not installed. Commit `feat(cli): non-interactive launch`.

---

# PHASE 4 — TUI

### Task 16: Ink TUI — pickers + balance

**Files:** Create `src/ui/App.jsx`, `AgentPicker.jsx`, `ModelPicker.jsx`; Test `test/ui/App.test.jsx` (ink-testing-library)

- [ ] TDD: renders the agent row (Claude Code selectable; Codex/Cursor greyed "coming soon"), a model list with `● live / ○ busy` from `getCodingModels`, and the balance; arrow keys move selection; Enter on a live model emits `onLaunch({agent, model})`; busy models are not selectable. Commit `feat(cli): Ink TUI pickers`.

### Task 17: Wire TUI → launch, remember last pick

**Files:** Modify `src/cli.js`, `src/ui/App.jsx`; Test `test/tui-flow.test.jsx`

- [ ] TDD: bare `dcp` → if no token, run login → fetch models+balance → render App → on launch, configure + spawn Claude Code; persist `lastAgent/lastModel`; a second `dcp` preselects them. Commit `feat(cli): dcp end-to-end launch flow`.

---

# PHASE 5 — Package & distribute

### Task 18: npm packaging + README + dry-run publish

**Files:** Modify `clients/dcp-cli/package.json`; Create `clients/dcp-cli/README.md`

- [ ] TDD/checks: `files` whitelist, `engines.node>=20`, `bin` correct; `npm pack` produces a tarball that runs via `npx`; README shows the one-liner (`npx @dcp/cli` → login → pick → code) and the "already have Claude Code? you have Node" note. `npm publish --dry-run` clean. Commit `chore(cli): package + README for npm`.
- [ ] **Manual gate:** re-run Task 5's e2e once more via the *published-tarball* `dcp` (not just the endpoint) before a real `npm publish`.

---

## Sequencing & gates

1. **Phase 0 is a hard gate.** Do not start Phase 2 until Task 5 (Claude Code e2e tool-use) passes. If Task 1 shows native vLLM Anthropic streaming tool_use is unworkable on our stack, stop and write a follow-up spec for the DCP-side Anthropic↔OpenAI translation fallback (heavier, carries the `litellm#26529` id-drift risk).
2. Do **not** touch `backend/src/routes/agent-gateway.js` (`/api/agent/gateway/v1/messages`) — Nexus's brain stays provider-key-gated and separate.
3. Backend deploys follow the standard prod discipline (hot-patch + PR to main + smoke), per `docs/superpowers/specs/...` and the repo deploy rules.

## Out of scope (later)
Codex wiring (Responses API shim), Cursor wiring (public HTTPS + CORS), Go single-binary rebuild (only if Cursor/wide-distribution becomes primary), multi-model-in-one-session.
