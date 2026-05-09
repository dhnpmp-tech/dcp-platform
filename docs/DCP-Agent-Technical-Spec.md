# DCP Agent — Technical Specification

**Version:** 0.2.0
**Date:** 2026-05-09
**Authors:** Peter, Tareq (concept), Claude Code (implementation notes)

---

## What changed since v0.1.0 (2026-05-05 → 2026-05-09)

This revision captures the auth + onboarding fixes that came out of Tareq
and Fadi's real-world provider onboarding sessions, plus a first-class
answer to "is the agent ready for Linux?".

| Area | v0.1.0 | v0.2.0 |
|---|---|---|
| Provider sign-in | Email + 6-digit OTP code, hardcoded Supabase backend | **Magic-link only** (GitHub/Anthropic style) — single click in email, no codes anywhere in the user-visible flow. Self-hosted on SQLite + Resend, no Supabase. |
| One email = one role | Hard 409 block (`cross_role_email_conflict`) | **Soft / dual-role allowed** — same email can hold both a provider and a renter row. We log the cross-role state for visibility only. |
| OTP rate limit | 5 / 15 min per IP | 10 / 15 min per IP — onboarding-friendly, still abuse-proof. |
| Heartbeat misdiagnosis | `curl GET /api/providers/heartbeat` returned a bare 404, looked like an outage | Docblock now explicitly states POST-only, with a working probe command. |
| Model catalog for providers | Implicit, scattered across research notes | **`docs/PROVIDER-MODEL-CATALOG.md`** — single source of truth for valid Ollama tags. Surfaced to Nexus + DCP Agent assistants so they stop suggesting non-existent tags like `qwen3:35b`. |
| Linux deployment | Implied via Hermes; not validated | Section **"Linux readiness"** added below with what works today vs what's gated. |

Full operator-facing changelog: see `docs/CHANGELOG-2026-05-09-Auth-Onboarding.md`.

---

## Vision

Replace the current Python daemon script with an autonomous AI agent that runs on every provider's machine. The agent handles everything: installation, configuration, GPU monitoring, network setup, self-healing, and inference management. Providers grant permissions once at startup, then the agent operates autonomously.

The agent is also a gift to the provider — a free AI assistant running on their PC that they can use for other purposes, powered by DCP's intelligence infrastructure.

## Branding

**Name:** DCP Agent (powered by Hermes)
**Approach:** Fork Hermes Agent from Nous Research, rebrand UI/CLI to DCP, add DCP-specific skills and tools, route all LLM traffic through api.dcp.sa.

## Architecture

```
Provider PC                        DCP Backend                    Brain
┌──────────────────┐   WebSocket   ┌─────────────────────┐  API  ┌──────────────┐
│ DCP Agent        │◄─────────────►│ api.dcp.sa          │──────►│ Minimax API  │
│ (Hermes fork)    │               │ /api/agent/gateway  │      │ or Claude API│
│                  │               │                     │      │ or Local LLM │
│ ┌──────────────┐ │               │ ┌─────────────────┐ │      └──────────────┘
│ │ DCP Skills   │ │               │ │ Gateway Proxy   │ │
│ │ - GPU monitor│ │               │ │ - Log all calls │ │
│ │ - WG setup   │ │               │ │ - Nexus inject  │ │
│ │ - Ollama mgr │ │               │ │ - Rate limit    │ │
│ │ - Self-heal  │ │               │ │ - Memory store  │ │
│ │ - Inference  │ │               │ │ - Admin override│ │
│ └──────────────┘ │               │ └─────────────────┘ │
│                  │               │                     │
│ ┌──────────────┐ │               │ ┌─────────────────┐ │
│ │ Hermes Core  │ │               │ │ Nexus (OpenClaw)│ │
│ │ - 40+ tools  │ │               │ │ - Can intervene │ │
│ │ - Memory     │ │               │ │ - Guidance      │ │
│ │ - Skills     │ │               │ │ - Fleet mgmt    │ │
│ │ - Cron       │ │               │ └─────────────────┘ │
│ └──────────────┘ │               └─────────────────────┘
│                  │
│ ┌──────────────┐ │
│ │ GUI (Tauri)  │ │
│ │ - Dashboard  │ │
│ │ - Chat       │ │
│ │ - Settings   │ │
│ └──────────────┘ │
└──────────────────┘
```

