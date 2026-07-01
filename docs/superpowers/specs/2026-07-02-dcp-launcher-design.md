# DCP Launcher (`dcp`) — Design Spec

- **Date:** 2026-07-02
- **Status:** Draft for review
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

- Codex and Cursor wiring (stubbed as "coming soon").
- Managing DCP pods/volumes (that stays on the separate `dcp pod` surface).
- A desktop/GUI app (Tauri) — terminal TUI only.
- Bring-your-own / arbitrary models — curated coding models only in v1.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Interface | Terminal TUI (Ink) | Lives where the coding CLIs already run; works over SSH; fastest to build. |
| Stack | Node CLI on npm (`npx dcp` / `npm i -g @dcp/cli`) | v1's only wired agent (Claude Code) is itself a Node CLI, so the audience always has Node; reuses DCP's JS stack (backend + `dcp-mcp`). **Revisit a single Go binary (Bubble Tea) if/when Cursor — an Electron app whose users may lack Node — becomes a first-class target.** |
| Auth | Browser device-code login (`dcp login`) + API-key paste fallback | Best UX with a headless/CI escape hatch. Token in `~/.dcp/config.json` (0600). |
| Interaction model | `dcp` configures **and** launches | Run it each time to start coding; remembers last pick for a one-keypress repeat. `dcp launch claude --model <id>` is the non-interactive escape hatch. |
| v1 agent | Claude Code fully wired; Codex/Cursor stubbed | Claude Code is the easy, high-quality win (vLLM native Anthropic endpoint). |

## Architecture / components

1. **CLI shell (`dcp`)** — command parsing (`dcp`, `dcp login`, `dcp logout`, `dcp launch <agent>`, `dcp status`) + Ink TUI rendering.
2. **Auth module** — device-code browser flow + key-paste; persists token to `~/.dcp/config.json` (0600).
3. **DCP API client** — thin HTTP to `api.dcp.sa`: list coding models + live status, get balance, validate the renter key.
4. **Agent adapters** — one per agent, common interface `{ detectInstalled(), configureEnv(model, token), launch() }`:
   - `ClaudeCodeAdapter` (**v1**): sets `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN=<dcp key>`, model env vars (main + small/fast model); spawns `claude`. If `claude` is missing → offer `npm i -g @anthropic-ai/claude-code`.
   - `CodexAdapter` (**v1.1 stub**): will write `~/.codex/config.toml` with a custom provider + `wire_api = "responses"`.
   - `CursorAdapter` (**v1.2 stub**): documents the public-HTTPS + CORS + chat/plan-only constraints.
5. **Launcher** — spawns the agent process with the configured env, streams stdio, exits with its code.
6. **Config store** — `~/.dcp/config.json`: token, last agent, last model, base URL.

## Data flow (happy path)

```
dcp → load config
    → (no token?) dcp login (browser device-code, or paste key)
    → GET /v1/coding/models  + GET /v1/balance
    → Ink TUI: pick agent + model
    → ClaudeCodeAdapter.configureEnv(model, token) + launch()
    → `claude` runs against DCP
```

## Backend additions (small; the serving surface already exists)

- `GET /v1/coding/models` — curated coding models with live `available|busy` status, VRAM, and price (derive from the existing model registry + provider status).
- Device-code login endpoints (`POST /v1/cli/device/code`, poll `/v1/cli/device/token`) — or reuse existing renter-key issuance. The key-paste path needs **no** new backend.
- Confirm the Anthropic-compatible serving surface (already exposed by the gateway) handles Claude Code's streaming + tool calls end-to-end.

## The critical risk + its test

Claude Code's **streaming, multi-step tool-calling** must work against DCP's vLLM + Qwen stack. The research flagged upstream streaming/tool-parser bugs (`vllm#31871`, `litellm#26529`) — real, but **not proven on our exact RTX-class + Qwen stack** (that specific claim was refuted). **Mitigation / gate:** an integration test that launches Claude Code against a DCP endpoint and runs a real multi-step tool-use task (read a file, edit it, run a command) and asserts the tool calls complete. This is the make-or-break gate for shipping v1.

## Error handling

- Not logged in → prompt `dcp login`.
- Zero/low balance → show balance, link to top-up, block launch.
- Agent not installed → offer to install it.
- All models busy → show live status, offer wait/retry.
- Endpoint unreachable → clear error + status link.

## Testing

- **Unit:** adapters (env/config correctness), API client, config store.
- **TUI:** Ink component snapshot/interaction tests.
- **Integration (the gate):** real Claude Code launch against DCP running a multi-step tool-use task.

## Open questions

1. Exact Anthropic base-URL path DCP exposes (host + `/v1/messages`) — confirm against the live gateway.
2. Ship key-paste first and add the browser device-code flow in v1.0.1, or both in v1.0?
3. Model-id scheme Claude Code expects — it may pin `claude-*` ids, needing a display-name → served-model mapping.

## Competitor pattern being copied

DeepInfra / OpenRouter: a dead-simple "point your coding agent here" experience, per-token shared inference (not hourly). `dcp` is the one-command version of that.
