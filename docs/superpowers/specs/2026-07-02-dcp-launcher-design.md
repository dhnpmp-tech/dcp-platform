# DCP Launcher (`dcp`) — Design Spec

- **Date:** 2026-07-02
- **Status:** Approved (decisions locked with Peter)
- **Author:** Claude (with Peter)

## Summary

A `dcp` command-line launcher that lets a developer point their existing coding CLI at DCP's consumer-GPU inference in one step. Run `dcp` → an interactive terminal UI → pick agent + model (with live availability + balance) → it configures the agent's environment and launches it against DCP. The promise: **type `dcp`, it just works.**

v1 fully wires **Claude Code**. Codex and Cursor appear in the picker as "coming soon" and land in v1.1 / v1.2.

## Goals

- Zero-to-coding in one command for someone who already uses Claude Code.
- Native-feeling: lives in the terminal, no context switch.
- Live model selection from DCP's *actual* available GPUs, with balance visible.
- Reliably "just works" — the user never hand-edits env vars or config files.

## Non-goals (v1 / YAGNI)

- Codex and Cursor *wiring* (stubbed as "coming soon"; the picker shows them).
- Managing DCP pods/volumes (that stays on the separate `dcp pod` surface).
- A desktop/GUI app (Tauri) — terminal TUI only.
- Bring-your-own / arbitrary models — curated coding models only in v1.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Interface | Terminal TUI (Ink) | Lives where the coding CLIs already run; works over SSH; fastest to build. |
| Stack | Node CLI on npm (`npx dcp` / `npm i -g @dcp/cli`) | v1's only wired agent (Claude Code) is itself a Node CLI, so the audience always has Node; reuses DCP's JS stack (backend + `dcp-mcp`). **Trigger to switch to a single Go binary (Bubble Tea): when Cursor — an Electron app whose users may lack Node — becomes a first-class target.** |
| Auth | **Both, up front:** browser device-code login (`dcp login`) **and** API-key paste | Peter's call (2026-07-02): build both in v1.0, not key-first. Token in `~/.dcp/config.json` (0600). |
| Interaction model | `dcp` configures **and** launches | Run it each time to start coding; remembers last pick for a one-keypress repeat. `dcp launch claude --model <id>` is the non-interactive escape hatch. |
| v1 agent | Claude Code fully wired; Codex/Cursor stubbed | Claude Code is the easy, high-quality win. |

## Architecture / components

1. **CLI shell (`dcp`)** — command parsing (`dcp`, `dcp login`, `dcp logout`, `dcp launch <agent>`, `dcp status`) + Ink TUI.
2. **Auth module** — device-code browser flow **and** key-paste; persists token to `~/.dcp/config.json` (0600).
3. **DCP API client** — thin HTTP to `api.dcp.sa`: list coding models + live status, get balance, validate the renter key.
4. **Agent adapters** — one per agent, common interface `{ detectInstalled(), configureEnv(model, token), launch() }`:
   - `ClaudeCodeAdapter` (**v1**) — see "Claude Code wiring" below.
   - `CodexAdapter` (**v1.1 stub**) — will write `~/.codex/config.toml` with a custom provider + `wire_api = "responses"`.
   - `CursorAdapter` (**v1.2 stub**) — documents the public-HTTPS + CORS + chat/plan-only constraints.
5. **Launcher** — spawns the agent process with the configured env, streams stdio, exits with its code.
6. **Config store** — `~/.dcp/config.json`: token, last agent, last model, base URL.

## Claude Code wiring (v1) — the make-it-work detail

Verified against Claude Code docs (`code.claude.com/docs/en/model-config`, `.../llm-gateway-protocol`) 2026-07-02:

- Claude Code **does not require `claude-*` model ids** — with `ANTHROPIC_BASE_URL` set, it passes an arbitrary model id straight through (validation is explicitly skipped for `ANTHROPIC_CUSTOM_MODEL_OPTION`).
- **Critical:** Claude Code calls *different* models for different jobs — the main model, a "haiku" model for background tasks + token counting, and an "opus" model for plan-mode fallback. If DCP serves a single model, the adapter **must set all three to the same DCP model id**, or background tasks crash:

  ```bash
  ANTHROPIC_BASE_URL=https://api.dcp.sa/anthropic        # DCP renter-facing Anthropic surface (see backend work)
  ANTHROPIC_AUTH_TOKEN=<dcp renter key>
  ANTHROPIC_MODEL=<dcp served id, e.g. qwen3-coder-30b>
  ANTHROPIC_DEFAULT_HAIKU_MODEL=<same id>                # background + count_tokens (ANTHROPIC_SMALL_FAST_MODEL is deprecated)
  ANTHROPIC_DEFAULT_OPUS_MODEL=<same id>                 # plan-mode fallback
  ANTHROPIC_CUSTOM_MODEL_OPTION=<same id>                # shows in /model picker (skips validation)
  ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="<friendly label>"
  ```

- **Gotchas the endpoint must honor:** stream via SSE (a buffering gateway breaks Claude Code); accept/return `tool_use`/`tool_result` blocks; don't strip `anthropic-beta` headers (consume or ignore silently); `/v1/messages/count_tokens` is optional (Claude estimates locally if absent). If the model lacks strict tool schemas, set `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`.

## Data flow (happy path)

```
dcp → load config
    → (no token?) dcp login (browser device-code, or paste key)
    → GET /v1/coding/models  + GET /v1/balance
    → Ink TUI: pick agent + model
    → ClaudeCodeAdapter.configureEnv(model, token) sets the 6 env vars + launch()
    → `claude` runs against DCP
```

## Backend work required (v1)

**This is the core enabling work — larger than a footnote.**

1. **Renter-facing Anthropic surface** — `POST https://api.dcp.sa/anthropic/v1/messages` (+ optional `/count_tokens`), authenticated by renter key like `/v1/chat/completions`, that serves the renter's chosen provider-GPU coding model. Today's `/api/agent/gateway/v1/messages` is provider-key-gated and targets Nexus/brain upstreams (minimax/anthropic) — **not** renter provider inference — so this endpoint is new. Preferred implementation: **proxy to the provider's vLLM native Anthropic endpoint** (`:8000/v1/messages`); avoid Anthropic→OpenAI translation shims where possible (research flagged tool-call id-drift bugs in that path). Must support streaming + `tool_use`.
2. **`GET /v1/coding/models`** — curated coding models with live `available|busy` status, VRAM, price (derive from the model registry + provider status).
3. **Device-code login endpoints** — `POST /v1/cli/device/code`, poll `/v1/cli/device/token` (issues/scopes a renter key). Key-paste path needs no new backend.

## The critical risk + its test

Claude Code's **streaming, multi-step tool-calling** must work against DCP's vLLM + Qwen stack. Research flagged upstream streaming/tool-parser bugs (`vllm#31871`, `litellm#26529`) — real, but **not proven on our exact stack** (that specific claim was refuted). **Gate:** an integration test that launches Claude Code against the DCP Anthropic endpoint and runs a real multi-step tool-use task (read a file, edit it, run a command) and asserts the tool calls complete. Ship v1 only when this passes.

## Error handling

- Not logged in → prompt `dcp login`.
- Zero/low balance → show balance, link to top-up, block launch.
- Agent not installed → offer to install it (`npm i -g @anthropic-ai/claude-code`).
- All models busy → show live status, offer wait/retry.
- Endpoint unreachable → clear error + status link.

## Testing

- **Unit:** adapters (all 6 env vars set correctly), API client, config store, both auth flows.
- **TUI:** Ink component snapshot/interaction tests.
- **Integration (the gate):** real Claude Code launch against DCP running a multi-step tool-use task.

## Competitor pattern being copied

DeepInfra / OpenRouter: a dead-simple "point your coding agent here" experience, per-token shared inference (not hourly). `dcp` is the one-command version of that.