## Core Design Decisions

### 1. All traffic routes through api.dcp.sa
Every LLM call from the agent goes through our backend gateway. Never direct to Minimax/Claude. This gives us:
- Full visibility into what every agent is doing
- Ability for Nexus to intercept and provide guidance
- Rate limiting and cost control
- Logging for training data
- Admin override capability

### 2. Brain is swappable
```
interface AgentBrain {
  think(context: SystemState, task: string): Promise<AgentAction[]>;
}

Today:     Minimax API (via api.dcp.sa proxy)
Tomorrow:  Claude API (via api.dcp.sa proxy)
Future:    Own model running on DCP's own inference hardware
```

The provider's agent uses whatever brain we configure on the backend. They don't need to know or care which model is behind it.

### 3. Permission model — one-time grant
At first startup, the agent requests:
- Shell/command execution access
- File system read/write
- Network configuration (WireGuard, firewall)
- GPU access (nvidia-smi, process management)
- System service management (systemd/launchd/Windows services)

Provider clicks "Allow All" once. After that, the agent operates autonomously. No repeated permission prompts.

### 4. Self-healing and monitoring
The agent continuously monitors:
- GPU utilization, temperature, VRAM usage, power draw
- RAM and disk space
- Network connectivity (WG tunnel, latency to VPS, bandwidth)
- Inference engine health (Ollama/MLX/llama.cpp process)
- Daemon process status
- Model availability and integrity

When something breaks, the agent:
1. Diagnoses the issue (reads logs, checks processes, tests connectivity)
2. Attempts to fix it (restart service, reconfigure, re-download)
3. Reports to backend what it found and what it did
4. If it can't fix it, escalates to Nexus/admin with full diagnostics

### 5. Persistent memory + skill learning
From Hermes Agent:
- Memory persists across sessions (survives reboots)
- Agent auto-creates "skills" from successful complex tasks
- Next time the same issue occurs, it uses the learned skill directly
- Memory syncs to DCP backend for fleet-wide learning

## Why Hermes Agent

| Requirement | Hermes | Open Interpreter | Claude Code | OpenClaw |
|-------------|--------|------------------|-------------|----------|
| Minimax support | Yes (explicit) | Via LiteLLM | No (Claude only) | Yes |
| Persistent memory | Yes + auto-skills | No | File-based | Yes |
| Self-improving | Yes | No | No | Via extensions |
| 40+ built-in tools | Yes | ~10 | ~8 | ~20 |
| Telegram gateway | Yes | No | No | Yes |
| Background/cron | Yes | FastAPI server | No | Yes |
| Lightweight | $5 VPS capable | Moderate | Heavy | Moderate |
| Permission workflow | Yes | Basic y/n | Per-tool | Custom |
| Multiple LLM backends | 200+ via OpenRouter | Via LiteLLM | Claude only | Any |
| Terminal backends | 6 (local, Docker, SSH) | Local only | Local only | Local + Docker |
| Open source | Yes (Nous Research) | Yes | Yes (MIT) | Yes |

## DCP-Specific Skills to Build

### Skill: GPU Setup
```
Trigger: First startup or GPU change detected
Actions:
  1. Detect GPU (nvidia-smi / Apple Silicon / AMD)
  2. Verify driver version
  3. Install/update driver if needed
  4. Report GPU specs to backend
```

### Skill: Model Management
```
Trigger: Backend assigns model or provider requests change
Actions:
  1. Check available VRAM
  2. Select optimal quantization (Q4/Q8/FP16)
  3. Download model (with progress reporting)
  4. Verify integrity (SHA256)
  5. Start inference engine
  6. Health-check endpoint
```

