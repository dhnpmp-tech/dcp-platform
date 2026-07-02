# @dcp/cli — `dcp`

Launch your coding agent on [DCP](https://dcp.sa) consumer-GPU inference with one command.

```bash
npx @dcp/cli          # or: npm install -g @dcp/cli
```

## Quick start

```bash
dcp login             # browser sign-in (or: dcp login --key <your dcp-renter key>)
dcp                   # interactive picker: agent + model + balance → Launch
```

That's it — `dcp` configures and launches **Claude Code** pointed at DCP's
Anthropic-compatible endpoint (`api.dcp.sa/anthropic`), billed per-token from
your DCP balance. Already have Claude Code installed? Then you already have
Node, and `npx @dcp/cli` just works.

## Commands

| Command | What it does |
|---|---|
| `dcp` | Interactive picker (agents, live model availability, balance) → launch |
| `dcp login [--key <key>]` | Browser device-code sign-in, or paste an API key (headless/CI) |
| `dcp launch claude --model <id>` | Non-interactive launch (scripts, muscle memory) |
| `dcp status` | Who you are, balance, API base, last-used model |
| `dcp logout` | Clear the stored token (keeps preferences) |

`dcp` remembers your last agent + model, so the second run is just **Enter**.

## Agents

- **Claude Code** — fully supported today.
- **Codex / Cursor** — coming soon (visible in the picker).

## How it works

`dcp launch claude` sets the environment Claude Code needs —
`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and the model pins
(`ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`,
`ANTHROPIC_DEFAULT_OPUS_MODEL` — all to your chosen DCP model) — then execs
`claude` with your terminal attached. No config files are edited; nothing
persists into your shell.

Config lives at `~/.dcp/config.json` (0600). Override the API base with
`baseUrl` in that file, or the config location with `DCP_CONFIG_DIR`.

## Requirements

Node 20+. For launching: Claude Code (`npm install -g @anthropic-ai/claude-code`) —
`dcp` will tell you if it's missing.