### Skill: Network Setup
```
Trigger: First startup or connectivity lost
Actions:
  1. Install WireGuard
  2. Generate keypair
  3. Register with api.dcp.sa/api/providers/wg/register
  4. Write config
  5. Activate tunnel
  6. Test connectivity (ping VPS, curl health endpoint)
  7. Set up persistent tunnel (launchd/systemd/Windows service)
```

### Skill: Self-Heal
```
Trigger: Continuous monitoring detects issue
Actions:
  1. Inference engine down → restart, check logs, report
  2. WG tunnel dropped → reactivate, test
  3. Model corrupted → re-download, verify
  4. Disk full → clean old models/logs, alert provider
  5. GPU overheating → throttle inference, warn provider
  6. Daemon crash → read last 50 log lines, diagnose, fix, restart
```

### Skill: Remote Diagnostics
```
Trigger: Admin/Nexus requests diagnostic
Actions:
  1. Collect system state (GPU, RAM, disk, network, processes)
  2. Read recent logs (daemon, inference engine, WG)
  3. Run connectivity tests
  4. Package into structured report
  5. Upload to backend
```

### Skill: Provider Chat
```
Trigger: Provider types in GUI chat
Actions:
  1. Answer questions about earnings, status, GPU
  2. Explain why they're not getting jobs
  3. Help with configuration changes
  4. Translate technical issues to plain language
  5. Available in EN + AR
```

## Implementation Plan

### Phase 1: Fork + Rebrand (1 week)
- Fork Hermes Agent repository
- Rebrand: "DCP Agent powered by Hermes"
- Configure default LLM backend to route through api.dcp.sa
- Strip unnecessary features (Discord/Slack gateways — keep Telegram)
- Add DCP branding to CLI and any UI elements
- Test basic agent loop works with Minimax via our proxy

### Phase 2: Backend Gateway (1 week)
- Build api.dcp.sa/api/agent/gateway
- WebSocket endpoint for persistent connection
- Proxy LLM calls to Minimax API
- Log all agent actions (tool calls + results)
- Nexus intervention hooks (inject system messages)
- Admin dashboard: view what each agent is doing in real-time
- Rate limiting per provider

### Phase 3: DCP Skills (2 weeks)
- GPU Setup skill
- Model Management skill
- Network Setup skill (WireGuard)
- Self-Heal skill
- Remote Diagnostics skill
- Provider Chat skill
- Test on Windows (Fadi's use case) and Mac

### Phase 4: Integration with Tauri App (1 week)
- Embed agent into existing Tauri desktop app
- Agent manages the install wizard (replaces scripted steps)
- GUI chat interface in dashboard
- Agent replaces daemon's monitoring functions
- Permission grant flow in installer

### Phase 5: Own Model Training (future)
- Collect all agent actions from fleet
- Fine-tune small model (Qwen 7B or similar) on successful actions
- Run on provider's own GPU (meta — GPU manages itself)
- Falls back to cloud API for complex/novel situations

---

## Linux readiness (Tareq's question — 2026-05-09)

Tareq is on Ubuntu 22.04 with an RTX 3090 and asked whether DCP Agent can
be deployed to Linux today. Short answer: **yes for headless, not yet for
the GUI build**. Detail:

| Capability | Linux today? | Notes |
|---|---|---|
| Hermes runtime (the brain) | ✅ Ready | Hermes is Linux-native; runs as a Python process, no platform-specific code. |
| Backend gateway (`/api/agent/gateway`) | ✅ Ready (Phase 2 lands first on the VPS) | Same gateway serves all OSes. |
| CLI / headless mode | ✅ Ready | Run as a systemd unit on the provider's box. Works on Ubuntu 20.04+ / Debian 11+ / Fedora 38+. |
| Ollama integration | ✅ Ready | Ollama installs cleanly on Linux via the official one-liner. Use the catalog in `docs/PROVIDER-MODEL-CATALOG.md`. |
| WireGuard skill | ✅ Ready | `wg-quick` is the reference implementation; cleaner on Linux than on macOS or Windows. |
| GPU monitoring (nvidia-smi) | ✅ Ready | Same nvidia-smi parsing path as the Python daemon. |
| Self-heal / cron | ✅ Ready | systemd timers preferred over cron for reliability. |
| **Tauri desktop GUI build (.deb / AppImage)** | ⏸️ **Not yet** | Current Tauri pipeline ships `aarch64.dmg` + `x64.exe` only. Adding a Linux target is an afternoon of CI work but not done. |
| Permissions UX | ⏸️ Partial | One-time grant flow assumes a desktop install. Headless deployments need a config-file equivalent of "Allow All". |
| Auto-update | ⏸️ Partial | `apt`/`.deb` channel not yet provisioned. Manual `git pull` + restart works for early adopters like Tareq. |

**Recommended path for Tareq specifically (2026-05-09):**
1. Install Ollama + pull a Day-1 model (`qwen3:8b`) — see the model catalog.
2. Run the existing Python daemon (`dc1-daemon.py`) under systemd; it
   already heartbeats and earns. The agent can move in over the top later.
3. When Phase 1 lands (target: 2026-05-16), Tareq becomes our first Linux
   beta — he runs the headless agent CLI alongside the daemon, and we
   collect Linux-specific edge cases before opening the .deb channel.

**Gated on:** Phase 1 fork-and-rebrand merge + a CI job to produce a
`linux-x86_64` artifact (no GUI required for Tareq's box).

## Current LLM API Keys Available

| Provider | Key type | Status |
|----------|----------|--------|
| Claude (Anthropic) | Cloud subscription (Claude Code) | Active — no API key, subscription-based |
| Minimax | API key | Active — available for agent brain |
| OpenRouter | API key | Active — 200+ models |

## Data Flow Example: Fadi's Stuck Download

**Without agent (what happened):**
1. Fadi downloads installer
2. Wizard starts model download
3. Download hangs at 1 Mbps — no progress shown
4. Fadi waits 1 hour, gives up
5. We have zero visibility
6. Takes 2 days to diagnose

**With DCP Agent (what would happen):**
1. Agent detects slow download (< 2 MB/s for 30s)
2. Agent reports to backend: "Model download slow, 0.9 Mbps, ETA 67 min"
3. Agent tells provider via GUI: "Your download is slow. Expected time: ~60 minutes. Your internet speed to our server is 0.9 Mbps."
4. Agent tries alternative: smaller model, different CDN, resume capability
5. If download completes, agent verifies and starts inference
6. If it fails, agent reports full diagnostics to backend
7. Nexus sees the issue in real-time, can intervene: "Try qwen3:4b instead, it's smaller"

## Security Considerations

- Agent only executes within granted permissions
- All LLM traffic visible to DCP backend
- No direct internet access for the brain (proxied through api.dcp.sa)
- Agent actions logged with timestamps for audit
- Kill switch: backend can disable any agent remotely
- Sandbox mode: agent can run in Docker container instead of bare metal
- Provider can revoke permissions at any time through GUI

## Relationship to Existing Components

| Component | Current | With Agent |
|-----------|---------|------------|
| Daemon (dcp_daemon.py) | 8000-line Python script | Agent skill — managed by DCP Agent |
| Installer (Tauri wizard) | Scripted steps | Agent-driven — handles all steps dynamically |
| WireGuard setup | Hardcoded in lib.rs | Agent skill — diagnoses and fixes issues |
| Model download | Ollama pull / HF download | Agent skill — picks best model, monitors progress |
| Error handling | Log + hope | Agent diagnoses, fixes, reports |
| Provider support | "Contact support" | Agent answers questions directly |
| Monitoring | Daemon heartbeat | Agent continuous monitoring + self-healing |

## Open Questions

1. **Hermes license** — Verify Nous Research allows commercial forks with rebranding
2. **Minimax API costs** — What's the cost per agent action? Budget for 100 providers × 1000 actions/day
3. **Local model fallback** — When should the agent use a local model vs cloud? Can we run Qwen3-4B on the provider's GPU alongside inference?
4. **Windows compatibility** — Hermes supports Windows but needs testing for all DCP skills
5. **Tauri integration** — Embed Hermes runtime in Tauri, or run as separate process?
6. **Training data pipeline** — How do we collect and curate agent actions for fine-tuning?
